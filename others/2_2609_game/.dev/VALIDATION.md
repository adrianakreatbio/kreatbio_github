# Validation — 12 September 2026

Implemented in `2_2609_game`: fast digging, N/P/K plant restoration, three microbial sample patches, simulated portable DNA sequencing, field journal, v2 persistence and v1 migration. The adjacent game was not changed.

- TypeScript/Vite production build passes.
- 20 unit/integration tests pass, covering timing and unchanged per-tile energy costs, collection/deposits/upgrades, hazards, recovery, mission completion, migration, and safe sample/resource availability over 100 seeds.
- Seeded simulation pilot: 46.58 active seconds, four deposits, zero deaths, three scans, three upgrades. This planning-aware simulation excludes browser interaction and scan-animation overhead.
- **Complete real-time Chrome expedition passed:** seed 2609, 126.97 active seconds, 153.01 wall seconds, four deposits, zero deaths; N=12/P=12/K=13; all three samples sequenced; energy, digestion and storage upgraded once. Mid-expedition reload preserved progress. No browser page errors. The pilot uses normal keyboard movement, E scanning and shop clicks, not state edits or accelerated simulation.
- Chrome smoke checks pass: start, movement, save/reload, pause, mute, shop, confirmed/cancelled reset, narrow layout, invalid saves.
- Discovery checks pass: scan pause/cancel/completion, result text, journal pause/return behavior, persistence and narrow layout.
- Visual fixtures pass: deep soil, hazard damage, purchasing, and plant-restoration ending.
- Production checks pass under `/others/2_2609_game/`, including asset loading, movement, stable paused state and blocked localStorage.

The 5–8-minute first-time session remains a design target, not an established human-play result. The automated browser pilot finished in 2:33. Faster navigation is intentional; no waiting was added to pad duration. A human playtest is still needed to assess discovery comprehension and pacing.

Reports and screenshots are in ignored `test-results/`; `expedition.json` records the complete run. See README for reproducible commands. No deployment was performed.

## Sequencing clarity follow-up

E now opens an untimed explanation before a 4.5-second, three-stage sequencing demonstration. Results stay paused until the player chooses “Show me on the map,” and include the finding, its meaning and a concrete next action. Completed sites can be reviewed with E; the journal returns to the result when opened from it. The previous expedition timing above predates this user-paced flow. The browser pilot has been updated to acknowledge the new screens.

## Vitals clarity follow-up

Added inline explanations for energy, membrane, cargo and research credits; LOW/CRITICAL labels; persistent world warnings for simultaneous risks; and cause-specific forced-return messages. Production build and all 21 unit/integration tests pass, including return reasons and retained progress.
Chrome vitals checks also pass: explanatory copy, combined warnings, critical threshold, narrow-screen overflow, warning removal after recovery, and energy-versus-membrane return messages. Screenshot: `test-results/vitals-warning.png`.

## Direct instructions and deliberate sample closing

Moved HOW TO WIN to the top of the dashboard with explicit deposited N/P/K counters and the 3-sample requirement. Energy explains that only entering HOME refills it and no block restores it. HOME points to free energy; E explains its identification function and required scan progress.

Soil sample dialogs now have a dedicated top-right ×. Text/background clicks and Escape do not dismiss them; initial keyboard focus is on the dialog, not a dismissal button. Switching windows preserves the sample dialog and pauses an unfinished scan. Result-to-journal navigation retains the result. The build passes.
Chrome checks pass for background/text clicks, Escape/Enter/Space without a focused action, scan focus loss, deliberate × closing/cancellation, result replay and journal return. The direct objective, HOME refill text and existing vitals checks also pass.

## Energy-food blocks

Added six orange ⚡ organic-food tiles beside the main route (first at depth 4). Each is consumed on entry and restores up to 30 energy, capped at the current capacity; normal movement energy still applies. Food works with full cargo, changes neither plant resources nor membrane health, and does not respawn. Save v3 persists consumption; v1/v2 saves receive food once without resetting their progress. Updated energy instructions, warnings, legend and journal to distinguish food from N/P/K.

