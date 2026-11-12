/** Electron main process: transparent pet window, tray, IPC and lifecycle. */
import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import path from 'node:path';
import type { Tray } from 'electron';
import { IPC } from '../shared/pet';
import type { PetAction, PersistedState, PetSettings, PetStats } from '../shared/pet';
import { getSettings, loadState, resetState, saveState, saveStats, updateSettings } from './store';
import { buildContextMenu, createTray, refreshTray } from './tray';

const DEV_URL = process.env.PET_DEV_URL;
/**
 * Base window edge in CSS pixels. ~1.5 desktop icons (48px) wide, so the pet
 * stays a small companion instead of a floating poster. Its size can only be
 * changed explicitly from the settings window.
 */
const BASE_SIZE = 88;


// The built app loads from file://. Allow canvas getImageData() on the local
// reference artwork so the runtime cutout works outside the Vite dev server.
app.commandLine.appendSwitch('allow-file-access-from-files');

let petWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let bubbleWindow: BrowserWindow | null = null;
let ownerWindow: BrowserWindow | null = null;
let bubbleTimer: NodeJS.Timeout | null = null;
let bubbleDuration = 2600;
let pendingBubble: { text: string; duration: number } | null = null;
let tray: Tray | null = null;
let positionTimer: NodeJS.Timeout | null = null;

/** A second launch brings the existing pet back instead of spawning a copy. */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showPet());
  void app.whenReady().then(bootstrap);
}

function bootstrap(): void {
  const state = loadState();
  applyAutoLaunch(state.settings.autoLaunch);

  petWindow = createPetWindow(state);
  tray = createTray(dispatch, getSettings);
  registerShortcuts();
  registerIpc();

  // The tray keeps the process alive; only an explicit quit ends it.
  app.on('window-all-closed', () => undefined);
  app.on('before-quit', () => {
    globalShortcut.unregisterAll();
    persistPosition();
  });
}

/** Load either the Vite dev server URL or the built static file. */
function loadPage(win: BrowserWindow, page: string): void {
  if (DEV_URL) {
    void win.loadURL(`${DEV_URL}/${page}`);
  } else {
    void win.loadFile(path.join(__dirname, '../../dist', page));
  }
}

/**
 * Clamp a window position so the whole pet stays on one monitor. Uses the full
 * display bounds rather than the work area, so the pet can be dragged anywhere
 * on screen - over the taskbar and across monitor edges.
 */
function clampToScreen(size: number, pos: { x: number; y: number }): { x: number; y: number } {
  // Decide by the window centre: when it crosses a monitor edge the window is
  // handed to the next display instead of being pinned to the previous one.
  const centre = { x: Math.round(pos.x + size / 2), y: Math.round(pos.y + size / 2) };
  const area = screen.getDisplayNearestPoint(centre).bounds;
  return {
    x: Math.round(Math.min(Math.max(pos.x, area.x), Math.max(area.x, area.x + area.width - size))),
    y: Math.round(Math.min(Math.max(pos.y, area.y), Math.max(area.y, area.y + area.height - size))),
  };
}

/** Set the pet's fixed dimensions; moving it never changes its size. */
function lockPetWindowSize(win: BrowserWindow, size: number): void {
  win.setResizable(false);
  win.setMinimumSize(size, size);
  win.setMaximumSize(size, size);
  const [width, height] = win.getSize();
  if (width !== size || height !== size) win.setSize(size, size);
}

/**
 * Snap the pet window back to its locked size whenever anything resizes it.
 *
 * Windows occasionally nudges the window a pixel or two while it is being
 * moved (fractional-DPI rounding inside the Chromium bounds cache), and the
 * OS-level min/max constraints are not enforced for non-resizable windows, so
 * the drift accumulates and the pet slowly inflates while dragging. Listening
 * to every resize and re-asserting the exact bounds keeps it pinned.
 */
function enforcePetSize(): void {
  if (!petWindow || petWindow.isDestroyed()) return;
  const size = Math.round(BASE_SIZE * getSettings().scale);
  const bounds = petWindow.getBounds();
  if (bounds.width !== size || bounds.height !== size) {
    petWindow.setBounds({ x: bounds.x, y: bounds.y, width: size, height: size });
  }
}

/**
 * Hidden owner window. Windows never lists owned windows in Alt+Tab or Task
 * View, so giving the pet an invisible owner keeps its name out of the
 * application switcher while leaving taskbar/tray behaviour untouched.
 */
