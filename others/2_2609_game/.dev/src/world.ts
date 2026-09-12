import { MICROBES, SAMPLE_IDS, type SampleId } from './biology';
export const W =  40;

export const H = 100;
export const SURFACE = 3;
export const HOME = { x: 20, y: 2 };
export type Tile = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; // air, soil, N, P, K, fictional hazard, rock, legacy fragment, energy food
export interface Enemy { x: number; y: number; dir: number; timer: number; }
export interface SampleSite { id: SampleId; x: number; y: number; }
export const CHALLENGES = ['Explore freely', 'No cargo losses', 'At most 4 deliveries'] as const;
export interface World { buried?: Record<number, Tile>; balanced?: boolean; challenge?: number; seed: number; tiles: Tile[]; enemies: Enemy[]; samples: SampleSite[]; }
export const index = (x: number, y: number) => y * W + x;
export const layer = (y: number) => y < 34 ? 0 : y < 67 ? 1 : 2;
export function random(seed: number) {
  let s = seed >>> 0;
  return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function tileAt(w: World, x: number, y: number): Tile {
  if (x < 0 || x >= W || y < 0 || y >= H) return 6;
  return w.tiles[index(x, y)];
}
export function generate(seed: number): World {
  const r = random(seed), tiles: Tile[] = Array(W * H).fill(6), enemies: Enemy[] = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    let t: Tile = 0;
    if (y > SURFACE) {
      const n = r(), l = layer(y);
      t = n < .035 ? 6 : n < .035 + l * .025 ? 5 : n < .29 ? (2 + Math.floor(r() * 3)) as Tile : n > .96 ? 0 : 1;
    }
    tiles[index(x, y)] = t;
  }
  // A buried, hazard-free spine guarantees access without gifting an open shaft.
  for (let y = SURFACE + 1; y < H - 1; y++) tiles[index(HOME.x, y)] = y % 7 === 0 ? (2 + y % 3) as Tile : 1;
  // Early food can always finance a recovery trip.
  for (let x = 12; x <= 28; x += 2) tiles[index(x, 5)] = (2 + (x / 2) % 3) as Tile;
  for (let y = 39; y < 96; y += 8) {
    const x = 3 + Math.floor(r() * 12) + (r() > .5 ? 20 : 0);
    for (let dx = -1; dx <= 1; dx++) tiles[index(x + dx, y)] = 0;
    enemies.push({ x, y, dir: Math.floor(r() * 4), timer: 0 });
  }
  const world: World = { seed: seed >>> 0, tiles, enemies, samples: [] };
  addSamples(world);
  addEnergyFood(world);
  balanceDeposits(world);
  world.challenge=seed%3;
  return world;
}

// A safe vertical route remains available even when importing an old expedition.
export function addSamples(world: World, player?: { x: number; y: number }) {
  const rng = random(world.seed ^ 0x51a7);
  const ids = [...SAMPLE_IDS];
  for (let i=ids.length-1;i>0;i--) { const j=Math.floor(rng()*(i+1)); [ids[i],ids[j]]=[ids[j],ids[i]]; }
  world.samples = ids.map((id, i) => i === 0 ? { id, x: HOME.x, y: 4 } : ({ id, x: HOME.x + Math.floor(rng()*7)-3, y: [4,40,67][i] + Math.floor(rng()*7)-3 }));
  for (let y = 4; y <= 74; y++) {
    const pos = index(HOME.x, y);
    if ([5, 6, 7].includes(world.tiles[pos])) world.tiles[pos] = 1;
  }
  world.samples.forEach(site => {
    // Reach each sample from the safe spine; no impassable random rock wall.
    for(let x=Math.min(site.x, HOME.x);x<=Math.max(site.x, HOME.x);x++) world.tiles[index(x,site.y)] = 1;
    world.tiles[index(site.x, site.y)] = 0;
    // Each patch guarantees enough of its featured nutrient without blocking its spine.
    for (let dy = -2; dy <= 2; dy++) for (let dx = 1; dx <= 4; dx++) {
      const x = site.x + dx, y = site.y + dy;
      if (y <= SURFACE || (player?.x === x && player.y === y)) continue;
      world.tiles[index(x, y)] = (MICROBES[site.id].nutrient === 'N' ? 2 : MICROBES[site.id].nutrient === 'P' ? 3 : 2 + Math.floor(rng()*3)) as Tile;
    }
    if (site.id === 'root-risk') for (let dy = -2; dy <= 2; dy++) {
      const x = site.x - 3, y = site.y + dy;
      if (y > 4 && x !== HOME.x && (player?.x !== x || player.y !== y)) world.tiles[index(x, y)] = 5;
    }
  });
  // A guaranteed bypass below each patch makes the survey route truthful.
  for (const site of world.samples) {
    for (let dy=-2;dy<=3;dy++) {
      const pos=index(site.x,site.y+dy);
      if ([5,6].includes(world.tiles[pos])) world.tiles[pos]=1;
    }
    for(let dx=0;dx<=4;dx++) {
      const pos=index(site.x+dx,site.y+3);
      if ([5,6].includes(world.tiles[pos])) world.tiles[pos]=1;
    }
  }
  world.enemies = world.enemies.filter(e => Math.abs(e.x - HOME.x) > 5);
}

