import { DISCOVERY_BONUS, MICROBES, NUTRIENTS, NUTRIENT_INFO, PLANT_TARGET, SAMPLE_IDS, SURVEY_IDS, type SampleId } from './biology';
import './style.css';
import { Simulation, atHome, cargoMax, energyMax, energyUse, healthMax, newGame, PRICES, TRACKS, type Track } from './simulation';
import { FOOD_TILE, HOME, SAMPLE_DEPTHS, layer, tileAt, playableTile, nutrientRevealed, surveyForTile, CHALLENGES } from './world';
import { load, save } from './persistence';
import { Input } from './input';
import { Renderer } from './render';
import { Sound } from './audio';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const asset = (name: string) => `${import.meta.env.BASE_URL}assets/${name}`;
document.querySelector('#app')!.innerHTML = `
<header class="site-header"><a href="https://kreatbio.com/" aria-label="KreatBio home"><img src="${asset('kreatbio-logo.png')}" alt="KreatBio"></a><span><i></i> CULTURE ARCADE <b>/ 02</b></span></header>
<main><section class="intro"><div><p class="eyebrow">AN ADVENTURE UNDER THE MICROSCOPE</p><h1><span>Micro</span>load<span class="title-dot">.</span></h1><p class="subtitle">Tiny explorer. Living soil. A plant worth saving.</p></div><div class="specimen"><span class="live-dot"></span> SPECIMEN M–02<br><small>Pea rhizosphere · single player</small></div></section>
<section class="game-shell" aria-label="Microload game">
<div class="instrument-bar"><span>MICROLOAD <b id="layer-label"></b></span><div><button id="journal">Notes</button><button id="access" aria-label="Accessibility settings">Aa</button><span id="save-status">LOCAL SAVE</span><button id="mute" aria-label="Mute sound">SOUND ON</button><button id="pause" aria-label="Pause game">Ⅱ PAUSE</button></div></div>
<div class="game-hud" aria-label="Mission progress and vitals"><div id="plant-display"></div><div class="hud-meters"><div id="nutrient-totals"></div><div class="vital-meters">${['energy','health'].map(id => `<div class="hud-meter" id="${id}-panel"><label for="${id}">${id === 'energy' ? '⚡ Energy' : 'Health'}</label><span id="${id}-text"></span><progress id="${id}" max="160" value="160"></progress></div>`).join('')}<div class="hud-meter"><label for="cargo">Cargo</label><span id="cargo-text"></span><progress id="cargo" max="10" value="0"></progress></div></div></div><div class="hud-actions"><button id="scan-count" class="goal-chip" title="Open the Field Journal">◉ LEARN THE SOIL · 0/${SAMPLE_IDS.length}</button><button id="evolve" class="secondary">Upgrade · ✦ <span id="bank">0</span></button></div></div>
<div class="play-layout"><div class="viewport"><canvas id="world" aria-label="Underground world. Hold a direction on the pad, WASD or arrow keys to move and dig."></canvas><div id="direction-pad" aria-label="Hold a direction to move"><button data-direction="up" aria-label="Move up">↑</button><button data-direction="left" aria-label="Move left">←</button><span aria-hidden="true">HOLD</span><button data-direction="right" aria-label="Move right">→</button><button data-direction="down" aria-label="Move down">↓</button></div><div class="viewport-top"><span id="colony-arrow"></span><span id="depth"></span></div><div id="survey-status"></div><div id="vital-warning" role="status" hidden></div><div id="toast" role="status"></div><div id="growth-feedback" hidden></div><div class="viewport-bottom"><span id="location"></span><span id="dig-status"></span></div><div id="navigation-reader" class="sr-only" aria-live="polite"></div><div id="overlay" class="overlay"></div></div></div>
<div class="game-controls"><p id="objective-copy" role="status"></p><button id="scan" class="primary">Scan</button></div></section>
<div class="field-notes"><span class="food-key">⚡ FOOD · +30 ENERGY</span><span><i class="dot lime"></i> N · P · K</span><span><i class="dot coral"></i> FICTIONAL HAZARDS</span><span><i class="dot blue"></i> LOW-O₂ WATER</span><span><i class="dot gold"></i> SOIL DNA SAMPLES</span><span class="field-note">Read the soil. Help life grow.</span></div><footer><span>Grown for curious lab minds by <a href="https://kreatbio.com/">KreatBio</a>.</span><span>Progress stays in this browser.</span></footer></main>`;
let storage: Storage;
try { storage = localStorage; } catch { storage = { getItem() { throw Error(); }, setItem() { throw Error(); } } as unknown as Storage; }
const saved = load(storage);
let sim = new Simulation(saved.state ?? newGame());
let hasSave = !!saved.state;
type Mode = 'title' | 'tutorial' | 'playing' | 'paused' | 'shop' | 'victory' | 'confirm' | 'journal' | 'scanning' | 'scan-intro' | 'scan-result' | 'settings';
let mode: Mode = 'title';
let journalReturn: Mode = 'playing';
let settingsReturn: Mode = 'playing';
let textNavigation=false, largeText=false, assistReturn=false, padSide: 'left' | 'right' = 'left';
try { textNavigation=storage.getItem('microload.textNavigation')==='true';largeText=storage.getItem('microload.largeText')==='true';assistReturn=storage.getItem('microload.assistReturn')==='true';padSide=storage.getItem('microload.padSide')==='right'?'right':'left'; } catch {}
document.body.classList.toggle('large-text',largeText);
document.body.dataset.pad = padSide;
sim.assistReturn = assistReturn;
let lastNarration='';
let scanningId: SampleId | null = null, scanTimer = 0;
let scanWindowActive = document.hasFocus();
const discoveredNutrients = new Set<string>(NUTRIENTS.filter(n => sim.state.deposited[n] > 0 || sim.state.player.cargo.includes(n)));
let plantSignature = '';
let guidedStart=false;
let plantCelebrationTimer: ReturnType<typeof setTimeout>;
let previousMode: Mode = 'title';
let saveTimer = 0, toastTimer = 0, visualTime = 0;
const sound = new Sound();
const renderer = new Renderer($<HTMLCanvasElement>('world'));
const input = new Input(togglePause, toggleMute, beginScan);
input.bindPad($('direction-pad'), () => mode === 'playing');
document.querySelectorAll<HTMLButtonElement>('[data-direction]').forEach(b=>b.addEventListener('click',e=>{if(e.detail===0&&mode==='playing')input.stepDirection(({up:'w',right:'d',down:'s',left:'a'} as Record<string,string>)[b.dataset.direction!]);}));
const names: Record<Track, string> = { digestion: 'Enzyme boost', energy: 'Energy reserve', storage: 'Nutrient storage', membrane: 'Membrane armor' };
const descriptions: Record<Track, string[]> = { digestion: ['1.45× digestion speed', '2× digestion speed', '2.7× digestion speed'], energy: ['270 energy capacity', '420 energy capacity', '620 energy capacity'], storage: ['16 slots · 37% less energy used', '24 nutrient slots', '34 nutrient slots'], membrane: ['140 health · 33% less hazard damage', '190 health · reduced damage', '250 health · reduced damage'] };
function queueDiscovery(text: string) { notify(text, 5); }
function openJournal() {
  if (!['playing', 'paused', 'victory', 'scan-result'].includes(mode)) return;
  journalReturn = mode; persist(); setMode('journal');
}
function beginScan() {
  if (mode !== 'playing') return;
  const site = sim.nearbySample();
  if (!site) { notify('Follow SAMPLE to a gold marker.', 8); return; }
  scanningId = site.id; scanTimer = 0; scanWindowActive = true; persist();
  setMode(sim.state.scans.includes(site.id) ? 'scan-result' : sim.state.scans.length ? 'scanning' : 'scan-intro');
}
function notify(text: string, duration = 4) { $('toast').textContent = text; $('toast').classList.add('show'); toastTimer = duration; }
function persist() { const ok = save(storage, sim.state); $('save-status').textContent = ok ? '✓ SAVED LOCALLY' : '⚠ SAVE UNAVAILABLE'; if (ok) hasSave = true; }
function setMode(next: typeof mode) {
  mode = next; document.body.dataset.mode = mode; input.clear(); sim.resetAction();
  if (mode === 'playing') { void sound.enable(); } else sound.pause();
  $('pause').textContent = mode === 'playing' ? 'Ⅱ PAUSE' : '▷ RESUME';
  $<HTMLButtonElement>('pause').disabled = !['playing', 'paused'].includes(mode);
  renderOverlay(); updateHUD();
}
function togglePause() { if (mode === 'settings') {setMode(settingsReturn);return;} if (mode === 'journal') { setMode(journalReturn); return; } if (['scanning', 'scan-intro', 'scan-result'].includes(mode)) return; if (mode === 'playing') { persist(); setMode('paused'); } else if (mode === 'paused') setMode('playing'); }
function toggleMute() { sound.toggle(); if (mode !== 'playing') sound.pause(); $('mute').textContent = sound.muted ? 'SOUND OFF' : 'SOUND ON'; $('mute').setAttribute('aria-label', sound.muted ? 'Unmute sound' : 'Mute sound'); }
function startFresh() { guidedStart=true;scanningId = null; const challenge=hasSave ? ((sim.state.world.challenge??0)+1)%3 : sim.state.world.challenge??0; sim = new Simulation(newGame()); sim.assistReturn = assistReturn; sim.state.world.challenge=challenge; saveTimer = 0; discoveredNutrients.clear(); plantSignature = ''; persist(); sim.state.world.challenge=(sim.state.world.challenge ?? 0); setMode('tutorial'); }
function confirmReset() { previousMode = mode; setMode('confirm'); }
function renderOverlay() {
  const o = $('overlay'); o.hidden = mode === 'playing';
  if (mode === 'playing') { o.innerHTML = ''; return; }
  let content = '';
  if (mode === 'title') content = `<img class="hero-mascot" src="${asset('base-muncher-bacterium.png')}" alt="A smiling purple bacterium"><p class="eyebrow">SMALL CELL. REAL CONNECTIONS.</p><h2>Read the soil.<br><em>Help life grow.</em></h2><p>Restore the pea plant: deliver 12 each of N, P and K, and meet all ${SAMPLE_IDS.length} soil organisms. Learn who they are — and budget your ⚡.</p><button class="primary" data-action="start">${hasSave ? 'Continue culture →' : 'Begin the adventure →'}</button>${hasSave ? '<button class="text-button" data-action="new">Start a new culture</button>' : ''}<small class="duration">HOLD TO MOVE · TOUCH OR KEYBOARD</small>${saved.message ? `<p class="warning">${saved.message}</p>` : ''}`;
  if (mode === 'tutorial') content = `<p class="eyebrow">YOUR FIRST SCAN</p><h2>Dig down to the <em>gold marker.</em></h2><p>Hold ↓ to dig straight down. Tap the glowing Scan button at the gold sample to reveal nutrients.</p><p>Goal: deliver 12 each of N, P and K, and scan all ${SAMPLE_IDS.length} organisms — each discovery pays ✦${DISCOVERY_BONUS}. Budget your ⚡.</p><p class="challenge">Optional challenge: ${CHALLENGES[sim.state.world.challenge??0]}</p><button class="primary" data-action="play">Let’s dig →</button><small class="duration">HOLD TO MOVE · RELEASE TO STOP · RULES IN NOTES</small>`;
  if (mode === 'paused') content = `<p class="eyebrow">CULTURE AT REST</p><h2>Take a<br><em>little breather.</em></h2><p>Your adventure is paused.<br>The soil can wait.</p><button class="primary" data-action="play">Resume exploration →</button><button class="secondary" data-action="guide">Control guide</button><button class="secondary" data-action="journal">Field Journal</button><button class="text-button" data-action="new">Start a new culture</button>`;
  if (mode === 'shop') {
    content = `<p class="eyebrow">SURFACE COLONY / RESEARCH LAB</p><h2>A little more <em>capable.</em></h2><p>Energy and membrane fully restored. <b class="lime-text">✦ ${sim.state.bank}</b> research credits available.</p><div class="upgrades">${TRACKS.map((k, i) => { const level = sim.state.upgrades[k], price = PRICES[k][level]; return `<div class="upgrade"><span class="upgrade-symbol">${['⌁', 'ϟ', '◈', '◎'][i]}</span><div><h3>${names[k]}</h3><p>${level < PRICES[k].length ? descriptions[k][level] : 'Fully upgraded'}</p><span class="levels">${[1,2,3].map(n => `<i class="${level >= n ? 'filled' : ''}"></i>`).join('')}</span></div><button data-buy="${k}" ${level >= PRICES[k].length || sim.state.bank < price ? 'disabled' : ''}>${level >= PRICES[k].length ? 'MAX' : `✦ ${price}`}</button></div>`; }).join('')}</div><button class="primary" data-action="play">Back to exploration →</button>`;
  }
  if (mode === 'confirm') content = `<p class="eyebrow">RESET CULTURE?</p><h2>A fresh <em>beginning.</em></h2><p>This replaces your saved world, nutrients, and upgrades. This cannot be undone.</p><button class="danger" data-action="reset">Replace save & start new</button><button class="secondary" data-action="cancel">Keep my culture</button>`;
  if (mode === 'victory') {
    const s=sim.state,challenge=s.world.challenge??0,earned=challenge===0 || (challenge===1 ? s.deaths===0 : s.trips<=4);
    content=`<p class="eyebrow">PEA PLANT RESTORED</p><h2>You helped <em>life grow.</em></h2>${plantMarkup()}<p>36 nutrients delivered. ${s.scans.length} soil organisms sequenced.</p><p class="challenge">${earned?'✦ Challenge complete':'Challenge to try again'} · ${CHALLENGES[challenge]}</p><div class="discovery-summary">${s.scans.map(id=>`<p><b>${MICROBES[id].role}</b><span>${MICROBES[id].short}</span></p>`).join('')}</div><div class="results"><span><b>${s.trips}</b>DELIVERIES</span><span><b>${s.deaths}</b>CARGO LOSSES</span><span><b>${s.deepest??0}</b>DEEPEST DIVE</span></div><button class="primary" data-action="play">Continue the deep survey →</button><button class="secondary" data-action="new">Try another challenge</button><button class="secondary" data-action="journal">Explore Field Journal</button>`;
  }
  if(mode==='settings') content=`<p class="eyebrow">ACCESSIBILITY & SOUND</p><h2>Make it <em>comfortable.</em></h2><button class="secondary" data-action="text-size">Larger text: ${largeText?'ON':'OFF'}</button><button class="secondary" data-action="text-navigation">Text navigation: ${textNavigation?'ON':'OFF'}</button><p>Text navigation describes nearby tiles. Press an arrow once per tile; press R to hear your surroundings. It also works with direction buttons.</p><button class="secondary" data-action="assist-return">Assisted return: ${assistReturn?'ON':'OFF'}</button><p>Assisted return delivers automatically when cargo is full. When off, bring full cargo HOME yourself and budget your energy.</p><button class="secondary" data-action="pad-side">Direction buttons: ${padSide==='left'?'LEFT':'RIGHT'} side</button><p>Direction buttons sit at the side of the screen, clear of the bottom edge, to avoid stray presses. Move them to whichever side suits your grip.</p><label for="volume">Sound volume</label><input id="volume" type="range" min="0" max="100" value="${Math.round(sound.volume*100)}"><button class="primary" data-action="close-settings">Back to game →</button>`;
  if (mode === 'scan-intro') content = `<p class="eyebrow">SOIL SAMPLE</p><h2>Who lives <em>here?</em></h2><p>Scan to reveal collectible N/P/K. DNA identifies a microbe; a paired soil survey locates the nutrients.</p><button class="primary" data-action="start-scan">Read DNA & survey patch →</button>`;
  if (mode === 'scanning') content = `<p class="eyebrow">KREATBIO / PORTABLE SEQUENCER</p><h2>Reading the soil’s <em>DNA.</em></h2><div class="dna-animation" aria-hidden="true">A C G T · T G C A</div><p id="scan-stage" role="status">1 / 3 · Collect a soil sample. It contains DNA from many microbes.</p><progress id="scan-progress" max="4.5" value="0" aria-label="Sequencing progress"></progress><p>DNA identifies a microbe. The soil survey locates nutrients.<br>Two separate findings · gameplay paused</p><small class="duration">× CANCELS THIS SCAN · NO SAMPLE CREDIT UNTIL COMPLETE</small>`;
  if (mode === 'scan-result' && scanningId) {
    const m = MICROBES[scanningId], risk = scanningId === 'root-risk', discovery = !(SURVEY_IDS as readonly string[]).includes(scanningId);
    const next = risk ? 'Potential pathogen detected. Use the dashed safe route; the soil survey also revealed this area’s nutrients.' : discovery ? `Discovery published: ✦${DISCOVERY_BONUS} research credits added. Follow the compass to the next organism.` : `${m.nutrient} deposits are now unlocked. ${m.nutrient==='N'?'Follow the N outlines: nitrogen supports proteins and chlorophyll.':'Follow the P outlines: phosphorus is part of DNA and ATP.'}`;
    content = `<p class="eyebrow">SOIL RESULT / ${sim.state.scans.length} OF ${SAMPLE_IDS.length} SAMPLES COMPLETE</p><h2>${m.role}</h2><p class="scan-species"><i>${m.name}</i><br><small>Simulated DNA match · one member of this soil community</small></p><div class="scan-explanation"><h3>Role</h3><p>${m.short}</p><h3>Next</h3><p>${next}</p>${risk ? '<p class="scan-context">This DNA clue alone does not prove disease.</p>' : ''}</div><p class="map-ready">${discovery ? 'Logged in your Field Journal — close × to continue.' : 'Nutrients revealed — close × to collect.'}</p><button class="secondary" data-action="journal">More in Field Journal</button><small class="duration">GAME PAUSED · CLOSE WITH × WHEN YOU’RE READY</small>`;
  }
  if (mode === 'journal') content = `<p class="eyebrow">KREATBIO / FIELD JOURNAL</p><h2>Your soil <em>discoveries.</em></h2><p>DNA matches reveal community clues. Nutrient tests and plant condition also matter. All matches and timings here are simulated.</p><div class="journal-list"><article><h3>Controls & survival</h3><p>Hold the direction pad, WASD or arrows to move and dig. Slide between arrows to turn; release to stop. Tap Scan or E near a gold marker. Deliver 12 each of N/P/K and scan all ${SAMPLE_IDS.length} samples, then return HOME to win. Three gold samples unlock the nutrient areas — nitrogen only near the topsoil survey, phosphorus only in the subsoil, potassium only in the deep area. The other seven are discoveries: each pays ✦${DISCOVERY_BONUS} and adds an organism to this journal.</p><p>Moving and digging use energy. HOME refills energy, repairs health and deposits cargo. Orange food restores up to 30 energy. Pink hazards and pathogens damage health; earthworms are harmless but shove you as they burrow. Lower horizons are dense — without Enzyme boosts, digging the B and C horizons is slow and energy-hungry, so upgrade before diving deep. At zero energy or health, you return HOME and lose carried cargo.</p><p>Deliver cargo by returning HOME yourself; the HUD shows a minimum ⚡ estimate for the trip. (Assisted return, in Aa settings, restores automatic delivery.) Deeper finds earn more research credits: ✦10 in topsoil, ✦20 in subsoil, ✦35 in the C horizon — deep samples are rarer and costlier to obtain, not more fertile. Upgrades at HOME have three tiers each; plant progress stays. Bigger storage also reduces energy use. Armor reduces damage further each tier. The marked safe route avoids pink shortcut hazards. Lost cargo returns to the soil; it is not delivered or credited.</p><p>N/P/K stay hidden and cannot be collected until the nearby sample is scanned. Digging before scanning preserves hidden deposits in the tunnel. After scanning, walk over them to collect. DNA identifies a microbe; the paired soil survey maps deposits or a safe route. Neither is a fertility diagnosis.</p></article><article><h3>⚡ Organic food · energy for your microbe</h3><p>Orange food restores up to 30 energy immediately and disappears. It uses no cargo slot. N/P/K count toward your plant goal instead. Many soil microbes get energy from organic material — and organic matter declines sharply with depth, so food only appears in the topsoil. Budget deep trips carefully.</p><a href="https://www.fao.org/4/a0100e/a0100e0d.htm" target="_blank" rel="noopener noreferrer">Read the science ↗</a></article><article><h3>Soil horizons · A, B and C</h3><p>The header shows your horizon. A (topsoil) holds organic matter and most microbial life; nitrogen concentrates here. B (subsoil) accumulates minerals such as phosphorus compounds. C is weathered parent material, where potassium weathers out of minerals like feldspar and mica — the deep K pockets mark fresh mineral surfaces, not higher fertility. Topsoil is usually the most fertile layer.</p><a href="https://en.wikipedia.org/wiki/Soil_horizon" target="_blank" rel="noopener noreferrer">Read the science ↗</a></article><article><h3>💧 Waterlogged pockets · low oxygen</h3><p>Blue watery pockets are passable shortcuts, but waterlogged soil holds little oxygen, and this aerobic microbe takes stress inside them. Real soils turn anoxic when water fills the pore space; deep, compacted layers drain poorly. These pockets are distinct from the fictional pink hazards.</p><a href="https://en.wikipedia.org/wiki/Waterlogging_(agriculture)" target="_blank" rel="noopener noreferrer">Read the science ↗</a></article><article><h3>🪱 Earthworms · ecosystem engineers</h3><p>The big pink burrowers are earthworms. Real earthworms mix and aerate soil (bioturbation), pull organic matter downward and open channels that water and roots follow. Here they dig genuine tunnels as they wander — and shove anyone they bump into. They are harmless otherwise; to a microbe, an earthworm is a moving landslide.</p><a href="https://en.wikipedia.org/wiki/Earthworm" target="_blank" rel="noopener noreferrer">Read the science ↗</a></article>${NUTRIENTS.map(n => `<article><h3>${n} · ${NUTRIENT_INFO[n].name}</h3><p>${NUTRIENT_INFO[n].detail}</p><a href="${NUTRIENT_INFO[n].source}" target="_blank" rel="noopener noreferrer">Read the science ↗</a></article>`).join('')}${SAMPLE_IDS.filter(id => sim.state.scans.includes(id)).map(id => { const m = MICROBES[id]; return `<article><span class="eyebrow">${m.role}</span><h3><i>${m.name}</i></h3><p>${m.detail}</p><p class="community">Community: featured DNA match + other bacteria and fungi. ${m.condition}.</p><a href="${m.source}" target="_blank" rel="noopener noreferrer">Read the science ↗</a></article>`; }).join('')}${(() => { const left = SAMPLE_IDS.filter(id => !sim.state.scans.includes(id)); return left.length ? `<article><h3>◉ ${left.length} organism${left.length > 1 ? 's' : ''} still unsequenced</h3><p>Follow the SAMPLE compass and press E at each gold marker. Estimated depths: ${left.map(id => SAMPLE_DEPTHS[id] - 3).join(' · ')} tiles.</p></article>` : ''; })()}</div><button class="primary" data-action="close-journal">Back to ${journalReturn === 'scan-result' ? 'soil result' : journalReturn === 'victory' ? 'results' : journalReturn === 'paused' ? 'pause menu' : 'exploration'} →</button>`;
  const scanDialog = ['scan-intro', 'scanning', 'scan-result'].includes(mode);
  o.innerHTML = `<div class="overlay-panel ${scanDialog ? 'scan-panel' : ''} ${mode === 'shop' ? 'shop-panel' : ''}" role="dialog" aria-modal="true" aria-label="${mode}" tabindex="-1">${scanDialog ? '<div class="scan-close-bar"><button class="scan-close" data-action="close-scan" aria-label="Close soil sample" title="Close soil sample">×</button></div>' : ''}${content}</div>`;
  o.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach(b => b.onclick = () => {
    void sound.enable();
    switch (b.dataset.action) {
      case 'text-size': largeText=!largeText;document.body.classList.toggle('large-text',largeText);try{storage.setItem('microload.largeText',String(largeText));}catch{}renderOverlay();break;
      case 'text-navigation': textNavigation=!textNavigation;try{storage.setItem('microload.textNavigation',String(textNavigation));}catch{}renderOverlay();break;
      case 'assist-return': assistReturn=!assistReturn;sim.assistReturn=assistReturn;try{storage.setItem('microload.assistReturn',String(assistReturn));}catch{}renderOverlay();break;
      case 'pad-side': padSide=padSide==='left'?'right':'left';document.body.dataset.pad=padSide;try{storage.setItem('microload.padSide',padSide);}catch{}renderOverlay();break;
      case 'close-settings': setMode(settingsReturn);break;
      case 'start-scan': scanTimer = 0; setMode('scanning'); break;
      case 'close-scan': if (scanningId && sim.state.scans.includes(scanningId)) renderer.reveal(sim.state.world.samples.find(s=>s.id===scanningId)!.y); scanningId = null; scanTimer = 0; setMode('playing'); break;
      case 'journal': openJournal(); break;
      case 'close-journal': setMode(journalReturn); break;
      case 'start': if (hasSave) setMode(sim.state.won ? 'victory' : 'playing'); else startFresh(); break;
      case 'play': setMode('playing'); break;
      case 'guide': setMode('tutorial'); break;
      case 'new': confirmReset(); break;
      case 'reset': startFresh(); break;
      case 'cancel': setMode(previousMode); break;
    }
  });
  o.querySelectorAll<HTMLButtonElement>('button[data-buy]').forEach(b => b.onclick = () => { if (sim.purchase(b.dataset.buy as Track)) { void sound.enable(); persist(); renderOverlay(); updateHUD(); } });
  o.querySelector<HTMLInputElement>('#volume')?.addEventListener('input',e=>sound.setVolume(Number((e.target as HTMLInputElement).value)/100));
  requestAnimationFrame(() => {
    if (scanDialog) o.querySelector<HTMLElement>('[role=dialog]')?.focus({ preventScroll: true });
    else o.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  });
}
function plantMarkup() {
  const d = sim.state.deposited;
  const growth = NUTRIENTS.reduce((sum,n)=>sum+Math.min(12,d[n]),0);
  const n = Math.min(1, d.N / PLANT_TARGET), p = Math.min(1, d.P / PLANT_TARGET), k = Math.min(1, d.K / PLANT_TARGET);
  return `<svg class="pea-plant" viewBox="0 0 200 110" role="img" aria-label="Pea plant: nitrogen ${Math.min(d.N, 12)} of 12, phosphorus ${Math.min(d.P, 12)} of 12, potassium ${Math.min(d.K, 12)} of 12"><path d="M15 73H185" stroke="#796949" stroke-width="2"/><g stroke="#d9be8d" fill="none" stroke-width="2"><path d="M100 72v${12 + p * 22}m0 -12l${-10 - p * 17} ${5 + p * 7}m${10 + p * 17} -${5 + p * 7}l${10 + p * 17} ${5 + p * 7}"/></g><g transform="rotate(${(1-k)*18} 100 73)" stroke="#91c96e" stroke-width="3" fill="none"><path d="M100 73Q${90+k*10} 42 100 17"/><g fill="hsl(${55+n*48} 50% ${40+n*12}%)"><path d="M98 50Q57 50 68 28Q99 29 98 50Z"/><path d="M100 37Q139 38 131 15Q100 17 100 37Z"/></g>${growth>=12?'<path d="M99 63Q71 65 77 48Q97 47 99 63Z" fill="#92c767"/>':''}${growth>=24?'<path d="M101 57Q128 61 129 43Q106 40 101 57Z" fill="#9bd776"/>':''}${growth>=36?'<ellipse cx="125" cy="25" rx="6" ry="13" fill="#b7e67c"/><circle cx="100" cy="16" r="6" fill="#f7ddf0" stroke="#d29bcf"/>':''}<path d="M101 20q14 -20 23 -10t-4 7" stroke-width="1.5"/></g></svg>`;
}
function updateHUD() {
  const s = sim.state, p = s.player, home = atHome(s);
  const er = p.energy / energyMax(s), hr = p.health / healthMax(s);
  for (const [id, value, max] of [['energy',p.energy,energyMax(s)],['health',p.health,healthMax(s)],['cargo',p.cargo.length,cargoMax(s)]] as const) {
    const bar = $<HTMLProgressElement>(id); bar.value = value; bar.max = max;
    $(`${id}-text`).textContent = id === 'cargo' ? `${value}/${max}` : `${Math.ceil(value/max*100)}%`;
    bar.classList.toggle('low', id !== 'cargo' && value/max <= .25);
  }
  const signature = JSON.stringify(s.deposited);
  if (signature !== plantSignature) {
    $('plant-display').innerHTML = plantMarkup();
    $('nutrient-totals').innerHTML = NUTRIENTS.map(n => `<div class="hud-meter" style="--nutrient:${NUTRIENT_INFO[n].color}"><label for="nutrient-${n}" title="${NUTRIENT_INFO[n].name}">${n}</label><span>${Math.min(12,s.deposited[n])}/12</span><progress id="nutrient-${n}" aria-label="${NUTRIENT_INFO[n].name} delivered" max="12" value="${Math.min(12,s.deposited[n])}"></progress></div>`).join('');
    if (plantSignature) { $('plant-display').classList.remove('growing'); void $('plant-display').offsetWidth; $('plant-display').classList.add('growing'); }
    plantSignature = signature;
  }
  $('bank').textContent = String(s.bank);
  $('scan-count').textContent = `◉ LEARN THE SOIL · ${s.scans.length}/${SAMPLE_IDS.length}`;
  $('scan-count').classList.toggle('done', s.scans.length === SAMPLE_IDS.length);
  const depth = Math.max(0,p.y-3), best = Math.max(depth, s.deepest ?? 0);
  $('depth').textContent = best > depth ? `${depth} tiles · best ${best}` : `${depth} tiles`;
  $('layer-label').textContent = ['A · TOPSOIL','B · SUBSOIL','C · PARENT MATERIAL'][layer(p.y)];
  const dx = HOME.x-p.x, dy=HOME.y-p.y;
  // Optimistic fuel estimate for the trip HOME: open-tunnel movement only, digging costs extra.
  const trip = Math.ceil((Math.abs(dx)+Math.abs(dy)) * .38 * energyUse(s));
  $('colony-arrow').innerHTML = `<b style="display:inline-block;transform:rotate(${Math.atan2(dy,dx)*180/Math.PI}deg)">➜</b> HOME · ${Math.abs(dx)+Math.abs(dy)}${home?'':` · ≥${trip}⚡`}`;
  const warnings = [];
  if (!home && er <= .25) warnings.push('Low energy: HOME or ⚡ food');
  else if (!home && p.energy <= trip * 1.6) warnings.push('Energy is tight for the trip HOME');
  if (!home && hr <= .25) warnings.push('Low health: HOME to repair');
  $('vital-warning').textContent = warnings.join(' · '); $('vital-warning').hidden = !warnings.length;
  const site = sim.nearbySample();
  // Compass points to the closest unmet organism, so the survey flows naturally downward.
  const next = s.world.samples.filter(a => !s.scans.includes(a.id)).sort((a,b)=>(Math.abs(a.x-p.x)+Math.abs(a.y-p.y))-(Math.abs(b.x-p.x)+Math.abs(b.y-p.y)))[0];
  const t = tileAt(s.world,p.x+sim.facing.x,p.y+sim.facing.y);
  $('location').textContent = next ? `SAMPLE ${s.scans.length+1}/${SAMPLE_IDS.length} · ${next.y>p.y?'↓':next.y<p.y?'↑':next.x>p.x?'→':'←'} ${Math.abs(next.x-p.x)+Math.abs(next.y-p.y)}` : 'ALL SAMPLES SCANNED';
  const survey=surveyForTile(s.world,p.y), surveyed=s.scans.includes(survey.id);
  $('survey-status').textContent=surveyed?'SURVEYED · N/P/K available':'UNSURVEYED · find the gold sample';$('survey-status').classList.toggle('surveyed',surveyed);
  $('dig-status').textContent = t===6 ? 'BEDROCK' : t===FOOD_TILE ? '⚡ +30' : p.cargo.length >= cargoMax(s)-2 ? (sim.assistReturn ? 'FULL → AUTO HOME' : 'FULL → DELIVER HOME') : '';
  const ready=s.scans.length===SAMPLE_IDS.length && NUTRIENTS.every(n=>s.deposited[n]+p.cargo.filter(v=>v===n).length>=12);
  const remaining=s.world.tiles.some((_,i)=>{if(surveyForTile(s.world,Math.floor(i/40)).id!==survey.id)return false;const t=playableTile(s.world,s.scans,i%40,Math.floor(i/40));return t>=2&&t<=4&&s.deposited[NUTRIENTS[t-2]]+p.cargo.filter(n=>n===NUTRIENTS[t-2]).length<12;});
  const homeword=sim.assistReturn?'Full → auto HOME.':'Full cargo → deliver HOME.';
  const prompt=s.won?'Plant restored! Deep survey open: harvest, upgrade, dive deeper.':ready?'Plant ready! Return HOME to finish.':!s.scans.length ? site?'Tap Scan to reveal your first nutrients.':home?'Dig straight down to the gold sample.':'Follow SAMPLE to your first scan.':er<=.25?'Low energy: HOME or orange food.': !s.trips ? !p.cargo.length?'Collect a glowing lettered tile.':`Good! ${p.cargo.length}/${cargoMax(s)} cargo. ${homeword}`:site&&!s.scans.includes(site.id)?'Tap Scan to unlock this area.':!surveyed?'New area. Find its gold sample.':!remaining&&next?'This area is harvested. Find the next sample.':er<=.25?'Low energy: HOME or orange food.':`Collect N/P/K. ${homeword}`;
  if($('objective-copy').textContent!==prompt)$('objective-copy').textContent=prompt;
  const narration=`Depth ${Math.max(0,p.y-3)}. Energy ${Math.ceil(er*100)} percent. Cargo ${p.cargo.length} of ${cargoMax(s)}. ${['up','right','down','left'].map((name,i)=>{const [dx,dy]=[[0,-1],[1,0],[0,1],[-1,0]][i],t=playableTile(s.world,s.scans,p.x+dx,p.y+dy);return `${name}: ${['tunnel','soil','nitrogen','phosphorus','potassium','hazard','bedrock','tunnel','energy food','low-oxygen water'][t]}`;}).join('. ')}. ${site?'Sample here. Press E.':$('location').textContent}. ${prompt}`;
  $('navigation-reader').classList.toggle('sr-only',!textNavigation);
  const narrationKey=`${p.x},${p.y},${p.cargo.length},${Math.floor(er*10)},${s.scans.length},${mode}`;
  if(textNavigation&&narrationKey!==lastNarration){$('navigation-reader').textContent=narration;lastNarration=narrationKey;}
  $('scan').textContent = site && s.scans.includes(site.id) ? 'Review' : 'Scan';
  $<HTMLButtonElement>('scan').disabled = mode !== 'playing' || !site;
  $('scan').classList.toggle('ready', mode === 'playing' && !!site && !s.scans.includes(site.id));
  $<HTMLButtonElement>('journal').disabled = !['playing','paused','victory','scan-result'].includes(mode);
  $<HTMLButtonElement>('scan-count').disabled = !['playing','paused','victory','scan-result'].includes(mode);
  $<HTMLButtonElement>('evolve').disabled = !home || mode !== 'playing';
  document.querySelectorAll<HTMLButtonElement>('[data-direction]').forEach(b=>b.disabled=mode!=='playing');
  $<HTMLButtonElement>('access').disabled=!['playing','paused','title','victory'].includes(mode);
}
$('access').onclick=()=>{if(mode==='settings')return;settingsReturn=mode;persist();setMode('settings');};
$('scan').onclick = beginScan;
$('journal').onclick = openJournal;
$('scan-count').onclick = openJournal;
$('pause').onclick = togglePause;
$('mute').onclick = toggleMute;
$('mute').textContent = sound.muted ? 'SOUND OFF' : 'SOUND ON';
$('mute').setAttribute('aria-label', sound.muted ? 'Unmute sound' : 'Mute sound');
$('evolve').onclick = () => { if (atHome(sim.state)) { sim.recover(); persist(); setMode('shop'); } };
function loseFocus() { scanWindowActive = false; if (mode === 'playing') { persist(); setMode('paused'); } input.clear(); sound.pause(); }
window.addEventListener('blur', loseFocus);
window.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='r'&&textNavigation&&mode==='playing'){lastNarration='';$('navigation-reader').textContent='Reading surroundings';}});
window.addEventListener('focus', () => { scanWindowActive = true; });
document.addEventListener('visibilitychange', () => { if (document.hidden) loseFocus(); });
window.addEventListener('pagehide', () => { if (hasSave) persist(); });
// Keep keyboard focus inside modal menus without trapping gameplay input.
document.addEventListener('keydown', e => {
  if (e.key !== 'Tab' || mode === 'playing') return;
  const buttons = Array.from($('overlay').querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input'));
  const first = buttons[0], last = buttons[buttons.length - 1];
  if (!buttons.includes(document.activeElement as HTMLElement)) { e.preventDefault(); (e.shiftKey ? last : first)?.focus(); }
  else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
});
let last = performance.now(), accumulator = 0, hudTimer = 0;
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, .1); last = now;
  if (mode === 'scanning' && scanningId && scanWindowActive && !document.hidden) {
    scanTimer += dt;
    const scanDuration = sim.state.scans.length ? 2.4 : 4.5;
    $<HTMLProgressElement>('scan-progress').max = scanDuration;
    $<HTMLProgressElement>('scan-progress').value = scanTimer;
    $('scan-stage').textContent = scanTimer < scanDuration/3 ? '1 / 3 · DNA READ · Read A, C, G and T.' : scanTimer < scanDuration*2/3 ? '2 / 3 · DNA MATCH · Identify a microbial relative.' : '3 / 3 · SOIL SURVEY · Locate the existing nutrient deposits.';
    if (scanTimer >= scanDuration) {
      if (sim.scan(scanningId)) persist();
      setMode('scan-result');
    }
  }
  if (mode === 'playing') {
    accumulator += dt; visualTime += dt; saveTimer += dt;
    const prevDeepest = sim.state.deepest ?? 0;
    while (accumulator >= 1 / 60 && mode === 'playing') {
      const beforeX=sim.state.player.x,beforeY=sim.state.player.y;
      sim.step(1 / 60, ...input.direction());const inputMoved=sim.state.player.x!==beforeX||sim.state.player.y!==beforeY; accumulator -= 1 / 60;
      if(guidedStart && !sim.state.scans.length && sim.nearbySample()){guidedStart=false;input.stopUntilRelease();accumulator=0;break;}
      if((textNavigation||input.singleStep) && (sim.events.some(e=>['collect','dig','food','hurt'].includes(e.kind)) || inputMoved)){input.stopUntilRelease();accumulator=0;break;}
      if (sim.events.some(e => e.kind === 'auto-return')) { input.stopUntilRelease(); accumulator = 0; break; }
    }
    const nowDeepest = sim.state.deepest ?? 0;
    if (prevDeepest < 31 && nowDeepest >= 31) notify('B HORIZON · SUBSOIL — denser mineral soil. Digging costs more; finds pay ✦20.', 8);
    if (prevDeepest < 64 && nowDeepest >= 64) notify('C HORIZON — weathered parent material. Watery low-O₂ pockets; finds pay ✦35.', 8);
    if (saveTimer >= 5) { persist(); saveTimer = 0; }
  } else { accumulator = 0; if (mode === 'title') visualTime += dt * .4; }
  for (const event of sim.events.splice(0)) {
    if (event.kind !== 'win' && event.kind !== 'auto-return') sound.play(event.kind === 'scan' || event.kind === 'full' ? 'fragment' : event.kind === 'food' ? 'collect' : event.kind, event.kind === 'dig' ? [1.1, .9, .72][layer(event.y)] : 1); renderer.burst(event.x, event.y, event.kind === 'hurt' ? '#ff7595' : '#d4ff70');
    if (event.kind === 'food') { notify(`⚡ +${Math.round((event.energyRestored ?? 0) * 10) / 10} energy`, 6); persist(); }
    if (event.kind === 'full') notify('Cargo full — deliver it HOME. Watch the ⚡ trip estimate.', 6);
    if (event.kind === 'push') notify('🪱 An earthworm burrowed through and shoved you!', 4);
    if (event.kind === 'strain') notify(layer(event.y) === 2 ? 'Compacted C horizon — Enzyme boost tiers make digging practical.' : 'Dense subsoil — an Enzyme boost digs it much faster.', 7);
    if (event.kind === 'deposit') {
      const d=sim.state.deposited, total=NUTRIENTS.reduce((sum,n)=>sum+Math.min(12,d[n]),0);
      const milestone=total>=36?'Nutrients complete!':total>=24?'Your pea plant is thriving.':total>=12?'Your pea plant is growing.':'Your pea plant is recovering.';
      notify(`${event.closeCall ? '⚡ Close call — made it on fumes! ' : ''}${milestone} ${total}/36 delivered.`,5);
      $('plant-display').classList.add('celebrate');
      $('growth-feedback').innerHTML = `${plantMarkup()}<strong>${milestone}</strong><span>${total}/36 nutrients delivered</span>`; $('growth-feedback').hidden = false;
      clearTimeout(plantCelebrationTimer); plantCelebrationTimer=setTimeout(()=>{ $('plant-display').classList.remove('celebrate'); $('growth-feedback').hidden=true; },2400); persist();
    }
    if (event.kind === 'auto-return' && !sim.state.won) { notify('Cargo full → HOME · Delivered & refilled', 4); if (!matchMedia('(prefers-reduced-motion: reduce)').matches) document.querySelector('.viewport')!.animate([{opacity:.35},{opacity:1}],{duration:650}); persist(); }
    if (event.kind === 'respawn') { notify(`${event.reason === 'both' ? 'Energy and membrane reached zero.' : event.reason === 'energy' ? 'Energy ran out from moving or digging.' : 'Membrane reached zero from damage.'} Returned HOME. Cargo returned to surveyed soil; delivered progress kept.`, 12); persist(); }
    if (event.kind === 'collect') { const n = event.nutrient; if (n && !discoveredNutrients.has(n)) { discoveredNutrients.add(n); queueDiscovery(`${n} · ${NUTRIENT_INFO[n].name}: ${NUTRIENT_INFO[n].role}`); } }
    if (event.kind === 'win') { persist(); setMode('victory'); void sound.enable().then(() => sound.play('win')); }
  }
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').classList.remove('show'); }
  renderer.draw(sim, visualTime, dt, mode === 'playing');
  hudTimer += dt; if (hudTimer > .1) { updateHUD(); hudTimer = 0; }
  requestAnimationFrame(frame);
}
setMode('title'); requestAnimationFrame(frame);
