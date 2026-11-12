# Stardew Spirit Cat

A lightweight, frameless desktop pet built with **Electron + TypeScript + Vite**. The character is a pastel blue-violet kitten with fairy wings, a crystal pendant and a curled tail.

The pet renders from **one transparent character PNG** (`public/assets/pet.png`). There is no backdrop anywhere: the window, both canvases and every overlay are transparent, including the sleep tint and the clipped glow layer. At startup the renderer derives expression frames (blink / happy / sleep), ten vector mouth poses and a soft-light decor layer on a canvas. No image-generation API, no external sprite sheets, no binary audio files.

`pet.png` is baked once from the supplied reference artwork by `scripts/make_transparent.py`. `public/assets/reference.jpg` is kept only as the local visual reference; it is never loaded at runtime. If `pet.png` is missing, a fully transparent procedural vector cat is drawn instead - the app never falls back to an opaque card.

## Requirements

- Node.js 18+ (developed on Node 22)
- npm 10+
- Windows / macOS / Linux (tested on Windows 11)

## Quick start

```bash
npm install
npm run dev          # Vite dev server + Electron desktop pet
```

`npm run dev` compiles the main process, starts Vite on port 5173 and launches Electron. The pet appears in the lower-right corner of the primary display.

Other scripts:

| Command | Purpose |
| --- | --- |
| `npm run dev:web` | Browser preview at http://localhost:5173 - no Electron download needed |
| `mouth-preview.html` | Mouth-pose gallery served by the dev server at http://localhost:5173/mouth-preview.html |
| `npm run build` | Compile main process (`dist-electron/`) and bundle renderer (`dist/`) |
| `npm run start` | Run the built app with Electron |
| `npm run typecheck` | Type-check renderer and main process |
| `npm run dist` | Produce an installer with electron-builder |
| `python scripts/make_transparent.py` | Re-bake `pet.png` from `reference.jpg` (requires numpy + Pillow) |

> If the Electron binary download is slow, `.npmrc` already points at a mirror. You can also set `ELECTRON_MIRROR` manually before `npm install`. The browser preview works without Electron, so the animation and interaction layers can always be verified.

## Features

- Transparent, borderless, always-on-top window; only the character is drawn, with no backdrop, card or gradient in any state
- Never takes focus; no taskbar entry
- Drag to move, click to pet, double-click for a random line, right-click for the context menu
- System tray: show/hide, feed, pet, play, sleep, click-through, auto-launch, settings, reset, quit
- `Ctrl+Alt+P` toggles mouse click-through (works even while the pet is click-through)
- Mood / satiety stats with time decay, persistence and stat-dependent dialogue
- Idle auto-sleep (5 minutes), sedentary/hydration reminders (default 45 minutes)
- Expression frames, breathing, blinking, bounce, drag tilt, drifting water drops and star sparkles
- Ten procedurally drawn mouth poses (smile, grin, chewing, talking, mew, surprised, sleepy) that animate with the current state and any speech bubble
- Character-only window: glow is clipped to the fur, sleep tint uses `source-atop`, and ambient drops / sparkles are off by default (`SHOW_AMBIENT_PARTICLES` in `src/main.ts`)
- Settings window: size, opacity, volume, auto-launch, motion, gravity, click-through, reminder interval
- Synthesised "meow" via WebAudio; tray icon generated as an in-memory PNG
- Position, stats and settings restored on restart; single-instance lock; multi-display clamping
- `prefers-reduced-motion` respected; all canvas work pauses when the window is hidden

## Keyboard & mouse

| Input | Result |
| --- | --- |
| Left drag | Move the pet (5px threshold) |
| Left click | Pet it (mood +4) |
| Double click | Random line + happy face |
| Right click | Context menu |
| `Ctrl+Alt+P` | Toggle mouse click-through |
| `Esc` | Close the web-preview context menu |

## Project layout

