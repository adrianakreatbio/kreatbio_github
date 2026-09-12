import { it, expect } from 'vitest';
import { Simulation, newGame, atHome, cargoMax, energyMax, healthMax } from '../src/simulation';
import { HOME, index } from '../src/world';
import { SAMPLE_IDS } from '../src/biology';
it('delivers the final cargo item once, at every storage level, without counting a death',()=>{
 for(const level of [0,1,2,3]) {
  const s=newGame(21),sim=new Simulation(s);s.scans=[...SAMPLE_IDS];s.upgrades.storage=level;s.player={x:20,y:10,energy:100,health:70,cargo:Array(cargoMax(s)-1).fill('N')};
  s.world.tiles[index(20,10)]=0;s.world.tiles[index(21,10)]=3;
  sim.step(.3,1,0);
  expect(s.player.x).toBe(HOME.x);expect(s.player.y).toBe(HOME.y);expect(s.player.cargo).toHaveLength(0);
  expect(s.deposited.N).toBe(cargoMax(s)-1);expect(s.deposited.P).toBe(1);expect(s.bank).toBe(cargoMax(s)*10);
  expect(s.player.energy).toBe(energyMax(s));expect(s.player.health).toBe(healthMax(s));expect(s.deaths).toBe(0);expect(s.trips).toBe(1);
  expect(sim.progress).toBe(0);expect(sim.target).toBe('');expect(sim.moveTimer).toBe(0);
  sim.step(.1,0,0);expect(s.trips).toBe(1);expect(sim.events.filter(e=>e.kind==='auto-return')).toHaveLength(1);
 }
});
it('can win via automatic delivery while preserving completed scans',()=>{
 const s=newGame(21),sim=new Simulation(s);s.player.y=10;s.world.tiles[index(20,10)]=0;s.world.tiles[index(21,10)]=4;
 s.player.cargo=Array(9).fill('N');s.deposited={N:12,P:12,K:11};s.scans=[...SAMPLE_IDS];
 sim.step(.3,1,0);expect(s.won).toBe(true);expect(s.deposited.K).toBe(12);expect(s.scans).toEqual(SAMPLE_IDS);
});
it('keeps zero-vitals failure distinct from a safe full-cargo delivery',()=>{
 const s=newGame(21),sim=new Simulation(s);s.player.y=10;s.world.tiles[index(20,10)]=0;s.player.cargo=Array(10).fill('N');s.player.energy=0;
 sim.step(.1,0,0);expect(atHome(s)).toBe(true);expect(s.deaths).toBe(1);expect(s.bank).toBe(0);expect(s.deposited.N).toBe(0);
 expect(sim.events.some(e=>e.kind==='auto-return')).toBe(false);
});
