import {it,expect} from 'vitest';
import {Simulation,newGame,PRICES,energyUse} from '../src/simulation';
import {nutrientRevealed,playableTile,index,tileAt} from '../src/world';
import {save,load} from '../src/persistence';
it('varies sample positions and discovery order, with safe surveyed bypasses',()=>{
 const layouts=new Set<string>();const orders=new Set<string>();
 for(let seed=0;seed<100;seed++) {
  const s=newGame(seed);layouts.add(JSON.stringify(s.world.samples));orders.add(s.world.samples.map(a=>a.id).join());
  for(const site of s.world.samples){for(let dy=-2;dy<=3;dy++)expect([5,6]).not.toContain(tileAt(s.world,site.x,site.y+dy));for(let dx=0;dx<=4;dx++)expect([5,6]).not.toContain(tileAt(s.world,site.x+dx,site.y+3));}
 }
 expect(layouts.size).toBeGreaterThan(90);expect(orders.size).toBe(6);
});
it('scan unlocks existing deposits and persists without creating nutrient tiles',()=>{
 const s=newGame(91),sim=new Simulation(s),site=s.world.samples[0];
 expect(!nutrientRevealed(s.world,s.scans,site.y)).toBe(true);
 s.player.x=site.x;s.player.y=site.y;const tiles=[...s.world.tiles];sim.scan(site.id);
 expect(!nutrientRevealed(s.world,s.scans,site.y)).toBe(false);expect(s.world.tiles).toEqual(tiles);
 let raw='';const db={getItem:()=>raw,setItem:(_k:string,v:string)=>{raw=v;},removeItem:()=>{}};
 save(db,s);expect(load(db).state?.scans).toEqual([site.id]);
});
it('storage extends energy endurance, and every upgrade is affordable within the mission',()=>{
 const base=newGame(9),upgraded=newGame(9);upgraded.upgrades.storage=1;
 for(const s of [base,upgraded]){s.player.y=10;s.world.tiles[index(20,10)]=0;s.world.tiles[index(21,10)]=1;new Simulation(s).step(.3,1,0);}
 expect(160-upgraded.player.energy).toBeCloseTo((160-base.player.energy)*energyUse(upgraded));
 expect(Object.values(PRICES).flat().reduce((a,b)=>a+b,0)).toBeLessThanOrEqual(360);
 // Existing multi-level saves keep their earned abilities.
 upgraded.upgrades.storage=3;let raw='';const db={getItem:()=>raw,setItem:(_k:string,v:string)=>{raw=v;},removeItem:()=>{}};save(db,upgraded);expect(load(db).state?.upgrades.storage).toBe(3);
});

it('requires each area scan before any nutrient is visible or collectible',()=>{
 for(let seed=0;seed<30;seed++) {
  const s=newGame(seed),sim=new Simulation(s);
  expect(s.world.samples[0]).toMatchObject({x:20,y:4});
  const deposits=s.world.tiles.flatMap((t,i)=>t>=2&&t<=4?[i]:[]);
  expect(deposits.length).toBe(48);
  for(const i of deposits)expect(playableTile(s.world,s.scans,i%40,Math.floor(i/40))).toBe(1);
  s.player.y=3;expect(sim.scan(s.world.samples[0].id)).toBe(true);
  expect(nutrientRevealed(s.world,s.scans,5)).toBe(true);
  for(const site of s.world.samples.slice(1)) expect(nutrientRevealed(s.world,s.scans,site.y)).toBe(false);
  for(const site of s.world.samples.slice(1)){s.player.x=site.x;s.player.y=site.y;sim.scan(site.id);}
  for(const i of deposits)expect(playableTile(s.world,s.scans,i%40,Math.floor(i/40))).toBe(s.world.tiles[i]);
 }
});
it('digging before a scan yields no cargo, while recovery stays locked until scanning',()=>{
 const s=newGame(7),sim=new Simulation(s);s.player.y=10;s.world.tiles[index(20,10)]=0;s.world.tiles[index(21,10)]=2;
 sim.step(.3,1,0);expect(s.player.x).toBe(21);expect(s.player.cargo).toEqual([]);expect(s.world.tiles[index(21,10)]).toBe(0);
 expect(s.world.buried?.[index(21,10)]).toBe(2);sim.respawn();expect(playableTile(s.world,s.scans,21,10)).toBe(0);
 s.player.y=3;sim.scan(s.world.samples[0].id);expect(playableTile(s.world,s.scans,21,10)).toBe(2);
});
it('migrates v3 progress with a reachable first sample and persists v4 reveal state',()=>{
 const s=newGame(9);s.world.samples[0].x=22;s.world.samples[0].y=15;s.world.tiles[index(22,15)]=0;s.bank=70;s.deposited.N=4;s.scans=[s.world.samples[1].id];
 let raw=JSON.stringify({version:3,state:s});const db={getItem:()=>raw,setItem:(_k:string,v:string)=>{raw=v;},removeItem:()=>{}};
 const migrated=load(db).state!;expect(migrated.bank).toBe(70);expect(migrated.deposited.N).toBe(4);expect(migrated.scans).toEqual(s.scans);expect(migrated.world.samples[0]).toMatchObject({x:20,y:4});
 expect(nutrientRevealed(migrated.world,migrated.scans,5)).toBe(false);save(db,migrated);expect(JSON.parse(raw).version).toBe(5);expect(load(db).state).toEqual(migrated);
});
