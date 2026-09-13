import {it,expect} from 'vitest';
import {newGame,Simulation} from '../src/simulation';
import {index,playableTile,surveyForTile,tileAt} from '../src/world';
import {save,load,valid,VERSION} from '../src/persistence';
const inventory=(s:ReturnType<typeof newGame>)=>[2,3,4].map(t=>s.world.tiles.filter(x=>x===t).length+Object.values(s.world.buried??{}).filter(x=>x===t).length+s.player.cargo.filter(n=>n===['N','P','K'][t-2]).length+s.deposited[(['N','P','K'] as const)[t-2]]);
it('makes every area necessary, keeps enough supply, and offers safe access across 100 seeds',()=>{
 for(let seed=0;seed<100;seed++) {
  const s=newGame(seed),zones=s.world.samples.map(site=>{const c=[0,0,0];s.world.tiles.forEach((t,i)=>{if(t>=2&&t<=4&&surveyForTile(s.world,Math.floor(i/40)).id===site.id)c[t-2]++;});return c;});
  expect(inventory(s)).toEqual([16,16,26]);
  for(let omitted=0;omitted<3;omitted++){const available=[0,0,0];zones.forEach((z,i)=>{if(i!==omitted)z.forEach((v,n)=>available[n]+=v);});expect(available.some(v=>v<12)).toBe(true);}
  for(const site of s.world.samples){for(let dy=0;dy<=5;dy++)expect([5,6]).not.toContain(tileAt(s.world,site.x,site.y+dy));for(let dx=0;dx<=7;dx++)expect([5,6]).not.toContain(tileAt(s.world,site.x+dx,site.y+5));}
  expect(valid(s)).toBe(true);
 }
});
it('preserves a dug hidden deposit across reload, then collects it once without trapping the player',()=>{
 const s=newGame(7),sim=new Simulation(s);s.world.tiles[index(20,10)]=0;s.world.tiles[index(21,10)]=2;s.player.y=10;
 sim.step(.3,1,0);expect(s.player.cargo).toEqual([]);expect(playableTile(s.world,s.scans,21,10)).toBe(0);expect(s.world.buried?.[index(21,10)]).toBe(2);
 let raw='';const db={getItem:()=>raw,setItem:(_k:string,v:string)=>{raw=v;},removeItem:()=>{}};save(db,s);const restored=load(db).state!;expect(restored).toEqual(s);
 restored.scans=[restored.world.samples[0].id];const resumed=new Simulation(restored);resumed.step(.1,0,0);expect(restored.player.cargo).toEqual(['N']);resumed.step(.1,0,0);expect(restored.player.cargo).toEqual(['N']);expect(valid(restored)).toBe(true);
});
it('returns lost cargo without inflating total supply or awarding credits',()=>{
 const s=newGame(11),sim=new Simulation(s);s.scans=s.world.samples.map(a=>a.id);const before=inventory(s);
 for(let attempt=0;attempt<5;attempt++) {
  const pos=s.world.tiles.findIndex(t=>t===2);s.world.tiles[pos]=0;s.player.cargo=['N'];s.player.y=12;sim.respawn();expect(inventory(s)).toEqual(before);expect(s.bank).toBe(0);expect(s.deposited.N).toBe(0);expect(valid(s)).toBe(true);
 }
});
it('rejects malformed buried deposits and retains legacy progress',()=>{
 const s=newGame(19);s.world.buried={[index(0,3)]:2};expect(valid(s)).toBe(false);
 delete s.world.buried;s.bank=99;s.deposited.N=5;const raw=JSON.stringify({version:4,state:s});const db={getItem:()=>raw,setItem:()=>{},removeItem:()=>{}};expect(load(db).state?.bank).toBe(99);expect(load(db).state?.deposited.N).toBe(5);expect(VERSION).toBe(6);
});
it('legacy recovery does not overwrite preserved hidden deposits',()=>{
 const s=newGame(77);s.world.balanced=false;s.world.tiles[index(12,5)]=0;s.world.buried={[index(12,5)]:3};const sim=new Simulation(s);sim.respawn();
 expect(s.world.tiles[index(12,5)]).toBe(0);expect(s.world.buried[index(12,5)]).toBe(3);expect(valid(s)).toBe(true);
});
it('armor makes the optional hazard route less costly without making it mandatory',()=>{
 const s=newGame(31);s.upgrades.membrane=1;s.player.y=10;s.world.tiles[index(20,10)]=5;new Simulation(s).step(.1,0,0);expect(s.player.health).toBe(88);
});