function ensureOwnerWindow(): BrowserWindow {
  if (ownerWindow && !ownerWindow.isDestroyed()) return ownerWindow;
  ownerWindow = new BrowserWindow({
    show: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: { sandbox: false },
  });
  return ownerWindow;
}

/** Saved position, or the lower-right corner on first launch. */
function initialPosition(size: number, saved: PersistedState['position']): { x: number; y: number } {
  if (saved) return clampToScreen(size, saved);
  const area = screen.getPrimaryDisplay().workArea;
  return clampToScreen(size, {
    x: area.x + area.width - size - 48,
    y: area.y + area.height - size - 72,
  });
}

/** Build the always-on-top, borderless, transparent pet window. */
function createPetWindow(state: PersistedState): BrowserWindow {
  const size = Math.round(BASE_SIZE * state.settings.scale);
  const pos = initialPosition(size, state.position);

  const win = new BrowserWindow({
    width: size,
    height: size,
    x: pos.x,
    y: pos.y,
    // Owned windows are excluded from Alt+Tab / Task View by the OS.
    parent: ensureOwnerWindow(),
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    acceptFirstMouse: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // The preload is plain CommonJS that requires ../shared/pet; a sandboxed
      // preload cannot resolve relative modules, which silently breaks the
      // whole bridge (window.petAPI would be undefined).
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  lockPetWindowSize(win, size);
  win.setOpacity(state.settings.opacity);
  win.setIgnoreMouseEvents(state.settings.passthrough, { forward: true });

  win.once('ready-to-show', () => {
    win.show();
    enforcePetSize();
  });
  // Watchdog: if anything (OS snap, DPI change, bounds rounding) resizes the
  // window, immediately restore the locked size.
  win.on('resize', enforcePetSize);
  win.on('moved', schedulePositionSave);
  win.on('closed', () => {
    persistPosition();
    petWindow = null;
  });

  loadPage(win, 'index.html');
  return win;
}

/** Open (or focus) the settings window. */
function openSettings(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 400,
    height: 640,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: '星露灵猫 · 设置',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // The preload is plain CommonJS that requires ../shared/pet; a sandboxed
      // preload cannot resolve relative modules, which silently breaks the
      // whole bridge (window.petAPI would be undefined).
      sandbox: false,
    },
  });

  settingsWindow.removeMenu();
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
  loadPage(settingsWindow, 'settings.html');
}

/**
 * Floating speech bubble window.
 *
 * The pet window is only ~88px wide, far too small to hold a readable line of
 * text, so the bubble lives in its own transparent, click-through window that
 * is positioned above (or below) the pet.
 */
function ensureBubbleWindow(): BrowserWindow {
  if (bubbleWindow && !bubbleWindow.isDestroyed()) return bubbleWindow;

  bubbleWindow = new BrowserWindow({
    width: 240,
    height: 72,
    show: false,
    frame: false,
    // Owned windows stay out of Alt+Tab / Task View, like the pet itself.
    parent: ensureOwnerWindow(),
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    focusable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // The preload is plain CommonJS that requires ../shared/pet; a sandboxed
      // preload cannot resolve relative modules, which silently breaks the
      // whole bridge (window.petAPI would be undefined).
      sandbox: false,
    },
  });

  bubbleWindow.setAlwaysOnTop(true, 'pop-up-menu');
  bubbleWindow.setIgnoreMouseEvents(true);
  bubbleWindow.on('closed', () => {
    bubbleWindow = null;
  });
  loadPage(bubbleWindow, 'bubble.html');
  return bubbleWindow;
}

/**
 * Pin the bubble to the pet: centred horizontally, sitting just above it (or
 * below when the pet is near the top edge). Uses the window's real size, which
 * Windows may have adjusted to its minimum, and is re-run after the window is
 * shown because the content height can change at that point.
 */
function anchorBubble(): void {
  if (!bubbleWindow || bubbleWindow.isDestroyed()) return;
  if (!petWindow || petWindow.isDestroyed()) return;

  const pet = petWindow.getBounds();
  const bounds = bubbleWindow.getBounds();
  const centre = { x: pet.x + Math.floor(pet.width / 2), y: pet.y + Math.floor(pet.height / 2) };
  const area = screen.getDisplayNearestPoint(centre).bounds;
  const gap = 10;

  const x = Math.round(
    Math.min(
      Math.max(pet.x + pet.width / 2 - bounds.width / 2, area.x + 4),
      area.x + area.width - bounds.width - 4,
    ),
  );
  let y = pet.y - bounds.height - gap;
  if (y < area.y + 4) y = pet.y + pet.height + gap;
  bubbleWindow.setPosition(x, y);
}

