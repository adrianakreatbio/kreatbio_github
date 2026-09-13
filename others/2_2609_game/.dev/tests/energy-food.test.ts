import { expect, it } from 'vitest';
import { Simulation, newGame, energyMax, cargoMax } from '../src/simulation';
import { FOOD_TILE, FOOD_ENERGY, HOME, index, tileAt } from '../src/world';
import { load, save, valid, SAVE_KEY, VERSION } from '../src/persistence';
const storage = () => { const values = new Map<string,string>(); return { getItem: (k:string) => values.get(k) ?? null, setItem: (k:string,v:string) => {values.set(k,v);}, removeItem: (k:string) => {values.delete(k);} }; };
it('places three reachable topsoil food blocks, including one near the start, across 100 seeds', () => {
 for(let seed=0;seed<100;seed++) {
  const s=newGame(seed), food=s.world.tiles.flatMap((t,i)=>t===FOOD_TILE?[i]:[]);
  expect(food).toHaveLength(3);expect(tileAt(s.world,19,7)).toBe(FOOD_TILE);
  for(const id of food) {
   const y=Math.floor(id/40); expect(y).toBeLessThan(34); expect(s.world.samples.some(site=>index(site.x,site.y)===id)).toBe(false);
   for(let row=4;row<=y;row++)expect([5,6]).not.toContain(tileAt(s.world,HOME.x,row));
  }
  expect(valid(s)).toBe(true);
 }
});
it('restores energy immediately with nearly full cargo and near-zero energy, without changing plant resources',()=>{
 const s=newGame(9),sim=new Simulation(s);s.player={x:20,y:7,energy:.01,health:80,cargo:Array(cargoMax(s)-1).fill('N')};s.world.tiles[index(20,7)]=0;s.bank=123;
 sim.step(.1,-1,0);
 expect(s.player.x).toBe(19);expect(s.player.energy).toBeCloseTo(.01-.38+FOOD_ENERGY);expect(s.deaths).toBe(0);
 expect(s.player.health).toBe(80);expect(s.player.cargo).toHaveLength(9);expect(s.bank).toBe(123);expect(s.deposited).toEqual({N:0,P:0,K:0});
 expect(tileAt(s.world,19,7)).toBe(0);expect(sim.events.find(e=>e.kind==='food')?.energyRestored).toBe(30);
});
it('caps refills at the upgraded energy maximum and never awards the same food twice',()=>{
 const s=newGame(9),sim=new Simulation(s);s.upgrades.energy=2;s.player.x=20;s.player.y=7;s.player.energy=energyMax(s)-1;s.world.tiles[index(20,7)]=0;
 sim.step(.1,-1,0);expect(s.player.energy).toBe(energyMax(s));
 sim.step(.1,1,0);sim.step(.1,-1,0);expect(s.player.energy).toBeCloseTo(energyMax(s)-.76);
 expect(sim.events.filter(e=>e.kind==='food')).toHaveLength(1);
 const db=storage();save(db,s);const loaded=load(db).state!;expect(loaded.world.tiles.filter(t=>t===8)).toHaveLength(2);
 new Simulation(loaded).respawn();expect(loaded.world.tiles.filter(t=>t===8)).toHaveLength(2);
});
it('adds food to v2 saves once while preserving player, cleared tunnels, progress and completed scans',()=>{
 const s=newGame(77);s.world.tiles=s.world.tiles.map(t=>t===8||t===9?0:t);s.player.x=19;s.player.y=7;s.player.energy=50;s.bank=70;s.deposited={N:4,P:5,K:6};s.scans=['root-partner'];
 const db=storage();db.setItem(SAVE_KEY,JSON.stringify({version:2,state:s}));
 const migrated=load(db).state!;expect(valid(migrated)).toBe(true);expect(migrated.player).toEqual(s.player);expect(migrated.deposited).toEqual(s.deposited);expect(migrated.scans).toEqual(s.scans);expect(migrated.bank).toBe(70);
 expect(tileAt(migrated.world,19,7)).toBe(0);expect(tileAt(migrated.world,21,7)).toBe(8);
 expect(migrated.world.tiles.filter(t=>t===8)).toHaveLength(3);
 migrated.world.tiles[index(21,7)]=0;save(db,migrated);expect(JSON.parse(db.getItem(SAVE_KEY)!).version).toBe(VERSION);
 expect(load(db).state!.world.tiles.filter(t=>t===8)).toHaveLength(2);
});
