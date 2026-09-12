# Microload — read the soil, help life grow

A short soil exploration game for KreatBio. Scan three soil samples, deliver 12 each of nitrogen, phosphorus and potassium, and return HOME to restore a pea plant.

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
- The first sample is one step down from HOME. Short prompts guide scanning, collection and the first delivery. Notes contains the complete rules.
- Before scanning, nutrients look like ordinary soil. Digging preserves their deposits beneath the tunnel. Once that area is scanned, walk over preserved deposits to collect them; no new wall appears, including beneath the player.
- Each new world contains 16 N, 16 P and 16 K distributed across three survey areas. Any two areas leave at least one target incomplete. Supplies and sample order vary by seed.
- A tinted surveyed area and dashed border distinguish mapped from unmapped soil. The compass directs you toward remaining samples. Marked safe routes avoid optional hazard shortcuts.
- Orange food is available without scanning and restores up to 30 energy. HOME fully repairs/refills and deposits. Full cargo automatically returns HOME; release your input before moving again.
- Zero energy or health loses the current cargo and returns HOME. In balanced worlds, lost cargo returns to the soil with no credits or plant progress; total supply remains finite.
- Upgrades cost 60 / 80 / 60 / 50 credits: faster digestion, more energy, larger storage with 37.5% less energy use, or armor with 33% less hazard damage. Each nutrient delivered earns 10 credits.
- Replay cycles optional challenges: explore freely, finish without cargo loss, or use at most four deliveries. The core win condition stays the same. Missing a bonus never blocks restoring the plant.

## Accessibility and sound

Open **Aa** for larger text, text navigation and volume. Text navigation describes nearby tiles and changes movement to one tile per press. R repeats the surroundings. Direction buttons support keyboard activation as well as touch. Menu focus stays within dialogs. Scan results require the explicit × button; incidental clicks and Escape do not dismiss them.

The game respects the reduced-motion preference for CSS and canvas effects. Sound uses quiet generated event cues; rapid digging is throttled. Volume and mute persist separately from the game save. A zero volume setting is silent. Text navigation and layouts have browser automation coverage; physical-device comfort, actual screen-reader behavior and subjective listening quality require human testing.

## Science and simplifications

`src/biology.ts` contains nutrient roles, strain/context qualifications and source links. The workflow explicitly separates DNA reading/matching from a soil survey that locates existing deposits. A DNA match alone does not measure fertility, nutrient levels, microbial activity or disease.

Rhizobium-related results guide attention to N; Bacillus-related results to P; the potential-pathogen result directs attention to safer routing. These are teaching cues in a stylized world, not diagnostic advice. Named organisms are distinct from fictional contact hazards. Nutrient effects overlap; plant animations and counts are illustrations, not fertilizer rates. No sample files or personal information are uploaded.

## Saving

Save format v5 uses `kreatbio.microload.save` in browser storage. It includes preserved underground deposits, optional challenge, terrain, nutrients, scans, upgrades and progress. Saves occur on major events, pause, page exit and every five active seconds. Storage failures permit session-only play.

Existing v1–v4 saves migrate without resetting progress. V3 moves the first sample beside HOME. Older resource layouts are retained; start a new culture to use the finite supply distribution and optional shortcuts. Previously earned multi-level upgrades keep their effects. V1's original save is backed up when storage permits. Reset requires an explicit confirmation.

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
