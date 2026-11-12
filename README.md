# Stardew Spirit Cat

A lightweight, frameless desktop pet built with **Electron + TypeScript + Vite**. The character is a pastel blue-violet kitten with fairy wings, a crystal pendant and a curled tail.

The whole app renders from **one static reference image** (`public/assets/reference.jpg`). At startup the blue gradient background is removed in the browser with a border-seeded flood fill, and expression frames (blink / happy / sleep) plus a soft-light decor layer are derived on a canvas. No image-generation API, no external sprite sheets, no binary audio files.

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
| `npm run build` | Compile main process (`dist-electron/`) and bundle renderer (`dist/`) |
| `npm run start` | Run the built app with Electron |
| `npm run typecheck` | Type-check renderer and main process |
| `npm run dist` | Produce an installer with electron-builder |

> If the Electron binary download is slow, `.npmrc` already points at a mirror. You can also set `ELECTRON_MIRROR` manually before `npm install`. The browser preview works without Electron, so the animation and interaction layers can always be verified.

## Features

- Transparent, borderless, always-on-top window; never takes focus; no taskbar entry
- Drag to move, click to pet, double-click for a random line, right-click for the context menu
- System tray: show/hide, feed, pet, play, sleep, click-through, auto-launch, settings, reset, quit
- `Ctrl+Alt+P` toggles mouse click-through (works even while the pet is click-through)
- Mood / satiety stats with time decay, persistence and stat-dependent dialogue
- Idle auto-sleep (5 minutes), sedentary/hydration reminders (default 45 minutes)
- Expression frames, breathing, blinking, bounce, drag tilt, drifting water drops and star sparkles
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
src/renderer/   cutout + frames, animator, particles, audio
src/state/      mood/state machine and dialogue
src/ui/         speech bubble
src/main.ts     renderer bootstrap + browser-preview fallback
src/settings.ts settings window controller
public/assets/  reference.jpg
scripts/dev.mjs dev-server + Electron launcher
```

## Changing the character

- **Keep the same art**: replace `public/assets/reference.jpg` with another square image on a flat, light background. The flood fill works best with a smooth gradient backdrop.
- **Use a ready-made transparent PNG**: drop it in as `public/assets/pet.png` and change `SOURCE_PATH` in `src/renderer/sprite.ts`. You can then bypass `cutOutBackground()` by returning that canvas directly.
- **Eye coordinates**: `EYES` in `src/renderer/sprite.ts` are normalised (0-1) centres and radius. Adjust them for a different face so the blink/happy frames still line up.
- **No image at all**: a procedural vector cat is drawn on canvas, so the app still runs and every interaction works.

If the cutout removes more than 68% of the image (e.g. an unusual background), the code automatically falls back to a soft-edged card instead of showing an empty window. Check the console for a `[pet] Cutout was rejected` warning.

## Data location

State is stored as JSON in Electron's `userData` directory (`pet-state.json`). In browser preview it lives in `localStorage` under `stardew-pet-state`.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Black/white square behind the cat | Make sure `transparent: true` and `hasShadow: false` are intact in `electron/main.ts`; rebuild with `npm run build` |
| Pet ignores all clicks | Press `Ctrl+Alt+P` or use the tray item to disable click-through |
| Nothing appears after `npm run dev` | Check the terminal for a main-process compile error; try `npm run dev:web` to isolate the renderer |
| Electron install is very slow | Set `ELECTRON_MIRROR` to a nearby mirror, then re-run `npm install` |
| Blink looks misaligned | Tune `EYES` in `src/renderer/sprite.ts` |

## Asset note

`public/assets/reference.jpg` is included strictly as a **local, personal visual reference**. Please do not redistribute it; replace it with your own artwork before publishing. All other visuals (tray icon, effects, UI) are generated in code.
