import { NUTRIENTS, SAMPLE_IDS } from '../src/biology';
import { describe, it, expect } from 'vitest';
import { generate, W, H, HOME, index, tileAt } from '../src/world';
import { Simulation, newGame, atHome, cargoMax, energyMax, healthMax, PRICES, TRACKS } from '../src/simulation';
import { load, save, valid, SAVE_KEY, VERSION } from '../src/persistence';
function walk(sim: Simulation, dx: number, dy: number, seconds = 10) {
  const p = { ...sim.state.player };
  for (let i = 0; i < seconds * 60; i++) { sim.step(1 / 60, dx, dy); if (sim.state.player.x !== p.x || sim.state.player.y !== p.y) return; }
}
function underground() { const sim = new Simulation(newGame(42)); sim.state.scans=[...SAMPLE_IDS]; sim.state.player.y = 10; sim.state.world.tiles[index(20, 10)] = 0; return sim; }
describe('world generation', () => {
  it('is seeded and diverse', () => { expect(generate(42)).toEqual(generate(42)); expect(generate(42).tiles).not.toEqual(generate(43).tiles); });
  it('preserves borders, safe spawn, food in every layer and a diggable objective route for 100 seeds', () => {
    for (let seed = 0; seed < 100; seed++) {
      const w = generate(seed);
      expect(w.tiles.length).toBe(W * H);
      for (let x = 0; x < W; x++) { expect(tileAt(w, x, 0)).toBe(6); expect(tileAt(w, x, H - 1)).toBe(6); }
      for (let y = 0; y < H; y++) { expect(tileAt(w, 0, y)).toBe(6); expect(tileAt(w, W - 1, y)).toBe(6); }
      expect(tileAt(w, -1, 2)).toBe(6); expect(tileAt(w, W, 2)).toBe(6);
      for (let y = 1; y <= 3; y++) for (let x = 18; x <= 22; x++) expect(tileAt(w, x, y)).toBe(0);
      for (const [lo, hi, resource] of [[4, 34, 2], [34, 67, 3], [67, 99, 4]]) expect(w.tiles.slice(lo * W, hi * W).filter(t => t === resource).length).toBeGreaterThan(0);
      const visited = new Set([index(HOME.x, HOME.y)]), queue = [[HOME.x, HOME.y]];
      for (let i = 0; i < queue.length; i++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const [x, y] = [queue[i][0] + dx, queue[i][1] + dy], id = index(x, y), t = tileAt(w, x, y);
        if (t !== 6 && t !== 5 && !visited.has(id)) { visited.add(id); queue.push([x, y]); }
      }
      expect(visited.has(index(HOME.x, H - 3))).toBe(true);
      expect(w.tiles.filter(t => t === 7)).toHaveLength(0);
    }
  });
});
describe('simulation rules', () => {
  it('charges digging energy once across fixed steps and frees the tile', () => {
    const sim = underground(); sim.state.world.tiles[index(21, 10)] = 1;
    walk(sim, 1, 0); expect(sim.state.player.x).toBe(21); expect(tileAt(sim.state.world, 21, 10)).toBe(0);
    expect(sim.state.player.energy).toBeCloseTo(157.3, 1);
    walk(sim, -1, 0); expect(sim.state.player.energy).toBeCloseTo(156.73, 1);
  });
  it('never charges for idle or bedrock and cancels a partial dig on release', () => {
    const sim = underground(); sim.state.world.tiles[index(21, 10)] = 6;
    for (let i = 0; i < 60; i++) sim.step(1 / 60, 1, 0);
    expect(sim.state.player.energy).toBe(160); expect(sim.state.player.x).toBe(20);
    sim.state.world.tiles[index(21, 10)] = 1; sim.step(.1, 1, 0); expect(sim.progress).toBeGreaterThan(0);
    sim.step(.1, 0, 0); expect(sim.progress).toBe(0);
  });
  it('assisted return deposits a restored full cargo without destroying nearby nutrients', () => {
    const sim = underground(); sim.assistReturn = true; sim.state.player.cargo = Array(10).fill('N'); sim.state.world.tiles[index(21, 10)] = 2;
    sim.step(1/60,1,0);
    expect(atHome(sim.state)).toBe(true);expect(tileAt(sim.state.world,21,10)).toBe(2);
    expect(sim.state.bank).toBe(100);expect(sim.state.deposited.N).toBe(10);expect(sim.state.player.cargo).toHaveLength(0);
    expect(sim.state.trips).toBe(1);expect(sim.state.deaths).toBe(0);expect(sim.events.some(e=>e.kind==='auto-return')).toBe(true);
  });
  it('collects the correct value and upgrades all four tracks only at home and with funds', () => {
    const sim = underground(); sim.state.world.tiles[index(21, 10)] = 3; walk(sim, 1, 0); expect(sim.state.player.cargo).toEqual(['P']);
    sim.state.bank = 10000; expect(sim.purchase('energy')).toBe(false);
    sim.state.player.x = HOME.x; sim.state.player.y = HOME.y;
    let cost = 0;
    for (const track of TRACKS) { for (const price of PRICES[track]) { expect(sim.purchase(track)).toBe(true); cost += price; } expect(sim.purchase(track)).toBe(false); }
    expect(sim.state.bank).toBe(10010 - cost); expect(cost).toBe(1565); expect(energyMax(sim.state)).toBe(620); expect(cargoMax(sim.state)).toBe(34); expect(healthMax(sim.state)).toBe(250);
    const poor = new Simulation(newGame()); expect(poor.purchase('energy')).toBe(false);
  });
  it('telegraphs toxin tiles, limits contact damage and allows escape', () => {
    const sim = underground(); sim.state.world.tiles[index(21, 10)] = 5;
    walk(sim, 1, 0); expect(sim.state.player.health).toBe(82);
    sim.step(.1, 0, 0); expect(sim.state.player.health).toBe(82);
    walk(sim, -1, 0); expect(sim.state.player.health).toBe(82);
  });
  it('predators damage on contact and cannot enter the colony', () => {
    const sim = underground(); sim.state.world.enemies = [{ x: 20, y: 10, dir: 0, timer: 0 }]; sim.step(.1, 0, 0); expect(sim.state.player.health).toBe(82);
    sim.state.world.enemies = [{ x: 20, y: 5, dir: 2, timer: .64 }]; sim.state.player.y = 3; sim.step(.02, 0, 0); expect(sim.state.world.enemies[0].y).toBe(5);
  });
  it('respawns after depletion, keeps investments and regenerates recovery food', () => {
    const sim = underground(); sim.state.world.balanced=false; sim.state.bank = 50; sim.state.upgrades.energy = 1; sim.state.player.cargo = ['K']; sim.state.player.energy = .01;
    sim.state.world.tiles[index(21, 10)] = 0; walk(sim, 1, 0);
    expect(atHome(sim.state)).toBe(true); expect(sim.state.bank).toBe(50); expect(sim.state.upgrades.energy).toBe(1); expect(sim.state.player.energy).toBe(270); expect(sim.state.player.cargo).toEqual([]);
    expect(sim.state.deaths).toBe(1); expect(tileAt(sim.state.world, 12, 5)).toBe(2);
  });
  it('wins only after all nutrients and samples are delivered, at the colony', () => {
    const sim = underground(), s = sim.state;
    s.deposited = { N: 12, P: 12, K: 11 }; s.scans = [...SAMPLE_IDS];
    sim.step(1 / 60, 0, 0); expect(s.won).toBe(false);
    s.player.cargo = ['K']; s.player.x = HOME.x; s.player.y = HOME.y;
    sim.step(1 / 60, 0, 0); expect(s.won).toBe(true); expect(s.deposited.K).toBe(12);
    // The deep survey stays open after victory: play continues without re-winning.
    const elapsed = s.elapsed; sim.step(10, 1, 0); expect(s.elapsed).toBeGreaterThan(elapsed);
    expect(sim.events.filter(e => e.kind === 'win')).toHaveLength(1);
  });
});
describe('persistence', () => {
  function memory() { const values = new Map<string, string>(); return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } }; }
  it('round trips world changes, inventory, purchases and position', () => {
    const sim = underground(), storage = memory(); sim.state.world.tiles[index(21, 10)] = 2; walk(sim, 1, 0); sim.state.bank = 200; sim.state.upgrades.storage = 1;
    expect(save(storage, sim.state)).toBe(true); expect(load(storage).state).toEqual(sim.state);
  });
  it('rejects malformed and incompatible saves without throwing', () => {
    const storage = memory();
    for (const raw of ['{', 'null', JSON.stringify({ version: 99, state: newGame() }), JSON.stringify({ version: VERSION, state: { player: {} } })]) {
      storage.setItem(SAVE_KEY, raw); expect(load(storage).state).toBeNull(); expect(load(storage).message.length).toBeGreaterThan(0);
    }
    const s = newGame(); s.world.tiles = []; expect(valid(s)).toBe(false);
    const b = newGame(); b.player.energy = NaN; expect(valid(b)).toBe(false);
    const c = newGame(); c.upgrades.energy = 7; expect(valid(c)).toBe(false);
  });
  it('survives blocked browser storage', () => { const blocked = { getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() { throw Error(); } }; expect(load(blocked).state).toBeNull(); expect(save(blocked, newGame())).toBe(false); });
});