export const FOOD_TILE = 8;
export const FOOD_ENERGY = 30;
// Six finite refills, one near the start and the others beside the main route.
// Called only for a new world or an older save migration, never on respawn/load of v3.
export function addEnergyFood(world: World, player?: { x: number; y: number }) {
  for (const y of [7, 22, 35, 49, 62, 77]) {
    let x = player?.x === HOME.x - 1 && player.y === y ? HOME.x + 1 : HOME.x - 1;
    if (world.samples.some(site=>site.x===x && site.y===y)) x = HOME.x + 1;
    world.tiles[index(x, y)] = FOOD_TILE;
  }
}

// Every depth belongs to one survey. Scanning unlocks its existing deposits.
export function surveyForTile(world: World, y: number): SampleSite {
  return world.samples.reduce((nearest, site) => Math.abs(site.y-y)<Math.abs(nearest.y-y) ? site : nearest);
}
export function nutrientRevealed(world: World, scans: SampleId[], y: number) {
  return scans.includes(surveyForTile(world,y).id);
}
export function playableTile(world: World, scans: SampleId[], x: number, y: number): Tile {
  const tile=world.buried?.[index(x,y)] ?? tileAt(world,x,y);
  return tile>=2 && tile<=4 && !nutrientRevealed(world,scans,y) ? tileAt(world,x,y)===0 ? 0 : 1 : tile;
}
export function placeFirstSampleAtHome(world: World) {
  const first=[...world.samples].sort((a,b)=>a.y-b.y)[0];
  first.x=HOME.x;first.y=4;world.tiles[index(HOME.x,4)]=0;
}

// Bounded supplies make every survey useful: no two areas can finish 12 each.
// Different arrangements change which nutrient the next trip should prioritize.
export function balanceDeposits(world: World) {
  world.tiles=world.tiles.map(t=>t>=2&&t<=4?1:t);
  world.buried={};world.balanced=true;
  const budgets=[[5,4,3],[4,6,4],[7,6,9]];
  const shift=world.seed%3;
  world.samples.forEach((site,i)=>{
    const rng=random(world.seed ^ (i+1)*731);
    const values: Tile[]=[];
    for(let n=0;n<3;n++)for(let j=0;j<budgets[i][n];j++)values.push((2+(n+shift)%3) as Tile);
    for(let j=values.length-1;j>0;j--){const k=Math.floor(rng()*(j+1));[values[j],values[k]]=[values[k],values[j]];}
    let j=0;
    for(let dy=1;dy<=4;dy++)for(let dx=1;dx<=6;dx++){
      const pos=index(site.x+dx,site.y+dy);
      if(j<values.length && world.tiles[pos]!==8)world.tiles[pos]=values[j++];
    }
    // A clear perimeter avoids the optional short route through pink hazards.
    for(let dy=0;dy<=5;dy++)if(world.tiles[index(site.x,site.y+dy)]!==8)world.tiles[index(site.x,site.y+dy)]=dy===0?0:1;
    for(let dx=0;dx<=7;dx++)world.tiles[index(site.x+dx,site.y+5)]=1;
    for(let dy=0;dy<=5;dy++)world.tiles[index(site.x+7,site.y+dy)]=1;
    if(i>0){for(let dx=1;dx<=5;dx++)if(site.x+dx>Math.max(HOME.x,site.x))world.tiles[index(site.x+dx,site.y)]=5;world.tiles[index(site.x+6,site.y)]=0;}
  });
}