Build and all 25 unit/integration tests pass, including 100-seed food placement, near-zero/full-cargo collection, capacity caps, single use, reload/failure persistence and v2 migration.
Chrome energy-food checks pass: visible food, collection with full cargo, energy gain, unchanged health/cargo, immediate saving, reload without regeneration, and narrow-screen layout. Screenshot: `test-results/energy-food-before.png`.

## Concise phone copy

Shortened vitals, refill/repair advice, cargo/credit explanations, world warnings and NEXT actions. Replaced the E paragraph with “E: scan soil DNA → identify microbes.” Healthy exploration hides redundant advice; the zero-vitals consequence appears once. Chrome vitals checks pass, including a 390px layout screenshot (`test-results/vitals-mobile-concise.png`).

## Automatic full-cargo return

Removed the two requested explanatory lines from the sample introduction/result. Full cargo now automatically returns to HOME, deposits all nutrients for plant progress and credits, and refills energy/health. This does not count as a death. Existing full-cargo saves return on their next simulation step; zero-vitals failures retain their prior cargo-loss rule. Held movement keys are suppressed until released after an automatic return.

Build and 28 unit/integration tests pass, including all storage levels, final-item collection, automatic winning delivery, no duplicate deposits and zero-vitals precedence. The seeded simulation progression test passes with automatic returns.
Chrome automatic-return checks pass: collection fills cargo, safe return/deposit/refill, held-key suppression, movement after release, and reload without duplicate deposits. Screenshot: `test-results/auto-return.png`.

## Compact HUD, touch controls and gameplay revision (2026-09-12)

Replaced the right sidebar with a compact header containing N/P/K delivery bars, energy and health percentages, cargo and DNA counts, and credits beside Upgrade. Instructions are in the starting guide and Notes. The direction pad supports holding, sliding between directions, release/cancel, and held-input suppression after automatic HOME return. The active game fits portrait and landscape screens without page scrolling.

Unknown nutrients in sample patches render as question marks. DNA identifies the featured microbe; a separate paired soil survey reveals existing resources or a guaranteed bypass. The risk sample no longer recommends potassium. New worlds vary sample positions and organism order. Existing saved worlds retain their sites and progress. Subsequent scans skip the introduction and use a shorter animation; results still require × to close.

Four one-time upgrades cost 250 credits total. Storage also reduces movement/digging energy costs in proportion to capacity. Old multi-level upgrades remain readable and retain their effects. Plant delivery cards and milestones show growth, with a larger animated final plant.

Validation: build passes; 33 unit/integration tests pass. Tests cover survey persistence without creating nutrients, 100-seed route/placement variety, storage energy efficiency, legacy upgrade preservation, and normal-cost completion on seeds 7, 91 and 2609. Chrome smoke checks pass. Chrome touch checks pass at 390×844, 320×568 and 844×390: repeated hold movement, slide turning, release/cancel, no scrolling, auto-return suppression, explicit-close scan results, risk copy and victory rendering. These are emulated touch checks, not physical-device tests. Screenshots: `phone-hud.png`, `phone-scan-result.png`, `survey-before.png`, `survey-after.png`, `phone-victory.png` in `test-results/`.

`tests/phone.mjs` replaces the historical sidebar-specific browser checks for this layout. Earlier validation entries describe earlier revisions and are retained as history.

Production Chrome checks also pass: nested static hosting, all assets, real movement, pause stability and gameplay when browser storage is denied.

Final normal-control browser expedition passed on seed 2609: victory with N12/P13/K12 and all 3 scans, 4 deposits, 0 deaths, digestion/energy/storage purchased, and mid-game reload verified. Active time 99.87 seconds; wall time 128.47 seconds. No browser errors. Report: `test-results/expedition.json`; screenshot: `test-results/victory.png`. This automated pilot time is not a first-time human play-duration estimate.

## Scan before collecting (2026-09-12)

All N/P/K is now hidden as ordinary soil and cannot be collected until its area's sample is scanned. Each sample unlocks a depth area; later areas stay locked. Digging an unrevealed deposit yields ordinary soil, with no nutrient award. Removed question-mark blocks. Orange food remains available without scanning. The first sample is one step down from HOME and needs no upgrades. Closing a completed result triggers a brief highlight of revealed deposits; cancelling an unfinished scan unlocks nothing.

