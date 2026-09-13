import { MICROBES, SAMPLE_IDS, SURVEY_IDS, type SampleId } from './biology';
export const W =  40;

export const H = 100;
export const SURFACE = 3;
export const HOME = { x: 20, y: 2 };
export type Tile = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9; // air, soil, N, P, K, fictional hazard, rock, legacy fragment, energy food, waterlogged low-oxygen pocket
export interface Enemy { x: number; y: number; dir: number; timer: number; }
export interface SampleSite { id: SampleId; x: number; y: number; }
export const CHALLENGES = ['Explore freely', 'No cargo losses', 'At most 4 deliveries'] as const;
export interface World { buried?: Record<number, Tile>; balanced?: boolean; challenge?: number; seed: number; tiles: Tile[]; enemies: Enemy[]; worms?: Enemy[]; samples: SampleSite[]; }
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
      // Coarse rock fragments increase toward the parent material; waterlogged
      // low-oxygen pockets appear only in the deep, poorly drained band.
      // Rock and hazard density run 1.5x the original rates for a harder dig.
      const rock = [.06, .105, .15][l], hazardBand = rock + l * .0375;
      t = n < rock ? 6 : n < hazardBand ? 5 : l === 2 && n < hazardBand + .045 ? 9 : n < .29 ? (2 + Math.floor(r() * 3)) as Tile : n > .96 ? 0 : 1;
    }
    tiles[index(x, y)] = t;
  }
  // A buried, hazard-free spine guarantees access without gifting an open shaft.
  for (let y = SURFACE + 1; y < H - 1; y++) tiles[index(HOME.x, y)] = y % 7 === 0 ? (2 + y % 3) as Tile : 1;
  // Early food can always finance a recovery trip.
  for (let x = 12; x <= 28; x += 2) tiles[index(x, 5)] = (2 + (x / 2) % 3) as Tile;
  // Pathogen pressure rises with depth: sparse in topsoil, dense near the parent material.
  // Spawner density runs 1.5x the original count (20 -> 30) for a harder game.
  for (const [start, end, step] of [[16, 33, 4], [36, 66, 3], [69, 96, 2]] as const) for (let y = start; y <= end; y += step) {
    const x = 3 + Math.floor(r() * 12) + (r() > .5 ? 20 : 0);
    for (let dx = -1; dx <= 1; dx++) tiles[index(x + dx, y)] = 0;
    enemies.push({ x, y, dir: Math.floor(r() * 4), timer: 0 });
  }
  const world: World = { seed: seed >>> 0, tiles, enemies, samples: [] };
  addSamples(world);
  addDiscoverySites(world);
  addEnergyFood(world);
  balanceDeposits(world);
  addDeepPockets(world);
  addWorms(world);
  world.challenge=seed%3;
  return world;
}

