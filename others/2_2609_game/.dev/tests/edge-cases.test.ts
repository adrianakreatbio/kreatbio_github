import { it, expect } from 'vitest';
import { Simulation, newGame, atHome, healthMax, DIG_ENERGY, DIG_SECONDS, MOVE_SECONDS } from '../src/simulation';
import { index, HOME, tileAt } from '../src/world';
import { NUTRIENTS, SAMPLE_IDS, SURVEY_IDS } from '../src/biology';
import { valid, save, load, SAVE_KEY, BACKUP_KEY } from '../src/persistence';
it('recovers all missing nutrient types after repeated total resource losses', () => {
  const s = newGame(2); s.world.balanced=false; const sim = new Simulation(s);
  for (let attempt = 0; attempt < 5; attempt++) {
    s.world.tiles = s.world.tiles.map(t => t >= 2 && t <= 4 ? 0 : t);
    s.player.y = 10; s.player.health = 0; sim.step(1 / 60, 0, 0);
    expect(atHome(s)).toBe(true); expect(s.player.health).toBe(healthMax(s));
    for (const t of [2,3,4]) expect(s.world.tiles.filter(v => v === t).length).toBeGreaterThanOrEqual(3);
  }
  expect(s.bank).toBe(0); expect(s.deaths).toBe(5);
});
it('digging is fast, charges once and respects upgraded timing in every layer', () => {
  for (const [layer, y] of [10,40,75].entries()) for (const level of [0,3]) {
    const s = newGame(3), sim = new Simulation(s); s.upgrades.digestion = level;
    s.scans=[...SAMPLE_IDS]; s.player.y = y; s.world.tiles[index(20,y)] = 0; s.world.tiles[index(21,y)] = 2; s.world.tiles[index(22,y)] = 6;
    const seconds = DIG_SECONDS[layer] / [1,1.45,2,2.7][level];
    let frames = 0; while (s.player.x === 20 && frames++ < 100) sim.step(1/60,1,0);
    expect(frames / 60).toBeLessThanOrEqual(seconds + 1/60);
    expect(frames / 60).toBeGreaterThanOrEqual(seconds - 1e-9);
    expect(s.player.cargo).toEqual(['N']); expect(s.player.energy).toBeCloseTo(160 - DIG_ENERGY[layer],6);
    for (let i=0;i<60;i++) sim.step(1/60,1,0);
    expect(s.player.cargo).toEqual(['N']);
  }
});
it('moves through tunnels in 0.1 seconds or less and turns without old dig progress', () => {
  const s = newGame(8), sim = new Simulation(s); s.player.y=10;
  s.world.tiles[index(20,10)]=0; s.world.tiles[index(21,10)]=0;
  for(let i=0;i<6;i++) sim.step(1/60,1,0);
  expect(s.player.x).toBe(21); expect(MOVE_SECONDS).toBe(.09);
  s.world.tiles[index(22,10)]=1; s.world.tiles[index(21,11)]=1;
  sim.step(.1,1,0); sim.step(1/60,0,1);
  expect(sim.progress).toBeCloseTo((1/60)/DIG_SECONDS[0]);
});
it('scans require proximity, happen once and survive failure and reload', () => {
  const s = newGame(4), sim = new Simulation(s), site=s.world.samples[0];
  expect(sim.scan(site.id)).toBe(false);
  s.player.x=site.x;s.player.y=site.y;
  expect(sim.scan(site.id)).toBe(true); expect(sim.scan(site.id)).toBe(false);
  s.deposited={N:3,P:5,K:7};s.player.cargo=['N'];sim.respawn();
  expect(s.scans).toEqual([site.id]);expect(s.deposited).toEqual({N:3,P:5,K:7});
  const values=new Map<string,string>();const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};
  expect(save(storage,s)).toBe(true); expect(load(storage).state).toEqual(s);expect(valid(s)).toBe(true);
});
it('migrates a legacy expedition without losing progress and backs up the original', () => {
  const old:any=newGame(19);delete old.deposited;delete old.scans;delete old.world.samples;
  old.world.tiles=old.world.tiles.map((t:number)=>t===8||t===9?1:t);old.fragment=false;old.world.tiles[index(HOME.x,97)]=7;old.player.cargo=[8,18,35];old.bank=123;old.upgrades.energy=2;old.elapsed=500;
  const raw=JSON.stringify({version:1,state:old}), values=new Map([[SAVE_KEY,raw]]);
  const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};
  const result=load(storage), s=result.state!;
  expect(valid(s)).toBe(true);expect(s.player.cargo).toEqual(NUTRIENTS);expect(s.bank).toBe(123);expect(s.upgrades.energy).toBe(2);expect(s.elapsed).toBe(500);
  expect(s.scans).toEqual([]);expect(s.deposited).toEqual({N:0,P:0,K:0});expect(values.get(BACKUP_KEY)).toBe(raw);
});
it('guarantees ten reachable samples with strictly stratified survey areas across 100 seeds',()=>{
  for(let seed=0;seed<100;seed++) {
    const s=newGame(seed);
    expect([...s.world.samples.map(site=>site.id)].sort()).toEqual([...SAMPLE_IDS].sort());
    for(const site of s.world.samples) {
      expect(tileAt(s.world,site.x,site.y)).toBe(0);
      for(let x=Math.min(site.x,HOME.x);x<=Math.max(site.x,HOME.x);x++) expect([5,6]).not.toContain(tileAt(s.world,x,site.y));
      for(let y=3;y<=site.y;y++)expect([5,6]).not.toContain(tileAt(s.world,HOME.x,y));
    }
    const trio=s.world.samples.filter(a=>(SURVEY_IDS as readonly string[]).includes(a.id)).sort((a,b)=>a.y-b.y);
    trio.forEach((site,i)=>{
      const counts=[0,0,0];s.world.tiles.forEach((t,pos)=>{if(t>=2&&t<=4&&Math.abs(Math.floor(pos/40)-site.y)<=5)counts[t-2]++;});
      expect(counts[i]).toBeGreaterThanOrEqual(12);
    });
  }
});

it('reports the actual reason before refilling vitals on forced return', () => {
  for (const reason of ['energy', 'membrane', 'both'] as const) {
    const s = newGame(17), sim = new Simulation(s);
    s.player.y = 10; s.world.tiles[index(20,10)] = 0;
    s.player.energy = reason === 'membrane' ? 100 : 0;
    s.player.health = reason === 'energy' ? 100 : 0;
    s.player.cargo = ['N']; s.deposited.N = 4; s.scans = ['root-partner'];
    sim.step(1/60,0,0);
    expect(sim.events.find(e => e.kind === 'respawn')?.reason).toBe(reason);
    expect(atHome(s)).toBe(true);expect(s.player.cargo).toEqual([]);
    expect(s.deposited.N).toBe(4);expect(s.scans).toEqual(['root-partner']);
  }
});