Save v4 keeps the existing world, deposits, cargo, credits, upgrades and scans. V3 migration relocates the first sample beside HOME. Starter nutrient recovery also obeys scan gating. Updated the starting guide, active prompt and Notes around “scan → reveal → collect.”

Build and 36 unit/integration tests pass, including unavailable/available nutrient behavior, per-area unlocks, recovery gating, v3 migration, and normal-cost mission completion on seeds 7, 91 and 2609.

Chrome phone regression passes, including no cargo from unscanned soil, cancelling a scan without credit, completing the scan, collecting a newly unlocked N tile, explicit-close results, and existing hold/slide/return behavior at three screen sizes. Inspected `test-results/phone-hud.png`: ordinary soil and orange energy food are visible before scanning, with no N/P/K or question-mark tiles.

## Full assessment fixes and second pass (2026-09-12)

New worlds contain exactly 16 each of N/P/K, distributed so that any two survey areas cannot satisfy the goal. Preserved hidden deposits live separately from dug terrain and become loose pickups after scanning. Lost cargo returns to surveyed soil, conserving the supply. Optional hazard shortcuts and marked safe perimeter routes make armor and navigation meaningful. Older layouts remain intact to preserve existing progress.

Added staged first-play prompts, an initial stop at the first sample, a final HOME prompt, visible survey status/boundaries, layer textures, separate DNA and soil-survey stages, focused N/P/risk actions, concise victory summaries and three rotating optional challenges. Accessibility adds larger text, tile descriptions, repeat-surroundings, single-step movement, keyboard direction-button activation and reduced-motion canvas effects. Volume is adjustable; digging cues are quieter and throttled. Replaced the obsolete sidebar stylesheet and consolidated the active browser suite; historical scripts are archived.

Reassessment found and fixed legacy recovery overwriting preserved deposits, and incorrect downward guidance after passing the initial sample. Regression tests cover the legacy case. Build and all 42 tests pass. Chrome's consolidated suite passes, including 320×568 larger-text navigation. Full normal-control browser expedition passes: N12/P12/K12, 3 scans, 3 deliveries, 0 deaths, 114.03 active seconds, 146.66 wall seconds, mid-game reload verified and no errors. See `REASSESSMENT.md` for design scores and remaining human-testing limits.

Optional WebKit verification could not launch: the installed revision differs from Playwright's expected revision, and launching its executable directly fails on missing `libevent-2.1.so.7`. This is an environment limitation; Safari behavior is not claimed as verified. No system packages were installed for this optional check.

The optional Firefox check also could not reach gameplay: the cached executable uses an older automation protocol than the installed Playwright client (`Browser.setDefaultViewport` schema mismatch). Cross-engine verification remains incomplete; these launch/protocol failures are not reported as game failures or passing compatibility tests.

## Static folder packaging — 2026-09-12

Public layout now matches the first game: `index.html`, `game.js`, `styles.css`, `assets/`. Source, dependencies, configuration, tests and documentation moved together into `.dev/`. Vite builds a classic IIFE script and standalone CSS; `publish-static.mjs` copies the runtime files to the public parent without clearing that folder. Rebuild from `.dev/` with `npm run build`.

Validation: TypeScript/build passed; all 42 unit tests passed. Chrome production checks passed for local hosting at `/others/2_2609_game/`, relative assets, movement, stable paused state, denied storage, direct `file://` opening, and a 390×844 phone viewport without page overflow. Screenshots: `test-results/production-nested.png` and `test-results/production-file-phone.png`. This verifies local delivery; no website deployment was performed.

## Deep survey update — 13 September 2026

Motherload-inspired loop revision, keeping the scientific framing:

