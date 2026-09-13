import { it, expect } from 'vitest';
import { Simulation, newGame, energyMax, VALUES } from '../src/simulation';
import { DEEP_K_POCKETS, index, layer, surveyForTile } from '../src/world';
import { load, save, valid } from '../src/persistence';
import { SAMPLE_IDS } from '../src/biology';
it('adds exactly the deep potassium pockets below the deepest survey, and water only in the deep layer, across 100 seeds',()=>{
 for(let seed=0;seed<100;seed++){
  const s=newGame(seed);
  const deepK=s.world.tiles.flatMap((t,i)=>t===4&&Math.floor(i/40)>=78?[i]:[]);
  expect(deepK.length).toBe(DEEP_K_POCKETS);
  const deepestSite=[...s.world.samples].sort((a,b)=>b.y-a.y)[0];
  for(const i of deepK)expect(surveyForTile(s.world,Math.floor(i/40)).id).toBe(deepestSite.id);
  s.world.tiles.forEach((t,i)=>{if(t===9)expect(layer(Math.floor(i/40))).toBe(2);});
 }
});
it('stratifies deposits: nitrogen-rich topsoil area, phosphorus-rich subsoil, potassium-rich deep area',()=>{
 for(const seed of [7,91,2609]){
  const s=newGame(seed);
  const zones=s.world.samples.map(site=>{const c=[0,0,0];s.world.tiles.forEach((t,i)=>{if(t>=2&&t<=4&&surveyForTile(s.world,Math.floor(i/40)).id===site.id)c[t-2]++;});return {y:site.y,c};});
  zones.sort((a,b)=>a.y-b.y);
  expect(zones[0].c[0]).toBeGreaterThan(zones[0].c[1]);
  expect(zones[1].c[1]).toBeGreaterThan(zones[1].c[0]);
  expect(zones[2].c[2]).toBeGreaterThan(zones[2].c[0]);
 }
});
it('deeper finds pay more research credits on delivery',()=>{
 const s=newGame(5),sim=new Simulation(s);s.scans=s.world.samples.map(a=>a.id);
 s.player.x=20;s.player.y=80;s.world.tiles[index(20,80)]=0;s.world.tiles[index(21,80)]=4;
 sim.step(.6,1,0);
 expect(s.player.cargo).toEqual(['K']);expect(s.player.cargoValues).toEqual([VALUES[2]]);
 s.player.x=20;s.player.y=2;sim.step(1/60,0,0);
 expect(s.bank).toBe(VALUES[2]);expect(s.deposited.K).toBe(1);
});
it('waterlogged pockets are passable without digging but stress the microbe, less with armor',()=>{
 const s=newGame(5),sim=new Simulation(s);s.player.y=80;s.world.tiles[index(20,80)]=0;s.world.tiles[index(21,80)]=9;
 sim.step(.1,1,0);
 expect(s.player.x).toBe(21);expect(s.player.health).toBeCloseTo(92);
 const a=newGame(5),sa=new Simulation(a);a.upgrades.membrane=1;a.player.y=80;a.world.tiles[index(20,80)]=0;a.world.tiles[index(21,80)]=9;
 sa.step(.1,1,0);expect(a.player.health).toBeCloseTo(100-8/1.5);
});
it('flags a close-call delivery and records the deepest dive',()=>{
 const s=newGame(5),sim=new Simulation(s);
 s.player={x:20,y:2,energy:10,health:50,cargo:['N'],cargoValues:[10]};
 sim.step(1/60,0,0);
 expect(sim.events.find(e=>e.kind==='deposit')?.closeCall).toBe(true);
 expect(s.player.energy).toBe(energyMax(s));
 s.player.y=50;s.world.tiles[index(20,50)]=0;sim.step(1/60,0,0);
 expect(s.deepest).toBe(47);
});
it('keeps playing after victory: movement, collection and purchases continue without re-winning',()=>{
 const s=newGame(21),sim=new Simulation(s);s.scans=[...SAMPLE_IDS];s.deposited={N:12,P:12,K:12};
 sim.step(1/60,0,0);expect(s.won).toBe(true);
 s.bank=1000;expect(sim.purchase('energy')).toBe(true);
 s.player.y=10;s.world.tiles[index(20,10)]=0;s.world.tiles[index(21,10)]=2;
 sim.step(.3,1,0);expect(s.player.cargo).toEqual(['N']);
 expect(sim.events.filter(e=>e.kind==='win')).toHaveLength(1);
});
it('migrates v5 saves with a notice and validates the new fields strictly',()=>{
 const s=newGame(9);delete (s as any).deepest;delete (s.player as any).cargoValues;
 let raw=JSON.stringify({version:5,state:s});
 const db={getItem:()=>raw,setItem:(_k:string,v:string)=>{raw=v;},removeItem:()=>{}};
 const first=load(db);
 expect(valid(first.state)).toBe(true);expect(first.message.length).toBeGreaterThan(0);
 save(db,first.state!);expect(JSON.parse(raw).version).toBe(6);expect(load(db).state).toEqual(first.state);
 const bad=newGame(9);(bad.player as any).cargoValues=[10];expect(valid(bad)).toBe(false);
 const worse=newGame(9);(worse as any).deepest=-2;expect(valid(worse)).toBe(false);
});