// Sample depths follow the science: Rhizobium in the rhizosphere, decomposers in
// the organic topsoil, mycorrhiza and nitrifiers in the subsoil, dormant Fusarium
// spores and archaea deepest. Positions vary by seed; identities do not.
export const SAMPLE_DEPTHS: Record<SampleId, number> = { 'root-partner': 9, 'root-guard': 15, 'nitrogen-catcher': 21, 'antibiotic-maker': 27, 'phosphorus-helper': 40, 'root-extender': 47, 'fungus-fighter': 54, 'ammonia-oxidizer': 60, 'root-risk': 67, 'deep-archaeon': 78 };
const isSurvey = (id: SampleId) => (SURVEY_IDS as readonly string[]).includes(id);
export const surveySites = (world: World) => world.samples.filter(site => isSurvey(site.id));
// Clears rocks/hazards/water around a site so its survey route stays truthful.
function clearBypass(world: World, site: SampleSite) {
  for (let dy=-2;dy<=3;dy++) {
    const pos=index(site.x,site.y+dy);
    if ([5,6,9].includes(world.tiles[pos])) world.tiles[pos]=1;
  }
  for(let dx=0;dx<=4;dx++) {
    const pos=index(site.x+dx,site.y+3);
    if ([5,6,9].includes(world.tiles[pos])) world.tiles[pos]=1;
  }
}
// A safe vertical route remains available even when importing an old expedition.
export function addSamples(world: World, player?: { x: number; y: number }) {
  const rng = random(world.seed ^ 0x51a7);
  world.samples = SURVEY_IDS.map((id, i) => ({ id, x: i === 0 ? HOME.x : HOME.x + Math.floor(rng()*7)-3, y: SAMPLE_DEPTHS[id] }));
  for (let y = 4; y <= 96; y++) {
    const pos = index(HOME.x, y);
    if ([5, 6, 7, 9].includes(world.tiles[pos])) world.tiles[pos] = 1;
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
  world.samples.forEach(site => clearBypass(world, site));
  world.enemies = world.enemies.filter(e => Math.abs(e.x - HOME.x) > 5);
}

// Seven optional discovery organisms deepen the lesson. Additive and idempotent,
// so older worlds gain the sites without disturbing their layouts.
export function addDiscoverySites(world: World, player?: { x: number; y: number }) {
  const rng = random(world.seed ^ 0x7de3);
  for (const id of SAMPLE_IDS) {
    if (isSurvey(id) || world.samples.some(site => site.id === id)) continue;
    const y = SAMPLE_DEPTHS[id];
    let x = HOME.x + Math.floor(rng()*7) - 3;
    for (let tries = 0; tries < 9 && ([2,3,4,8].includes(world.tiles[index(x,y)]) || world.samples.some(site=>site.x===x&&site.y===y) || (player?.x === x && player.y === y)); tries++) x = HOME.x + Math.floor(rng()*7) - 3;
    for (let cx = Math.min(x, HOME.x); cx <= Math.max(x, HOME.x); cx++) {
      const pos = index(cx, y);
      if ([5,6,9].includes(world.tiles[pos])) world.tiles[pos] = 1;
    }
    world.tiles[index(x, y)] = 0;
    const site = { id, x, y };
    world.samples.push(site);
    clearBypass(world, site);
  }
}

export const FOOD_TILE = 8;
export const FOOD_ENERGY = 30;
// Three finite refills, all in the organic topsoil band: soil organic matter —
// and so this microbe's food — declines sharply with depth. Deep trips must be budgeted.
// Called only for a new world or an older save migration, never on respawn/load of v3.
export function addEnergyFood(world: World, player?: { x: number; y: number }) {
  for (const y of [7, 19, 31]) {
    let x = player?.x === HOME.x - 1 && player.y === y ? HOME.x + 1 : HOME.x - 1;
    if (world.samples.some(site=>site.x===x && site.y===y)) x = HOME.x + 1;
    world.tiles[index(x, y)] = FOOD_TILE;
  }
}

// Every depth belongs to one of the three nutrient surveys. Scanning unlocks its
// existing deposits; discovery sites teach organisms but gate nothing.
export function surveyForTile(world: World, y: number): SampleSite {
  return surveySites(world).reduce((nearest, site) => Math.abs(site.y-y)<Math.abs(nearest.y-y) ? site : nearest);
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

// Bounded supplies make every survey strictly necessary: each nutrient exists in
// exactly one area, following real stratification — organic nitrogen in the
// topsoil, phosphorus in the subsoil, mineral potassium deepest.
export function balanceDeposits(world: World) {
  world.tiles=world.tiles.map(t=>t>=2&&t<=4?1:t);
  world.buried={};world.balanced=true;
  const budgets=[[16,0,0],[0,16,0],[0,0,16]];
  [...surveySites(world)].sort((a,b)=>a.y-b.y).forEach((site,i)=>{
    const rng=random(world.seed ^ (i+1)*731);
    const values: Tile[]=[];
    for(let n=0;n<3;n++)for(let j=0;j<budgets[i][n];j++)values.push((2+n) as Tile);
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

// Earthworms: soil engineers that churn real burrows (bioturbation) and shove
// whatever they bump into. Harmless, oblivious, and surprisingly pushy.
export function addWorms(world: World) {
  if (world.worms?.length) return;
  const rng = random(world.seed ^ 0x3aa9);
  // Five worms (was three, ~1.5x) spread across all three horizons.
  world.worms = [16, 32, 48, 66, 84].map(base => {
    const y = base + Math.floor(rng() * 6) - 3;
    let x = rng() > .5 ? 3 + Math.floor(rng() * 11) : 27 + Math.floor(rng() * 10);
    for (let tries = 0; tries < 9 && tileAt(world, x, y) === 6; tries++) x = 3 + Math.floor(rng() * (W - 6));
    return { x, y, dir: Math.floor(rng() * 4), timer: 0 };
  });
}

// Bonus potassium below the deepest survey: in real soil, K weathers out of
// feldspar and mica in the C horizon. Surplus credits, not required for the plant.
export const DEEP_K_POCKETS = 10;
export function addDeepPockets(world: World) {
  const rng = random(world.seed ^ 0x9e37);
  let placed = 0, guard = 0;
  while (placed < DEEP_K_POCKETS && guard++ < 4000) {
    const x = 2 + Math.floor(rng() * (W - 4)), y = 78 + Math.floor(rng() * 18);
    if (x === HOME.x) continue;
    const pos = index(x, y);
    if (world.tiles[pos] === 1) { world.tiles[pos] = 4; placed++; }
  }
  for (let y = 78; y < 96 && placed < DEEP_K_POCKETS; y++) for (let x = 2; x < W - 2 && placed < DEEP_K_POCKETS; x++)
    if (x !== HOME.x && world.tiles[index(x, y)] === 1) { world.tiles[index(x, y)] = 4; placed++; }
}
