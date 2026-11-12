/** Whitelisted bridge exposed to the renderer as window.petAPI. */
import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/pet';
import type { PetAPI, PetAction, PersistedState, PetSettings, PetStats } from '../shared/pet';

const api: PetAPI = {
  isElectron: true,
  platform: process.platform,

  dragWindow: (dx, dy) => ipcRenderer.send(IPC.DRAG, dx, dy),
  dragEnded: () => ipcRenderer.send(IPC.DRAG_END),
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send(IPC.PASSTHROUGH, ignore),
  loadState: (): Promise<PersistedState> => ipcRenderer.invoke(IPC.LOAD_STATE),
  saveStats: (stats: PetStats) => ipcRenderer.send(IPC.SAVE_STATS, stats),
  getSettings: (): Promise<PetSettings> => ipcRenderer.invoke(IPC.GET_SETTINGS),
  updateSettings: (patch): Promise<PetSettings> => ipcRenderer.invoke(IPC.UPDATE_SETTINGS, patch),
  resetData: (): Promise<void> => ipcRenderer.invoke(IPC.RESET),
  openSettings: () => ipcRenderer.send(IPC.OPEN_SETTINGS),
  openContextMenu: () => ipcRenderer.send(IPC.CONTEXT_MENU),
  quit: () => ipcRenderer.send(IPC.QUIT),
  showBubble: (text, ms) => ipcRenderer.send(IPC.BUBBLE_SHOW, { text, ms }),
  reportBubbleSize: (width, height) => ipcRenderer.send(IPC.BUBBLE_SIZE, { width, height }),
  bubbleReady: () => ipcRenderer.send(IPC.BUBBLE_READY),
  fetchBubble: (): Promise<{ text: string; duration: number } | null> =>
    ipcRenderer.invoke(IPC.BUBBLE_FETCH),

  onBubble: (handler) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { text: string; duration: number },
    ) => handler(payload);
    ipcRenderer.on(IPC.BUBBLE_SHOW, listener);
    return () => ipcRenderer.removeListener(IPC.BUBBLE_SHOW, listener);
  },

  onAction: (handler: (action: PetAction) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: PetAction) => handler(action);
    ipcRenderer.on(IPC.ACTION, listener);
    return () => ipcRenderer.removeListener(IPC.ACTION, listener);
  },

  onSettingsChanged: (handler: (settings: PetSettings) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, settings: PetSettings) => handler(settings);
    ipcRenderer.on(IPC.SETTINGS_CHANGED, listener);
    return () => ipcRenderer.removeListener(IPC.SETTINGS_CHANGED, listener);
  },

  onReset: (handler: () => void) => {
    const listener = () => handler();
    ipcRenderer.on(IPC.RESET_SIGNAL, listener);
    return () => ipcRenderer.removeListener(IPC.RESET_SIGNAL, listener);
  },
};

contextBridge.exposeInMainWorld('petAPI', api);
