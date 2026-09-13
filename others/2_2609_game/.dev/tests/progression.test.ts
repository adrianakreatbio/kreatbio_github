import { it, expect } from 'vitest';
import { Simulation, newGame, atHome } from '../src/simulation';
import { decision, nextUpgrade } from './pilot';
it.each([7, 91, 2609])('completes a varied expedition with normal costs and purchases (seed %i)', (seed) => {
  const sim = new Simulation(newGame(seed)); let returning = false, actions = 0;
  while (!sim.state.won && sim.state.elapsed < 2400 && actions++ < 10000) {
    if (atHome(sim.state)) {
      returning = false;
      let track = nextUpgrade(sim.state);
      while (track && sim.purchase(track)) track = nextUpgrade(sim.state);
    }
    const site = sim.nearbySample(); if (site && !sim.state.scans.includes(site.id)) sim.scan(site.id);
    const d = decision(sim.state, returning); returning = d.returning;
    for (const [x, y] of d.path) {
      const p = sim.state.player, dx = x - p.x, dy = y - p.y;
      if (Math.abs(dx) + Math.abs(dy) !== 1) break;
      const deaths = sim.state.deaths, trips = sim.state.trips;
      for (let frames = 0; frames < 2000 && sim.state.trips === trips && (sim.state.player.x !== x || sim.state.player.y !== y); frames++) sim.step(1 / 60, dx, dy);
      if (sim.state.deaths !== deaths || sim.state.trips !== trips) break;
    }
    if (!d.path.length) throw new Error(`Stuck ${JSON.stringify(sim.state.player)}`);
  }
  console.log(JSON.stringify({ seed: sim.state.world.seed, seconds: sim.state.elapsed, trips: sim.state.trips, deaths: sim.state.deaths, upgrades: sim.state.upgrades, bank: sim.state.bank }));
  expect(sim.state.won).toBe(true); expect(sim.state.deaths).toBeLessThanOrEqual(4); expect(sim.state.trips).toBeGreaterThanOrEqual(3); expect(sim.state.elapsed).toBeGreaterThan(30); expect(sim.state.elapsed).toBeLessThan(480); expect(sim.state.scans).toHaveLength(10);
}, 120000);
