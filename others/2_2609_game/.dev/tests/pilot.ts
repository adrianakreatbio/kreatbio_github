import { NUTRIENTS, PLANT_TARGET } from '../src/biology';
import { W, H, HOME, index, layer, nutrientRevealed, playableTile } from '../src/world';
import { cargoMax, DIG_ENERGY, DIG_SECONDS, MOVE_ENERGY, type State, type Track } from '../src/simulation';
export const itinerary: Track[] = ['energy', 'digestion', 'storage'];
export function nextUpgrade(s: State) {
  const levels = { digestion: 0, energy: 0, storage: 0, membrane: 0 };
  for (const track of itinerary) { levels[track]++; if (s.upgrades[track] < levels[track]) return track; }
  return null;
}
export function route(s: State, homeOnly = false) {
  const start = index(s.player.x, s.player.y), count = W * H, costs = Array(count).fill(Infinity), parents = Array(count).fill(-1), energies = Array(count).fill(0);
  costs[start] = 0;
  const queue = [start], full = s.player.cargo.length >= cargoMax(s);
  while (queue.length) {
    queue.sort((a, b) => costs[b] - costs[a]);
    const id = queue.pop()!, x = id % W, y = Math.floor(id / W);
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const nx = x + dx, ny = y + dy, ni = index(nx, ny), t = playableTile(s.world,s.scans,nx,ny);
      if (nx < 1 || nx >= W - 1 || ny < 1 || ny >= H - 1 || t === 6 || t === 5 || t === 9 || (full && t >= 2 && t <= 4) || (homeOnly && t !== 0)) continue;
      const e = t === 0 || t === 7 || t === 8 ? MOVE_ENERGY : DIG_ENERGY[layer(ny)];
      const time = t === 0 || t === 7 || t === 8 ? .1 : DIG_SECONDS[layer(ny)] / [1, 1.45, 2, 2.7][s.upgrades.digestion];
      const cost = costs[id] + time + e * .08;
      if (cost < costs[ni]) { costs[ni] = cost; parents[ni] = id; energies[ni] = energies[id] + e; if (!queue.includes(ni)) queue.push(ni); }
    }
  }
  return { costs, parents, energies, start };
}
export function decision(s: State, returning: boolean) {
  const paths = route(s), homeId = index(HOME.x, 3);
  const upgrade = nextUpgrade(s);
  if (returning || s.player.cargo.length >= cargoMax(s)) return { path: unwind(paths, homeId), returning: true, goal: 'home' };
  const sample = s.world.samples.find(site => !s.scans.includes(site.id));
  if (sample && (!s.scans.length || s.upgrades.energy >= 1)) {
    const target = index(sample.x, sample.y);
    if (paths.energies[target] + (sample.y - 3) * MOVE_ENERGY + 15 < s.player.energy) return { path: unwind(paths, target), returning: false, goal: 'sample' };
  }
  let best = -1, bestScore = Infinity;
  for (let id = 0; id < s.world.tiles.length; id++) {
    const t = playableTile(s.world,s.scans,id%W,Math.floor(id/W)); if (!nutrientRevealed(s.world,s.scans,Math.floor(id/W)) || t < 2 || t > 4 || !Number.isFinite(paths.costs[id])) continue;
    const y = Math.floor(id / W), x = id % W;
    const returnEnergy = (Math.abs(x - HOME.x) + Math.max(0, y - 3)) * .5 + 8;
    if (paths.energies[id] + returnEnergy > s.player.energy) continue;
    const n = NUTRIENTS[t - 2];
    const needed = s.deposited[n] + s.player.cargo.filter(v => v === n).length < PLANT_TARGET;
    if (!needed && !upgrade) continue;
    const value = needed ? 30 : 5;
    const score = (paths.costs[id] + 1.5) / Math.sqrt(value);
    if (score < bestScore) { bestScore = score; best = id; }
  }
  if (best < 0) return { path: unwind(paths, homeId), returning: true, goal: 'home' };
  return { path: unwind(paths, best), returning: false, goal: 'food' };
}
function unwind(paths: ReturnType<typeof route>, target: number) {
  const result: [number, number][] = [];
  let id = target;
  for (let i = 0; id !== paths.start && id >= 0 && i < W * H; i++) { result.push([id % W, Math.floor(id / W)]); id = paths.parents[id]; }
  if (id < 0) throw new Error('No route to target');
  return result.reverse();
}