- Full cargo no longer teleports HOME; the player walks it back. Assisted return in Aa settings restores automatic delivery (default off). A one-time "Cargo full" cue fires, the HUD shows a minimum ⚡ trip estimate, and the canvas edge pulses red under 25% energy (static under reduced motion).
- Deposits are stratified like real soil: the shallowest survey area is N-rich, the middle P-rich, the deepest K-rich ([8,4,4]/[4,8,4]/[4,4,8]); any two areas still cannot finish the goal. Ten bonus K tiles sit below y=78 in the C horizon (weathering framing), gated behind the deepest survey's scan.
- Delivered nutrients bank credits by collection depth (10/20/35), framed as expedition/data value, not fertility. Upgrades regained three tiers (total ✦1390 = maximum income of a perfect harvest; tier 1 remains ✦250).
- Energy food reduced to three tiles, all in the topsoil (organic matter declines with depth). Dig cues pitch down with layer hardness. Horizon labels A/B/C with first-entry milestones; deepest-dive record shown and saved.
- New tile 9: waterlogged low-oxygen pockets in the deep band — passable without digging, 8 damage per tick (reduced by membrane tiers), cleared from spines/bypasses, journal entry and legend distinguish them from fictional pink hazards.
- Victory no longer freezes the simulation: the deep survey stays open for harvesting, purchases and depth records, without re-emitting the win.
- Save v6 (per-item cargo values, deepest record, tile 9). V1–v5 migrate with progress kept; v5 shows a notice. Assisted-return preference persists outside the game save.

Validation: build passes; 50 unit/integration tests pass, including 100-seed pocket/stratification/water placement, depth-value banking, close-call flags, post-win play, v5 migration and strict new-field validation. The three-seed simulation pilot wins with 0 deaths (56–99 active seconds, bank 480–515 remaining for tiers 2–3). The consolidated Chrome suite passes (smoke, phone with assisted-recall scenario, accessibility, audio, default + assisted return, production hosting). Full real-time Chrome expedition on seed 2609: victory N12/P12/K12, 3 scans, 3 manual deliveries, 0 deaths, 113.4 active seconds / 137.6 wall seconds, mid-game reload verified, no browser errors. Human playtesting of the new return-trip tension remains outstanding.

## Ten organisms, strict stratification and difficulty pass — 13 September 2026

- Ten gold DNA samples, depth-bound by real ecology (Rhizobium 9, Pseudomonas 15, Azotobacter 21, Streptomyces 27, Bacillus 40, Rhizophagus 47, Trichoderma 54, Nitrosomonas 60, Fusarium spores 67, archaeon 78). Three remain nutrient surveys; seven are discoveries paying ✦25 each, all journaled with sources and "presence, not activity" qualifications. Winning now requires 12/12/12 plus all ten scans.
- Strict stratification: N exists only in the topsoil survey area, P only in the subsoil, K only in the deep area ([16,0,0]/[0,16,0]/[0,0,16]); every survey is mandatory. Lost cargo returns to its own nutrient's area. Sample identity order is fixed (positions still vary by seed).
- First sample moved from one step to six digs below HOME; guided prompts updated.
- Difficulty: 16 pathogen spawners in depth bands (topsoil ×3, subsoil ×6, deep ×7, previously 8 total below y=39), with deeper ones moving faster (0.65/0.5/0.38s) and hunting further (7/9/11). Rock density now 4/7/10% by horizon, rendered as pale faceted stone. Energy food rows moved to 7/19/31.
- Goal made visible: gold pulsing **◉ LEARN THE SOIL · x/10** header chip (opens the Field Journal, calm cyan when complete) and the ⚡ symbol on the Energy meter; title/tutorial state the learning goal outright.
- Upgrade ladder re-priced (total ✦1565 = max income incl. discovery bonuses). Save v7 accepts 3- or 10-sample worlds; v1–v6 migrate with discovery sites added and progress kept.

Validation: build passes; 51 unit/integration tests pass (100-seed checks for ten reachable samples, strict per-area supplies, pocket/water placement, discovery bonus and ten-scan win, v5/v6 migration). Three-seed simulation pilot wins with 0 deaths in 56–96 active seconds. Consolidated Chrome suite passes (smoke, phone, accessibility with the deeper first-sample walk, audio, default+assisted return, production incl. file://). Full real-time Chrome expedition on seed 2609: victory with all 10 scans, N12/P12/K12, 4 deliveries, 0 deaths, 222.0 active seconds / 270.4 wall seconds, mid-game reload verified, no browser errors. Human playtesting of pacing and difficulty remains outstanding.
