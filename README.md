# Neon Vanguard

**One ship. Infinite odds.** A complete browser-based 2D space shooter built with React, TypeScript, HTML5 Canvas, Tailwind CSS 4, and Vite. All ship artwork, stars, effects, and sound are procedural; there are no remote fonts, image downloads, audio files, accounts, or backend services.

## Play locally

Use **Node.js 24 LTS** (Node 22.12+ on the 22.x line also works):

```sh
npm ci
npm run dev
```

Open the URL printed by Vite, normally **http://localhost:5173**. Commands run from this project's folder. This Designer workspace also provides Node under `../tools/node/bin`; if Node is not on your PATH, run `export PATH="$PWD/../tools/node/bin:$PATH"` first.

For the optimized production build:

```sh
npm run build
npm run preview
```

The preview normally runs at **http://localhost:4173**. Deploy the generated `dist/` directory to any static HTTP host. Use HTTP rather than double-clicking the HTML file. No runtime network access beyond serving the application's own assets is required.

## Flight controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Move | WASD or arrow keys | Drag the left joystick |
| Aim | Mouse pointer; upward when no pointer is in the arena | Upward |
| Fire | Hold left mouse button or Space | Hold the FIRE button |
| Boost | Shift (with movement direction) | BOOST button + joystick |
| Homing missile | Q, after installing a launcher | MISSILE button |
| Charged beam | Hold E, then release | Hold LASER, then release |
| Pause / resume | Escape or P; pause button | Pause button |
| Mute | M; speaker button | Speaker button |

Settings include master volume, music, mute, reduced motion, and auto-fire. Audio starts only after user interaction, in accordance with browser autoplay rules. The game automatically pauses on tab hiding or window blur; movement keys and touch state are cleared to prevent stuck controls.

## Tactical expansion (implemented in place)

The original navy/mint flight deck, branding, React/Canvas architecture, menus, audio, controls, settings, high-score keys, and original enemy/power-up systems remain. The existing simulation and renderer are extended, not replaced by a second game.

### Combat and enemies

- Three lives, regenerating shields, timed respawn protection, and ship-specific hull, damage, movement and boost cooldowns.
- Original scouts, fighters and weavers plus **fast interceptors, armored missile carriers, long-range beam snipers, kamikaze drones, and stealth craft**. Each advanced class has distinct health, geometry, movement and attacks. Stealth craft remain faintly visible and cannot shoot while cloaked. Drones telegraph their charge, then commit to a fixed trajectory.
- **Shift: boost.** Dash in the movement direction, or the facing direction while stationary. The dash lasts 0.22 seconds with 0.36 seconds of invulnerability; the default cooldown is four seconds.
- **Hold E, release to fire: charged piercing beam.** Charges fully in 1.1 seconds, needs at least 25% charge, and recharges in 2.4 seconds. Pausing cancels an unfinished charge.
- **Q: homing missiles**, unlocked at a refit dock. A 2.5-second cooldown; subsequent upgrades increase salvo size and warhead damage. Enemy missiles have limited turning time so they can be outmaneuvered.
- Sniper beams show a locked dashed targeting line for 1.05 seconds before firing. Move or boost off that line. Beam collision and drawing share the same geometry, including after resizing.
- A 12% critical-hit chance doubles pulse/missile damage. Kill chains expire three seconds after the last elimination; five-kill milestones increase the score multiplier up to 4x and award additional streak bonuses. Hull damage breaks the current chain.
- Destructible asteroids absorb either side's projectiles. Enemy health, density and attack speed rise with waves, while firing cadence and entity counts remain capped.

### Missions, bosses and refit docks

Each five-wave sector follows an objective cycle: survive a formation, eliminate a marked elite commander, defeat a marked Warden mini-boss, survive a **24-second asteroid storm** and clear its escorts, then defeat a flagship.

**A major boss arrives every fifth wave**, replacing the old four-wave cadence. Dreadnought, Eclipse Carrier and Void Sovereign variants cycle across sectors. Bosses have three visible phases, shifting at 65% and 30% health. Patterns include radial volleys, aimed twin spreads, fans, telegraphed beams and homing salvos. Defeat one within 90 seconds for a 1,000-point objective bonus. Missing the time bonus does not end the run: destroying the boss still completes the sector.

A mission-complete screen appears after each flagship. Continue through the refit dock to keep playing endlessly with the same ship, upgrades and credits, or return to the flight deck. Marked commanders and bosses cannot escape; ordinary ships that leave the arena award no kill credit.

Refit docks open after completed even-numbered waves and every boss victory. Each dock offers **one free upgrade**, then additional purchases with run credits. Six choices, each capped at five installations:

- Increased base weapon damage
- Faster pulse firing
- +25 maximum hull and 50 repair
- +25 shield capacity, full recharge and faster regeneration
- Seeker missile launcher / stronger salvos
- Faster movement and shorter boost cooldown