```
electron/       main process: window, tray, IPC, persistence
shared/         types, defaults and IPC channel names
src/renderer/   sprite frames, mouth overlays, animator, particles, audio
src/state/      mood/state machine and dialogue
src/ui/         speech bubble
src/main.ts     renderer bootstrap + browser-preview fallback
src/settings.ts settings window controller
public/assets/  pet.png (transparent character), reference.jpg (reference only)
scripts/dev.mjs dev-server + Electron launcher
scripts/make_transparent.py  bakes the transparent character asset
mouth-preview.html  dev-only gallery of all ten mouth poses
```

## Mouth poses

The reference artwork is downscaled twice (source -> 512px sprite -> ~280px window), which leaves its original mouth as a blurry smudge. `src/renderer/mouth.ts` therefore repaints the muzzle at runtime: a blurred copy of the artwork hides the raster lines without introducing a colour patch, then a rounded cat nose and one of ten mouth shapes are drawn on top as small transparent layers. The animator swaps these layers per frame, so chewing and speech produce real lip movement.

| Pose | Trigger |
| --- | --- |
| `smile` / `smileSoft` | idle, hover / blink |
| `grin` | petted, happy, play |
| `chew` / `chewOpen` | eating (alternating loop) |
| `talk` / `talkWide` | any speech bubble (alternating loop) |
| `mew` | being dragged |
| `surprised` | sedentary reminder |
| `sleepy` | asleep |

Open `mouth-preview.html` through the dev server to inspect every pose against the real sprite and to check the cutout status.

## Changing the character

- **Replace the character**: put a transparent, square PNG at `public/assets/pet.png`. The renderer detects the transparent corner and uses it verbatim - no cutout, no backdrop. `SOURCE_PATH` in `src/renderer/sprite.ts` points at this file.
- **Bake from your own artwork**: replace `public/assets/reference.jpg` with an image on a smooth light gradient, then run `python scripts/make_transparent.py`. It removes the backdrop with a border-seeded flood fill, protects pale fur inside the body core, keeps only the largest connected component, feathers the alpha edge and decontaminates the blue fringe.
- **Opaque replacement art**: if a replacement PNG has no alpha, the runtime flood fill still runs. If that fails, the app draws a fully transparent procedural cat - it never shows an opaque card.
- **Eye coordinates**: `EYES` in `src/renderer/sprite.ts` are normalised (0-1) centres and radius. Adjust them for a different face so the blink/happy frames still line up.
- **Muzzle position**: `PHOTO_ANCHOR` / `VECTOR_ANCHOR` in `src/renderer/mouth.ts` hold the nose and mouth pixel coordinates in the 512px sprite. Retune them when swapping the artwork so the vector mouth stays registered with the face.
- **No asset at all**: a procedural vector cat is drawn on transparent canvas, so the app still runs and every interaction works.

Anchors assume the artwork is stretched into a square canvas exactly like `reference.jpg`; keep that geometry when baking a new `pet.png`.

## Data location

State is stored as JSON in Electron's `userData` directory (`pet-state.json`). In browser preview it lives in `localStorage` under `stardew-pet-state`.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Black/white square behind the cat | Make sure `transparent: true` and `hasShadow: false` are intact in `electron/main.ts`; confirm `public/assets/pet.png` has a transparent corner; rebuild with `npm run build` |
| Blue rectangle only while sleeping | The sleep tint must use `source-atop` in both `sprite.ts` and `animator.ts` |
| Pet ignores all clicks | Press `Ctrl+Alt+P` or use the tray item to disable click-through |
| Nothing appears after `npm run dev` | Check the terminal for a main-process compile error; try `npm run dev:web` to isolate the renderer |
| Electron install is very slow | Set `ELECTRON_MIRROR` to a nearby mirror, then re-run `npm install` |
| Blink looks misaligned | Tune `EYES` in `src/renderer/sprite.ts` |

## Asset note

`public/assets/reference.jpg` and the derived `public/assets/pet.png` are included strictly as **local, personal visual references**. Please do not redistribute them; replace them with your own artwork before publishing. All other visuals (tray icon, effects, UI) are generated in code.
