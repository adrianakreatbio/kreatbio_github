import { NUTRIENTS, PLANT_TARGET, SAMPLE_IDS, emptyTotals, type Nutrient, type NutrientTotals, type SampleId } from './biology';
import { generate, FOOD_TILE, FOOD_ENERGY, H, HOME, index, layer, tileAt, playableTile, surveyForTile, nutrientRevealed, type Tile, type World } from './world';
export const TRACKS = ['digestion', 'energy', 'storage', 'membrane'] as const;
export type Track = typeof TRACKS[number];
export type Upgrades = Record<Track, number>;
export interface Player { x: number; y: number; energy: number; health: number; cargo: Nutrient[]; }
export interface State { world: World; player: Player; upgrades: Upgrades; bank: number; deposited: NutrientTotals; scans: SampleId[]; won: boolean; elapsed: number; trips: number; deaths: number; }
export type ReturnReason = 'energy' | 'membrane' | 'both';
export interface Event { kind: 'dig' | 'food' | 'collect' | 'hurt' | 'deposit' | 'respawn' | 'auto-return' | 'upgrade' | 'scan' | 'win'; x: number; y: number; reason?: ReturnReason; energyRestored?: number; nutrient?: Nutrient; }
export const DIG_SECONDS = [.30, .45, .60];
export const MOVE_SECONDS = .09;
export const VALUES = [10, 10, 10];
export const PRICES: Record<Track, number[]> = { digestion: [60], energy: [80], storage: [60], membrane: [50] };
export const energyMax = (s: State) => [160, 270, 420, 620][s.upgrades.energy];
export const healthMax = (s: State) => [100, 140, 190, 250][s.upgrades.membrane];
export const cargoMax = (s: State) => [10, 16, 24, 34][s.upgrades.storage];
export const energyUse = (s: State) => 10 / cargoMax(s);
export const atHome = (s: State) => s.player.y <= 3 && Math.abs(s.player.x - HOME.x) <= 2;
export const cargoValue = (s: State) => s.player.cargo.length * 10;
export function newGame(seed = Date.now() >>> 0): State {
  return { world: generate(seed), player: { ...HOME, energy: 160, health: 100, cargo: [] }, upgrades: { digestion: 0, energy: 0, storage: 0, membrane: 0 }, bank: 0, deposited: emptyTotals(), scans: [], won: false, elapsed: 0, trips: 0, deaths: 0 };
}
export class Simulation {
  events: Event[] = [];
  progress = 0;
  target = '';
  moveTimer = 0;
  damageTimer = 0;
  facing = { x: 0, y: 1 };
  constructor(public state: State) {}
  collect(n: Nutrient) { this.state.player.cargo.push(n); this.events.push({kind:'collect',x:this.state.player.x,y:this.state.player.y,nutrient:n}); }
  restoreLostCargo() {
    const s=this.state;
    for(const n of s.player.cargo) {
      // Return each lost item to an already surveyed area, preserving finite supply.
      const site=s.world.samples.find(a=>s.scans.includes(a.id)) ?? s.world.samples[0];
      let placed=false;
      for(let radius=1;radius<30&&!placed;radius++)for(let dx=-radius;dx<=radius&&!placed;dx++)for(const dy of [-radius,radius]) {
        const x=site.x+dx,y=site.y+dy,pos=index(x,y);
        if(x<1||x>=39||y<5||y>=99||surveyForTile(s.world,y).id!==site.id||s.world.samples.some(a=>a.x===x&&a.y===y)||s.world.buried?.[pos])continue;
        if([0,1].includes(tileAt(s.world,x,y))){const t=(2+NUTRIENTS.indexOf(n)) as Tile;if(tileAt(s.world,x,y)===0)(s.world.buried??={})[pos]=t;else s.world.tiles[pos]=t;placed=true;break;}
      }
    }
  }
  emit(kind: Event['kind'], reason?: ReturnReason) { this.events.push({ kind, x: this.state.player.x, y: this.state.player.y, ...(reason ? { reason } : {}) }); }
  resetAction() { this.progress = 0; this.target = ''; this.moveTimer = 0; }
  recover() {
    const s = this.state;
    if (s.player.cargo.length) { s.bank += cargoValue(s); for (const n of s.player.cargo) s.deposited[n]++; s.player.cargo = []; s.trips++; this.emit('deposit'); }
    s.player.energy = energyMax(s); s.player.health = healthMax(s);
    if (NUTRIENTS.every(n => s.deposited[n] >= PLANT_TARGET) && s.scans.length === SAMPLE_IDS.length && !s.won) { s.won = true; this.emit('win'); }
  }
  returnFullCargo() {
    const s = this.state;
    s.player.x = HOME.x; s.player.y = HOME.y;
    this.resetAction(); this.damageTimer = 0;
    this.recover(); this.emit('auto-return');
  }
  purchase(track: Track) {
    const s = this.state, level = s.upgrades[track], cost = PRICES[track][level];
    if (!atHome(s) || level >= PRICES[track].length || s.bank < cost || s.won) return false;
    s.bank -= cost; s.upgrades[track]++; this.recover(); this.emit('upgrade'); return true;
  }
  respawn(reason: ReturnReason = this.state.player.energy <= 0 ? (this.state.player.health <= 0 ? 'both' : 'energy') : 'membrane') {
    const s = this.state;
    if (s.world.balanced) this.restoreLostCargo();
    else for (let x = 12; x <= 28; x += 2) {
      const n = NUTRIENTS[(x / 2) % 3];
      if (!s.world.buried?.[index(x,5)] && (s.deposited[n] < PLANT_TARGET || s.bank < 100)) s.world.tiles[index(x, 5)] = (2 + (x / 2) % 3) as 2 | 3 | 4;
    }
    s.player = { ...HOME, energy: energyMax(s), health: healthMax(s), cargo: [] }; s.deaths++;
    this.resetAction(); this.damageTimer = 0; this.emit('respawn', reason);
  }
  nearbySample() {
    return this.state.world.samples.find(site => Math.abs(site.x - this.state.player.x) + Math.abs(site.y - this.state.player.y) <= 1);
  }
  scan(id: SampleId) {
    if (this.state.won || this.state.scans.includes(id) || this.nearbySample()?.id !== id) return false;
    this.state.scans.push(id); this.emit('scan'); return true;
  }
  step(dt: number, dx: number, dy: number) {
    const s = this.state, p = s.player;
    if (s.won) return;
    s.elapsed += dt; this.damageTimer = Math.max(0, this.damageTimer - dt);
    const standing=index(p.x,p.y), found=s.world.buried?.[standing];
    if(found && nutrientRevealed(s.world,s.scans,p.y) && p.cargo.length<cargoMax(s)) { delete s.world.buried![standing];this.collect(NUTRIENTS[found-2]); }
    if (atHome(s)) this.recover();
    if (p.cargo.length >= cargoMax(s) && p.energy > 0 && p.health > 0) { this.returnFullCargo(); return; }
    if (dx && dy) dy = 0;
    if (dx || dy) {
      this.facing = { x: dx, y: dy };
      const x = p.x + dx, y = p.y + dy, t = playableTile(s.world, s.scans, x, y), key = `${x},${y}`;
      if (this.target !== key) { this.progress = 0; this.target = key; }
      const full = t >= 2 && t <= 4 && p.cargo.length >= cargoMax(s);
      if (t !== 6 && !full) {
        if (t === 0 || t === 5 || t === 7 || t === FOOD_TILE || (t>=2 && t<=4 && tileAt(s.world,x,y)===0)) {
          this.moveTimer += dt;
          if (this.moveTimer >= MOVE_SECONDS) {
            this.moveTimer = 0; p.x = x; p.y = y; p.energy -= .38 * energyUse(s);
            if(t>=2 && t<=4){delete s.world.buried![index(x,y)];this.collect(NUTRIENTS[t-2]);}
            if (t === FOOD_TILE) {
              const restored = Math.min(FOOD_ENERGY, energyMax(s) - p.energy);
              p.energy += restored; s.world.tiles[index(x, y)] = 0;
              this.events.push({ kind: 'food', x, y, energyRestored: restored });
            }
          }
        } else {
          this.moveTimer = 0;
          const l = layer(y), duration = DIG_SECONDS[l] / [1, 1.45, 2, 2.7][s.upgrades.digestion];
          const increment = Math.min(dt / duration, 1 - this.progress);
          this.progress += increment;
          p.energy -= increment * [1.8, 3.3, 5.3][l] * energyUse(s);
          if (this.progress >= 1 - 1e-9) {
            const raw=tileAt(s.world,x,y);
            if(t===1 && raw>=2 && raw<=4)(s.world.buried??={})[index(x,y)]=raw;
            s.world.tiles[index(x, y)] = 0; p.x = x; p.y = y; this.progress = 0;
            if (t >= 2 && t <= 4) { this.collect(NUTRIENTS[t - 2]); } else this.emit('dig');
          }
        }
      } else { this.progress = 0; this.moveTimer = 0; }
    } else this.resetAction();
    for (const e of s.world.enemies) {
      e.timer += dt;
      if (e.timer > .65) {
        e.timer = 0;
        const near = Math.abs(e.x - p.x) + Math.abs(e.y - p.y) < 7;
        const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];
        let d = e.dir;
        if (near) d = Math.abs(p.x - e.x) > Math.abs(p.y - e.y) ? (p.x > e.x ? 1 : 3) : (p.y > e.y ? 0 : 2);
        const [ex, ey] = dirs[d];
        if (e.y + ey > 4 && tileAt(s.world, e.x + ex, e.y + ey) === 0) { e.x += ex; e.y += ey; } else e.dir = (e.dir + 1) % 4;
      }
    }
    const hazard = tileAt(s.world, p.x, p.y) === 5 || s.world.enemies.some(e => e.x === p.x && e.y === p.y);
    if (hazard && this.damageTimer === 0 && !atHome(s)) { p.health -= 18 / (1 + s.upgrades.membrane * .5); this.damageTimer = .8; this.emit('hurt'); }
    if (p.energy <= 0 || p.health <= 0) this.respawn();
    else if (p.cargo.length >= cargoMax(s)) this.returnFullCargo();
    else if (atHome(s)) this.recover();
  }
}