/** Size the bubble window for the measured text and show it above the pet. */
function placeBubble(width: number, height: number): void {
  if (!bubbleWindow || bubbleWindow.isDestroyed()) return;
  bubbleWindow.setBounds({ x: bubbleWindow.getBounds().x, y: bubbleWindow.getBounds().y, width, height });
  bubbleWindow.showInactive();
  anchorBubble();
  // The renderer reflows once the window becomes visible, so anchor again.
  setTimeout(anchorBubble, 80);
}

/** Push the pending line to the bubble renderer once it can receive it. */
function deliverBubble(): void {
  if (!pendingBubble) return;
  const win = bubbleWindow;
  if (!win || win.isDestroyed() || win.webContents.isLoading()) return;
  win.webContents.send(IPC.BUBBLE_SHOW, pendingBubble);
}

/** Show a line of dialogue in the floating bubble window. */
function showBubble(text: string, ms = 2600): void {
  if (!text) return;
  const win = ensureBubbleWindow();
  bubbleDuration = Math.max(900, ms);
  pendingBubble = { text, duration: bubbleDuration };
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', deliverBubble);
  else deliverBubble();
}

/** Hide the bubble and cancel its dismissal timer. */
function hideBubble(): void {
  if (bubbleTimer) {
    clearTimeout(bubbleTimer);
    bubbleTimer = null;
  }
  if (bubbleWindow && !bubbleWindow.isDestroyed()) bubbleWindow.hide();
}

/** Reveal the pet, re-asserting always-on-top after fullscreen apps. */
function showPet(): void {
  if (!petWindow || petWindow.isDestroyed()) {
    petWindow = createPetWindow(loadState());
  }
  petWindow.show();
  petWindow.setAlwaysOnTop(true, 'floating');
}

