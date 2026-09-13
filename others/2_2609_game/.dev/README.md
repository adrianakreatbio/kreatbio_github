# Microload — read the soil, help life grow

A short soil exploration game for KreatBio. Meet ten real soil organisms, deliver 12 each of nitrogen, phosphorus and potassium, and return HOME to restore a pea plant.

## Open locally

Open `../index.html` directly in a browser, or visit **https://kreatbio.com/others/2_2609_game/** after publishing. Playing requires no Node, terminal or build server.

The public folder follows `1_2608_game`: `index.html`, `game.js`, `styles.css`, and `assets/`. Upload these four entries together at `others/2_2609_game/`. All runtime links are relative. `.dev/` holds the editable source, tests and tooling and does not need to be uploaded.

## Edit and rebuild

From `others/2_2609_game/.dev/`, use Node 20.19+ and `npm ci` on a fresh checkout:

```sh
npm run dev
```

Open the address Vite prints. Edit `src/` for gameplay/styles, `public/assets/` for images, and `site.html` for the published HTML. Then run:

```sh
npm run build
```

This refreshes the four public entries in the parent folder. Generated `game.js` and `styles.css` should be committed with source changes. No deployment runs automatically.

## Controls and progression

- Hold the direction pad, WASD or arrows to move/dig. Slide between pad arrows to turn; release to stop. Tap Scan or press E beside a gold marker.
- Ten gold DNA samples, depth-ordered by real ecology. Three surveys (Rhizobium, Bacillus, the Fusarium risk sample) unlock the nutrient areas; seven discoveries (Pseudomonas, Azotobacter, Streptomyces, a mycorrhizal fungus, Trichoderma, Nitrosomonas, a soil archaeon) each pay ✦25 and fill the Field Journal. The gold **◉ LEARN THE SOIL** counter in the header tracks all ten and opens the journal. Winning requires 12 N/P/K delivered plus all ten scans.
- The first sample sits six digs below HOME; short prompts guide the descent, scanning, collection and the first delivery. Notes contains the complete rules.
- Before scanning, nutrients look like ordinary soil. Digging preserves their deposits beneath the tunnel. Once that area is scanned, walk over preserved deposits to collect them; no new wall appears, including beneath the player.
- Each new world contains 16 N, 16 P and 16 K, strictly stratified like real soil: nitrogen only in the topsoil survey area, phosphorus only in the subsoil area, potassium only in the deepest — every survey is mandatory and every trip has a purpose. Ten bonus potassium pockets sit below the deepest survey in the C horizon — surplus credits, never required for the plant.
- Pathogen pressure rises with depth: ~20 spawners banded by horizon, and deeper ones move faster and hunt from further away. Rock fragments also thicken toward the parent material (4/7/10% by horizon) and render as pale faceted stone, forcing detours that strain the energy budget.
- Three earthworms churn the soil, digging real burrows (bioturbation) and shoving anyone they bump into — harmless, but a shove can land you in a hazard. Their tunnels can also open useful routes.
- Lower horizons are dense. Without Enzyme boosts, B-horizon soil digs at 0.6s/4⚡ per tile and the C horizon at 1.1s/7⚡ — a soft gate: upgrades are effectively required to work the deep game. A one-time hint appears the first time you strain against each horizon.
- A tinted surveyed area and dashed border distinguish mapped from unmapped soil. The compass directs you toward remaining samples. Marked safe routes avoid optional hazard shortcuts. Blue waterlogged pockets in the deep band are passable shortcuts that slowly stress the microbe (low oxygen).
- Orange food is available without scanning, restores up to 30 energy, and only appears in the topsoil — organic matter declines with depth, so deep trips must be budgeted. HOME fully repairs/refills and deposits.
- Full cargo stops collection; bring it HOME yourself. The HUD shows a minimum ⚡ estimate for the trip, and the screen edge pulses red at low energy. Assisted return (Aa settings) restores the old automatic delivery, and pairs well with text navigation.
- Zero energy or health loses the current cargo and returns HOME. In balanced worlds, lost cargo returns to the soil with no credits or plant progress; total supply remains finite.
- Delivered nutrients earn research credits by the depth they were collected at: ✦10 topsoil, ✦20 subsoil, ✦35 C horizon. Upgrades have three tiers each (digestion 60/110/220, energy 80/130/240, storage 60/110/220, membrane 50/90/195); the full ladder costs exactly the maximum research income of a perfectly harvested world including all discovery bonuses.
- The header names the current horizon (A/B/C) with a milestone note on first entry, and the depth readout tracks your deepest dive.
- Replay cycles optional challenges: explore freely, finish without cargo loss, or use at most four deliveries. The core win condition stays the same. Missing a bonus never blocks restoring the plant. After victory the deep survey stays open: keep harvesting, upgrading and diving.

