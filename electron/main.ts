/** Electron main process: transparent pet window, tray, IPC and lifecycle. */
import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import path from 'node:path';
import type { Tray } from 'electron';
import { IPC } from '../shared/pet';
import type { PetAction, PersistedState, PetSettings, PetStats } from '../shared/pet';
import { getSettings, loadState, resetState, saveState, saveStats, updateSettings } from './store';
import { buildContextMenu, createTray, refreshTray } from './tray';

const DEV_URL = process.env.PET_DEV_URL;
const BASE_SIZE = 280;

// The built app loads from file://. Allow canvas getImageData() on the local
// reference artwork so the runtime cutout works outside the Vite dev server.
app.commandLine.appendSwitch('allow-file-access-from-files');

let petWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
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

/** Clamp a window position into the nearest display's work area. */
function clampToWorkArea(size: number, pos: { x: number; y: number }): { x: number; y: number } {
  const area = screen.getDisplayNearestPoint(pos).workArea;
  return {
    x: Math.round(Math.min(Math.max(pos.x, area.x), Math.max(area.x, area.x + area.width - size))),
    y: Math.round(Math.min(Math.max(pos.y, area.y), Math.max(area.y, area.y + area.height - size))),
  };
}

/** Saved position, or the lower-right corner on first launch. */
function initialPosition(size: number, saved: PersistedState['position']): { x: number; y: number } {
  if (saved) return clampToWorkArea(size, saved);
  const area = screen.getPrimaryDisplay().workArea;
  return clampToWorkArea(size, {
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
      backgroundThrottling: false,
    },
  });

  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setOpacity(state.settings.opacity);
  win.setIgnoreMouseEvents(state.settings.passthrough, { forward: true });

  win.once('ready-to-show', () => win.show());
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
    },
  });

  settingsWindow.removeMenu();
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
  loadPage(settingsWindow, 'settings.html');
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
  if (petWindow.getSize()[0] !== size) petWindow.setSize(size, size);
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
      petWindow?.hide();
      return;
    case 'toggle-visible':
      if (petWindow?.isVisible()) petWindow.hide();
      else showPet();
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
    const [x, y] = petWindow.getPosition();
    const size = petWindow.getSize()[0];
    const next = clampToWorkArea(size, { x: x + Math.round(dx), y: y + Math.round(dy) });
    petWindow.setPosition(next.x, next.y);
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