/** Send a message to every open window (pet + settings). */
function broadcast(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

/** Apply size / opacity / click-through changes to the live window. */
function applyWindowSettings(settings: PetSettings): void {
  if (!petWindow || petWindow.isDestroyed()) return;

  const size = Math.round(BASE_SIZE * settings.scale);
  lockPetWindowSize(petWindow, size);
  petWindow.setOpacity(settings.opacity);
  petWindow.setIgnoreMouseEvents(settings.passthrough, { forward: true });
  if (settings.gravityEnabled) snapToBottom();
}

/** Move the pet down onto the work-area bottom edge. */
function snapToBottom(): void {
  if (!petWindow || petWindow.isDestroyed()) return;
  const bounds = petWindow.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  petWindow.setPosition(bounds.x, area.y + area.height - bounds.height);
}

/** Keep Windows/macOS login item state in sync with the setting. */
function applyAutoLaunch(enabled: boolean): void {
  if (process.platform === 'win32' || process.platform === 'darwin') {
    app.setLoginItemSettings({ openAtLogin: enabled });
  }
}

/** Throttled position persistence while dragging. */
function schedulePositionSave(): void {
  if (positionTimer) clearTimeout(positionTimer);
  positionTimer = setTimeout(persistPosition, 400);
}

/** Write the current window position to disk. */
function persistPosition(): void {
  if (!petWindow || petWindow.isDestroyed()) return;
  const [x, y] = petWindow.getPosition();
  saveState({ position: { x, y } });
}

/** Move the pet without touching its fixed window dimensions. */
function movePetWindow(dx: number, dy: number): void {
  if (!petWindow || petWindow.isDestroyed()) return;
  const [x, y] = petWindow.getPosition();
  const size = Math.round(BASE_SIZE * getSettings().scale);
  const next = clampToScreen(size, { x: x + Math.round(dx), y: y + Math.round(dy) });
  // Always re-assert the size: a plain setPosition() lets fractional-DPI
  // rounding inside Chromium inflate the window a pixel per move.
  petWindow.setBounds({ x: next.x, y: next.y, width: size, height: size });
}

/** Rebuild the tray menu so checkboxes reflect the latest settings. */
function refreshTrayMenu(): void {
  if (tray && !tray.isDestroyed()) refreshTray(tray, dispatch, getSettings);
}

/** Central dispatcher for tray items, menu items and the global shortcut. */
function dispatch(action: PetAction): void {
  switch (action) {
    case 'show':
      showPet();
      return;
    case 'hide':
      hideBubble();
      petWindow?.hide();
      return;
    case 'toggle-visible':
      if (petWindow?.isVisible()) {
        hideBubble();
        petWindow.hide();
      } else {
        showPet();
      }
      return;
    case 'settings':
      openSettings();
      return;
    case 'quit':
      app.quit();
      return;
    case 'reset': {
      resetState();
      const settings = getSettings();
      applyAutoLaunch(settings.autoLaunch);
      applyWindowSettings(settings);
      broadcast(IPC.SETTINGS_CHANGED, settings);
      broadcast(IPC.RESET_SIGNAL);
      refreshTrayMenu();
      return;
    }
    case 'toggle-passthrough': {
      const settings = updateSettings({ passthrough: !getSettings().passthrough });
      applyWindowSettings(settings);
      broadcast(IPC.SETTINGS_CHANGED, settings);
      refreshTrayMenu();
      return;
    }
    case 'toggle-autolaunch': {
      const settings = updateSettings({ autoLaunch: !getSettings().autoLaunch });
      applyAutoLaunch(settings.autoLaunch);
      broadcast(IPC.SETTINGS_CHANGED, settings);
      refreshTrayMenu();
      return;
    }
    default:
      petWindow?.webContents.send(IPC.ACTION, action);
  }
}

/** Register all IPC handlers exposed through the preload bridge. */
function registerIpc(): void {
  ipcMain.on(IPC.DRAG, (_event, dx: number, dy: number) => {
    if (!petWindow || petWindow.isDestroyed()) return;
    // The bubble is anchored to the pet, so drop it while the pet is moving.
    if (bubbleWindow?.isVisible()) hideBubble();
    movePetWindow(dx, dy);
  });

  ipcMain.on(IPC.BUBBLE_SHOW, (_event, payload: { text?: string; ms?: number }) => {
    showBubble(payload?.text ?? '', payload?.ms ?? 2600);
  });

  ipcMain.handle(IPC.BUBBLE_FETCH, () => pendingBubble);

  ipcMain.on(IPC.BUBBLE_READY, () => {
    deliverBubble();
  });

  ipcMain.on(IPC.BUBBLE_SIZE, (_event, payload: { width: number; height: number }) => {
    const width = Math.max(64, Math.min(360, Math.round(payload?.width ?? 240)));
    const height = Math.max(28, Math.min(240, Math.round(payload?.height ?? 72)));
    placeBubble(width, height);
    if (bubbleTimer) clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => bubbleWindow?.hide(), bubbleDuration);
  });

  ipcMain.on(IPC.DRAG_END, () => {
    if (getSettings().gravityEnabled) snapToBottom();
    persistPosition();
  });

  ipcMain.on(IPC.PASSTHROUGH, (_event, ignore: boolean) => {
    const settings = updateSettings({ passthrough: ignore });
    applyWindowSettings(settings);
    broadcast(IPC.SETTINGS_CHANGED, settings);
    refreshTrayMenu();
  });

  ipcMain.handle(IPC.LOAD_STATE, () => loadState());
  ipcMain.on(IPC.SAVE_STATS, (_event, stats: PetStats) => saveStats(stats));
  ipcMain.handle(IPC.GET_SETTINGS, () => getSettings());

  ipcMain.handle(IPC.UPDATE_SETTINGS, (_event, patch: Partial<PetSettings>) => {
    const settings = updateSettings(patch);
    applyAutoLaunch(settings.autoLaunch);
    applyWindowSettings(settings);
    broadcast(IPC.SETTINGS_CHANGED, settings);
    refreshTrayMenu();
    return settings;
  });

  ipcMain.handle(IPC.RESET, () => {
    resetState();
    broadcast(IPC.SETTINGS_CHANGED, getSettings());
    broadcast(IPC.RESET_SIGNAL);
    refreshTrayMenu();
  });

  ipcMain.on(IPC.OPEN_SETTINGS, () => openSettings());
  ipcMain.on(IPC.QUIT, () => app.quit());

  ipcMain.on(IPC.CONTEXT_MENU, () => {
    const menu = buildContextMenu(dispatch, getSettings);
    menu.popup({ window: petWindow ?? undefined });
  });
}

/** Global shortcut stays available even when the pet is click-through. */
function registerShortcuts(): void {
  globalShortcut.register('Control+Alt+P', () => dispatch('toggle-passthrough'));
}