## Accessibility and sound

Open **Aa** for larger text, text navigation, assisted return and volume. Text navigation describes nearby tiles and changes movement to one tile per press. R repeats the surroundings. Direction buttons support keyboard activation as well as touch. Menu focus stays within dialogs. Scan results require the explicit × button; incidental clicks and Escape do not dismiss them.

The game respects the reduced-motion preference for CSS and canvas effects. Sound uses quiet generated event cues; rapid digging is throttled. Volume and mute persist separately from the game save. A zero volume setting is silent. Text navigation and layouts have browser automation coverage; physical-device comfort, actual screen-reader behavior and subjective listening quality require human testing.

## Science and simplifications

`src/biology.ts` contains nutrient roles, strain/context qualifications and source links for all ten organisms — Rhizobium, Pseudomonas fluorescens, Azotobacter, Streptomyces, Bacillus, the mycorrhizal fungus Rhizophagus, Trichoderma, Nitrosomonas, the Fusarium species complex and the archaeon Nitrososphaera. Every entry states that a DNA match shows presence, not measured activity. The workflow explicitly separates DNA reading/matching from a soil survey that locates existing deposits. A DNA match alone does not measure fertility, nutrient levels, microbial activity or disease.

Rhizobium-related results guide attention to N; Bacillus-related results to P; the potential-pathogen result directs attention to safer routing. These are teaching cues in a stylized world, not diagnostic advice. Named organisms are distinct from fictional contact hazards. Nutrient effects overlap; plant animations and counts are illustrations, not fertilizer rates. No sample files or personal information are uploaded.

The depth structure follows real soil science with stated simplifications: organic nitrogen concentrates in the A horizon, mineral phosphorus and potassium come from deeper weathering (feldspar/mica for K in the C horizon), organic matter — the microbe's food — declines with depth, bulk density and rock-fragment content rise toward the parent material (hence slower, costlier digging), earthworms mix soil through real bioturbation, and waterlogged pore space is oxygen-poor. Deeper finds pay more research credits because deep samples are rarer and costlier to obtain, not because deep soil is more fertile; the journal states that topsoil is usually the most fertile layer. Waterlogged pockets are labeled real phenomena, kept visually distinct from the fictional pink hazards.

## Saving

Save format v8 uses `kreatbio.microload.save` in browser storage. It includes preserved underground deposits, per-item cargo values, deepest-dive record, optional challenge, terrain, nutrients, scans, upgrades and progress. Saves occur on major events, pause, page exit and every five active seconds. Storage failures permit session-only play. The assisted-return, text-navigation, larger-text and volume preferences persist separately from the game save.

Existing v1–v7 saves migrate without resetting progress; the seven discovery sites and the earthworms are added to older worlds so their expanded goal stays reachable. V3 moves the first sample beside HOME. Older resource layouts are retained; start a new culture to use the strict stratification, deeper first sample, denser pathogens/rocks, deep pockets and waterlogged shortcuts. Previously earned multi-level upgrades keep their effects and can be extended in the shop. V1's original save is backed up when storage permits. Reset requires an explicit confirmation.

## Checks and production

```sh
npm test
npm run build
npm run test:browser
npm run test:expedition
```

The browser suite runs the desktop, touch, accessibility, audio-control, automatic-return and nested-production checks. It uses `/usr/bin/google-chrome`; `CHROME_PATH` overrides it. Set `BASE_URL` to your dev server (for this session, `http://localhost:5174`). Production checks serve the public parent folder from a nested local path and open its HTML directly via `file://`. Run them alone with `npm run test:production`. Artifacts go into ignored `test-results/`.

The expedition pilot uses normal movement, scanning and purchases and verifies a mid-game reload. Its time is not a measurement of first-time human play. Older sidebar scripts live in `tests/historical/` and are excluded from the active suite. Build output uses relative asset paths for static hosting. Nothing is automatically deployed.

Optional cross-engine checks are in `tests/engines.mjs` and require matching Playwright browser installations and system libraries. `BROWSER_ENGINE`, `WEBKIT_PATH` and `FIREFOX_PATH` allow selecting an engine/executable. They are excluded from the default suite because this environment's cached WebKit/Firefox installations cannot run with the current dependencies. They must not be counted as passing Safari/Firefox coverage.