### Salvage and ship unlocks

- **Cyan energy:** +12 energy and +4 shield. Each 100 energy raises weapon-core level (+10% base damage per level, up to level 10).
- **Gold credits:** +15 run credits for refit purchases. Successful objectives also award 35 credits.
- **Pink core drops:** an instant weapon level, dropped by elites.
- Original timed power-ups remain: rapid fire 12 seconds, multi-shot 12 seconds, shield overcharge 8 seconds, and repair +40 hull up to the ship's current maximum. Repeated timed pickups extend duration up to 24 seconds.
- Nearby salvage is magnetized toward the ship. Remaining on-screen salvage is collected automatically when the wave is secured.

Open **Hangar & service record** on the existing ship card to select frames and view six earnable achievements:

| Frame | Hull | Shield | Movement | Unlock |
| --- | --- | --- | --- | --- |
| VX-01 Vanguard | 100 | 35 | 345 logical px/s | Available initially |
| VX-02 Wraith | 75 | 25 | 425 logical px/s | 30 cumulative eliminations |
| VX-03 Bastion | 150 | 65 | 280 logical px/s | Defeat one major boss |

The selected ship changes real starting stats, weapon tuning, boost cooldown and rendered geometry. Unlocks, achievements, lifetime kills/credits, best wave and best score persist separately from the original high scores/settings. Cumulative run checkpoints prevent duplicate progression awards. **Run credits and refit upgrades reset on restart; unlocks do not.** Reloading returns to the flight deck rather than restoring an active mission.

### Interface and effects

The cockpit now includes hull/shield/boost meters, animated score counting, weapon and energy levels, cooldowns, objective status, wave progress, kill chains, and a screen-space radar. The radar and combat labels stay legible in narrow or short arenas. Game-over statistics add highest chain, waves cleared, enemy-hit accuracy and credits earned. Accuracy counts projectiles that hit enemy ships; a piercing beam counts as one shot even if it hits several enemies.

Original graphics are enhanced with a cached ringed planet, nebula filaments, parallax stars, occasional ambient anomalies, glowing storm asteroids, distinct enemy silhouettes, damage flashes, shield ripples, charge rings, missile trails, critical-hit labels, debris and boss shockwaves. New synthesized cues cover boosting, beams, missiles, shield hits, upgrades, streaks, achievements and flagship destruction. All sounds remain locally generated and respect mute/volume settings.

Game over and completed sectors update the top-ten flight log. Blocked or corrupt storage does not prevent play, and an explanatory message appears if saving is unavailable. Existing v1 high scores and settings remain readable.

## Combat and control polish

- Swept projectiles now resolve their **earliest** contact across ships, asteroids, and the pilot. Entity-array order no longer determines damage, and nearby asteroids reliably block pulse/missile fire. Piercing player beams retain their intentional multi-target behavior.
- Hostile beams remain hazardous during their active lifetime, including when the pilot enters after the activation frame. Each beam registers at most one pilot contact. Expired beams and destroyed enemies cannot produce late invisible attacks.
- Touch ability buttons show **LOCKED**, **READY**, live cooldown seconds, and laser charge percentage, with color-matched progress strips. A locked launcher still explains how to unlock it when tapped.
- Touch FIRE activates immediately. Ability controls track the owning pointer: an extra finger cannot release someone else's charge. Browser-canceled gestures cancel the charge without firing or spending cooldown; a normal release still fires.
- Pause state changes are synchronous with the engine. Held Escape repeat events, rapid pause toggles, repeated window-blur events, and interrupted joystick gestures no longer create unintended resumes or stale movement.

The original layout, branding, save keys, ship progression, and upgrade choices are unchanged by this pass.

## Architecture

- [App.tsx](src/App.tsx): menus, cockpit HUD, focus-trapped dialogs, loading/pause/restart/game-over states, and score persistence.
- [GameCanvas.tsx](src/components/GameCanvas.tsx): requestAnimationFrame loop, DPR-aware resizing, native keyboard/pointer input, multi-touch pointer capture, visibility handling, and effect cleanup.
- [engine.ts](src/game/engine.ts): pure testable simulation, delta-time integration using physics steps no larger than 1/120 second, swept segment/circle projectile collisions, spawning, difficulty, bosses, and power-ups.
- [render.ts](src/game/render.ts): original vector-like Canvas ships, layered star field, cached nebula background, glow, particles, and attract-mode ship illustration.
- [audio.ts](src/game/audio.ts): Web Audio oscillators, short effect envelopes, sequenced music, master gain, and teardown.
- [storage.ts](src/game/storage.ts): validated local persistence with failure recovery.
- [styles.css](src/styles.css): Tailwind import/theme plus original responsive cockpit styling.
- [catalog.ts](src/game/catalog.ts): ship stats, upgrade choices, achievement definitions, and boss variants.
- [progression.ts](src/game/progression.ts): additive persistent progression with idempotent checkpoints; no changes to legacy save keys.
- [ExpansionUI.tsx](src/components/ExpansionUI.tsx): systems meters, animated score, mission objectives, refit dock, hangar, achievements, and run details.
- [expansion.css](src/expansion.css): scoped visual extensions and responsive tactical layouts layered after the original styles.

