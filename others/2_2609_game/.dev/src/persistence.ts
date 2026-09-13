import { NUTRIENTS, SAMPLE_IDS, SURVEY_IDS, PLANT_TARGET, emptyTotals } from './biology';
import { cargoMax, energyMax, healthMax, TRACKS, type State } from './simulation';
import { addSamples, addDiscoverySites, addEnergyFood, H, HOME, W, index, tileAt, placeFirstSampleAtHome } from './world';
export const SAVE_KEY = 'kreatbio.microload.save';
export const VERSION = 7;
export const BACKUP_KEY = `${SAVE_KEY}.v1-backup`;
export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void; }
const finite = (n: unknown, min: number, max = Number.MAX_SAFE_INTEGER): n is number => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
const integer = (n: unknown, min: number, max: number): n is number => finite(n, min, max) && Number.isInteger(n);
function validState(s: any, legacy = false, food = true): s is State {
  if (!s || !s.world || !s.player || !s.upgrades) return false;
  if (!integer(s.world.seed, 0, 4294967295) || !Array.isArray(s.world.tiles) || s.world.tiles.length !== W * H || !s.world.tiles.every((t: unknown) => integer(t, 0, legacy ? 7 : food ? 9 : 6) && (legacy || t !== 7))) return false;
  if (!TRACKS.every(k => integer(s.upgrades[k], 0, 3))) return false;
  if(s.world.balanced!==undefined && typeof s.world.balanced!=='boolean')return false;
  if(s.world.challenge!==undefined && !integer(s.world.challenge,0,2))return false;
  if(s.world.buried!==undefined && (!s.world.buried || typeof s.world.buried!=='object' || Array.isArray(s.world.buried) || !Object.entries(s.world.buried).every(([k,v])=>/^\d+$/.test(k)&&integer(Number(k),0,W*H-1)&&integer(v,2,4)&&s.world.tiles[Number(k)]===0)))return false;
  const p = s.player;
  if (!integer(p.x, 1, W - 2) || !integer(p.y, 1, H - 2) || ![0, 5, 9].includes(tileAt(s.world, p.x, p.y))) return false;
  if (!finite(p.energy, .00001, energyMax(s)) || !finite(p.health, .00001, healthMax(s)) || !Array.isArray(p.cargo) || p.cargo.length > cargoMax(s) || !p.cargo.every((v: any) => legacy ? [8, 18, 35].includes(v) : NUTRIENTS.includes(v))) return false;
  if (p.cargoValues !== undefined && (!Array.isArray(p.cargoValues) || p.cargoValues.length > p.cargo.length || !p.cargoValues.every((v: any) => finite(v, 0, 1000)))) return false;
  if (s.deepest !== undefined && !integer(s.deepest, 0, H)) return false;
  if (!integer(s.bank, 0, 1e9) || !finite(s.elapsed, 0, 1e9) || !integer(s.trips, 0, 1e7) || !integer(s.deaths, 0, 1e7) || typeof s.won !== 'boolean') return false;
  if (legacy) {
    if (typeof s.fragment !== 'boolean' || (s.won && !s.fragment)) return false;
    const fragments = s.world.tiles.filter((t: number) => t === 7).length;
    if (fragments !== (s.fragment ? 0 : 1) || (!s.fragment && s.world.tiles[index(HOME.x, H - 3)] !== 7)) return false;
  } else {
    if (!s.deposited || !NUTRIENTS.every(n => integer(s.deposited[n], 0, 1e9))) return false;
    if (!Array.isArray(s.scans) || !s.scans.every((id: any) => SAMPLE_IDS.includes(id)) || new Set(s.scans).size !== s.scans.length) return false;
    // Pre-v7 worlds carry the three survey sites; current worlds all ten samples.
    if (!Array.isArray(s.world.samples) || ![3, 10].includes(s.world.samples.length) || !s.world.samples.every((site: any) => SAMPLE_IDS.includes(site?.id)) || new Set(s.world.samples.map((site: any) => site?.id)).size !== s.world.samples.length) return false;
    if (!SURVEY_IDS.every(id => s.world.samples.some((site: any) => site?.id === id))) return false;
    if (!s.world.samples.every((site: any) => integer(site.x, 1, W - 2) && integer(site.y, 4, H - 2) && tileAt(s.world, site.x, site.y) === 0)) return false;
    if (new Set(s.world.samples.map((site: any) => index(site.x, site.y))).size !== s.world.samples.length) return false;
    if (s.won && (!NUTRIENTS.every(n => s.deposited[n] >= PLANT_TARGET) || !SURVEY_IDS.every(id => s.scans.includes(id)))) return false;
  }
  for (let y = 0; y < H; y++) if (s.world.tiles[index(0, y)] !== 6 || s.world.tiles[index(W - 1, y)] !== 6) return false;
  for (let x = 0; x < W; x++) if (s.world.tiles[index(x, 0)] !== 6 || s.world.tiles[index(x, H - 1)] !== 6) return false;
  return Array.isArray(s.world.enemies) && s.world.enemies.length <= 30 && s.world.enemies.every((e: any) => integer(e.x, 1, W - 2) && integer(e.y, 5, H - 2) && integer(e.dir, 0, 3) && finite(e.timer, 0, 1));
}
export const valid = (s: unknown): s is State => validState(s);
export function load(storage: StorageLike): { state: State | null; message: string } {
  try {
    const raw = storage.getItem(SAVE_KEY); if (!raw) return { state: null, message: '' };
    const data = JSON.parse(raw);
    if (data?.version === 1 && validState(data.state, true)) {
      const state = data.state;
      state.player.cargo = state.player.cargo.map((n: number) => NUTRIENTS[[8, 18, 35].indexOf(n)]);
      state.world.tiles = state.world.tiles.map((t: number) => t === 7 ? 0 : t);
      delete state.fragment;
      state.won = false; state.deposited = emptyTotals(); state.scans = [];
      addSamples(state.world, state.player);
      addDiscoverySites(state.world, state.player);
      addEnergyFood(state.world, state.player);
      let backedUp = true;
      try { if (!storage.getItem(BACKUP_KEY)) storage.setItem(BACKUP_KEY, raw); } catch { backedUp = false; }
      return { state, message: `New mission: restore a pea plant. Your world, upgrades and credits carry over; plant totals and scans start fresh.${backedUp ? ' Your original save is backed up.' : ' Backup unavailable; browser storage is full or blocked.'}` };
    }
    if (data?.version === 2 && validState(data.state, false, false)) {
      addEnergyFood(data.state.world, data.state.player);
      placeFirstSampleAtHome(data.state.world);
      addDiscoverySites(data.state.world, data.state.player);
      return { state: data.state, message: 'Orange ⚡ food added in the topsoil. Each restores up to 30 energy immediately, even with full cargo. Your progress is kept.' };
    }
    if (data?.version === 3 && valid(data.state)) { placeFirstSampleAtHome(data.state.world); addDiscoverySites(data.state.world, data.state.player); return { state: data.state, message: 'Scan to reveal nutrients. The first sample is now beside HOME. Your progress is kept.' }; }
    if (data?.version === 4 && valid(data.state)) { addDiscoverySites(data.state.world, data.state.player); return {state:data.state,message:'Hidden nutrients are now preserved when you dig. Seven new organisms await discovery. Your expedition is kept.'}; }
    if (data?.version === 5 && valid(data.state)) { addDiscoverySites(data.state.world, data.state.player); return {state:data.state,message:'Deep survey update: deliver cargo by returning HOME yourself (assisted return is in Aa settings), deeper finds earn more credits, and upgrades now have three tiers. Seven new organisms await discovery. Your world and progress are kept.'}; }
    if (data?.version === 6 && valid(data.state)) { addDiscoverySites(data.state.world, data.state.player); return {state:data.state,message:'Seven new organisms to discover — each scan pays ✦25 and is logged in the Field Journal. Finishing the plant now asks for all 10 scans. Your world and progress are kept.'}; }
    if (data?.version !== VERSION || !valid(data.state)) return { state: null, message: 'This save could not be read. Start a new culture to recover.' };
    return { state: data.state, message: '' };
  } catch { return { state: null, message: 'Local saving is unavailable or the save is damaged. You can still play.' }; }
}
export function save(storage: StorageLike, state: State) {
  try { storage.setItem(SAVE_KEY, JSON.stringify({ version: VERSION, state })); return true; } catch { return false; }
}
