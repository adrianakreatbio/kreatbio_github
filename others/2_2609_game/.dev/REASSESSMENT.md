# Post-fix assessment — 2026-09-12

Design judgement against a finished short educational game, not independent player ratings. Overall: approximately **8/10** (previously 7/10). The strongest changes address fairness and progression. Human testing is still needed for comfort, learning retention and replay appeal.

| Aspect | Before | Now | Change and remaining limit |
|---|---:|---:|---|
| Objective clarity | 8 | 9 | Explicit final HOME prompt once carried and delivered nutrients can finish the plant. |
| First-time experience | 7 | 8 | Short introduction; first movement stops at the sample; prompts teach scan, collect and deposit in order. |
| Phone controls | 8 | 8 | Hold/slide/release retained and tested; physical thumb comfort unverified. |
| HUD/readability | 8 | 8.5 | Higher contrast, larger key labels, optional larger text, compact header retained. |
| Movement/digging | 8 | 8 | Fast timings retained; quieter, throttled dig sounds and different layer textures. |
| Scanning | 7 | 8 | Explicit DNA read → DNA match → separate soil survey; each survey unlocks necessary resources. |
| Resource distribution | 5 | 8.5 | New worlds have 16 of each nutrient split across three areas; any two areas cannot finish the goal. |
| Exploration/navigation | 6 | 7.5 | Survey tint, boundary lines, status label and marked safe perimeter routes. |
| Hidden-resource fairness | 5 | 8.5 | Digging preserves deposits. Scanning reveals loose pickups without blocking the player or duplicating awards. |
| Energy/automatic return | 7 | 7.5 | Finite supplies limit unnecessary collection as an escape strategy; existing clear return/refill behavior retained. |
| Upgrades | 7 | 7.5 | Armor now reduces damage by one third and supports optional hazard shortcuts. |
| Challenge/decisions | 5 | 7 | Optional short hazard routes trade health for time/energy; a safe route remains available. |
| Educational value | 7 | 7.5 | Helpful findings direct attention to N/P and their roles; risk findings direct attention to safer routes. Learning retention unmeasured. |
| Scientific framing | 7 | 8 | DNA identification and nutrient surveying are visibly separate stages; existing scientific qualifications remain in Notes. |
| Visual identity | 8 | 8 | Layer details, surveyed terrain and route markings added without changing the established style. |
| Plant reward/ending | 7 | 8 | Celebration leads; concise personal discovery summary and optional challenge result replace the long lesson. |
| Replay | 5 | 6.5 | Rotating optional goals: free exploration, no cargo losses, at most four deliveries. Still only three featured organisms. |
| Accessibility | 5 | 7 | Larger text, text navigation, one-step input, repeat-surroundings command, keyboard button activation, reduced-motion canvas. Actual screen-reader testing remains unverified. |
| Reliability | 8 | 8.5 | Expanded tests for supply conservation, hidden pickups, migration and recovery; full normal-control expedition verified. |
| Maintainability | 6 | 7.5 | Replaced layered sidebar CSS with one stylesheet; consolidated active browser suite and archived obsolete scripts. Main UI still uses template strings. |
| Audio | Not rated | Not rated | Added volume, true zero-volume silence, quieter/throttled dig cues. Audio lifecycle and preferences checked; subjective listening unverified. |

## Reassessment and second correction pass

1. Older worlds use a legacy nutrient-recovery rule. It could overwrite a preserved hidden deposit and invalidate a save. Recovery now skips preserved deposits; a regression test covers it.
2. The initial prompt incorrectly instructed players who had already passed the sample to keep moving down. Guidance is now position-aware, and a fresh game's first movement stops at the sample.
3. Accessibility review added single-step keyboard activation of direction buttons, stable narration updates and an R command to repeat surroundings. Larger text is checked at 320×568.

## Verified evidence

- Build and 42 unit/integration tests pass.
- 100-seed checks verify finite supply, necessary survey areas and safe access.
- Three simulation expeditions finish with normal costs and zero deaths.
- Consolidated Chrome suite passes: desktop, touch, accessibility, audio controls, automatic return and production hosting/storage failure.
- Final browser expedition: N12/P12/K12, all three scans, three deliveries, zero deaths, upgrades purchased, mid-game reload verified, no browser errors. About 114 active seconds / 147 wall seconds for an automated pilot; not a human-duration estimate.

Existing saves retain their resource layout and progress. Start a new culture for finite supplies and optional shortcut layouts. Preserved-deposit fixes and UI improvements also apply to existing saves.

Safari/WebKit remains unverified: the installed browser cannot launch because a required system library is missing. This does not change the passing Chrome evidence.
Firefox is also unverified: its cached executable is incompatible with the installed Playwright protocol. Chrome is the verified engine; physical-device and subjective audio testing remain outstanding.