Canvas uses logical coordinates independently of display pixels and caps device pixel ratio at 2. Rendering never changes simulation state. Long-frame catch-up is capped at 100 ms. Bullets are capped at 550, particles at 500, combat text at 24, and audio voices at 48. Collision checks use a bounding-box rejection before the swept segment/circle test. HUD publication is throttled; browser listeners, ResizeObservers, animation loops, music timers, and audio nodes are cleaned up. Short firing/missile/boost taps activate on key/pointer down so they cannot fall between animation frames. Loading ends only after the first Canvas frame is drawn.

## Tests

```sh
npm test
npm run build
npm audit
```

For real-browser checks, keep the development server running, install Google Chrome, and run:

```sh
npm run test:e2e
npm run test:e2e:expansion
npm run test:e2e:polish
# Different server URL:
npm run test:e2e -- http://localhost:5174
npm run test:e2e:expansion -- http://localhost:5174
npm run test:e2e:polish -- http://localhost:5174
# Full local gate, with the dev server already running on 5173:
npm run verify
```

Set `CHROME_PATH` to use a particular Chromium executable. The browser suite creates isolated desktop/mobile contexts and writes screenshots under [artifacts/qa](artifacts/qa/). It uses an explicit `?e2e` development fixture hook to accelerate collision, boss, and game-over scenarios; movement, firing, menus, pause/resume, restart, storage and multi-touch are driven through actual browser input. **The fixture hook is eliminated in production builds.**

### Verification completed

- **70 passing unit tests:** the original regression suite plus advanced weapons, boost, shields, every enemy behavior, telegraphs, beam resizing, upgrades and costs, ship unlocks, save validation, a 15-wave progression simulation, and a 60-second late-wave entity-cap stress test. Six additional regression cases cover nearest-hit collision ordering, asteroid cover, sustained beam hazards, expired beams, and destroyed enemy cleanup.
- **37 passing Chrome browser checks** (15 regression + 14 expansion + 8 polish): menus, persisted settings and legacy scores, movement/fire/boost/beam/missiles, pause/keyboard focus, immediate restart/pause, auto-pause, all upgrade buttons, enemy/boss phases, storm objectives, victory/refit/continue, ship selection, achievements, repeated restarts, mobile abilities, modal scrolling, and 320px/portrait/landscape layouts. The polish suite covers repeated Escape, rapid pause requests, duplicate blur, live cooldown labels, canceled charging, two-finger ownership, and joystick cleanup. Simultaneous movement and firing and charge gestures use actual browser touch events; same-turn pause/blur races use synthetic DOM events.
- Production TypeScript/Vite build succeeds; dependency audit reports **zero vulnerabilities**.
- Production preview smoke test passes: active gameplay, boost, charged beam, Web Audio unlock, mute persistence, pause/settings/resume, no exposed test fixture, and no uncaught browser errors.
- A 180-frame production sample while firing on this machine measured **16.7 ms median and 16.7 ms p95**. This is a local smoke measurement, not a device-independent performance guarantee.
- Desktop and mobile screenshots were visually reviewed. Mobile checks use Chrome device emulation; physical iOS/Android hardware and other browser engines have not been tested.

### Screenshots

- [Desktop flight deck](artifacts/qa/desktop-menu.png)
- [Dreadnought encounter](artifacts/qa/desktop-boss.png)
- [Mobile flight deck](artifacts/qa/mobile-menu.png)
- [Mobile gameplay](artifacts/qa/mobile-game.png)
- [Mobile landscape](artifacts/qa/mobile-landscape.png)
- [Game over](artifacts/qa/game-over.png)
- [Advanced enemy silhouettes](artifacts/qa/expansion/combat-classes.png)
- [Refit dock](artifacts/qa/expansion/upgrade-dock.png)
- [Unlocked hangar and achievements](artifacts/qa/expansion/hangar-unlocked.png)
- [Three-phase flagship](artifacts/qa/expansion/boss-phase-three.png)
- [Mission complete](artifacts/qa/expansion/mission-complete.png)
- [320px gameplay layout](artifacts/qa/expansion/mobile-320.png)
- [Live touch charge and cooldown feedback](artifacts/qa/polish/touch-charge-feedback.png)
- [Landscape ability controls](artifacts/qa/polish/landscape-cooldowns.png)
