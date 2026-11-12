/** Shared contracts between the Electron main process and the renderer. */

export type PetAction =
  | 'feed'
  | 'pet'
  | 'play'
  | 'sleep'
  | 'wake'
  | 'show'
  | 'hide'
  | 'toggle-visible'
  | 'toggle-passthrough'
  | 'toggle-autolaunch'
  | 'settings'
  | 'remind'
  | 'reset'
  | 'quit';

export type PetMoodState =
  | 'idle'
  | 'hover'
  | 'dragged'
  | 'petted'
  | 'eating'
  | 'happy'
  | 'sleep'
  | 'remind';

export interface PetStats {
  mood: number;
  satiety: number;
  lastTick: number;
  lastInteraction: number;
}

export interface PetSettings {
  scale: number;
  opacity: number;
  volume: number;
  autoLaunch: boolean;
  reminderEnabled: boolean;
  reminderMinutes: number;
  motionEnabled: boolean;
  gravityEnabled: boolean;
  passthrough: boolean;
}

export interface PersistedState {
  stats: PetStats;
  settings: PetSettings;
  position: { x: number; y: number } | null;
}

export const DEFAULT_SETTINGS: PetSettings = {
  scale: 1,
  opacity: 1,
  volume: 0.5,
  autoLaunch: false,
  reminderEnabled: true,
  reminderMinutes: 45,
  motionEnabled: true,
  gravityEnabled: false,
  passthrough: false,
};

export const DEFAULT_STATS = (): PetStats => ({
  mood: 72,
  satiety: 68,
  lastTick: Date.now(),
  lastInteraction: Date.now(),
});

export const IPC = {
  DRAG: 'pet:drag',
  DRAG_END: 'pet:drag-end',
  PASSTHROUGH: 'pet:passthrough',
  LOAD_STATE: 'pet:load-state',
  SAVE_STATS: 'pet:save-stats',
  GET_SETTINGS: 'pet:get-settings',
  UPDATE_SETTINGS: 'pet:update-settings',
  SETTINGS_CHANGED: 'pet:settings-changed',
  RESET: 'pet:reset',
  OPEN_SETTINGS: 'pet:open-settings',
  CONTEXT_MENU: 'pet:context-menu',
  SHOW_WINDOW: 'pet:show-window',
  QUIT: 'pet:quit',
  ACTION: 'pet:action',
  RESET_SIGNAL: 'pet:reset-signal',
  BUBBLE_SHOW: 'pet:bubble-show',
  BUBBLE_SIZE: 'pet:bubble-size',
  BUBBLE_HIDE: 'pet:bubble-hide',
  BUBBLE_READY: 'pet:bubble-ready',
  BUBBLE_FETCH: 'pet:bubble-fetch',
} as const;

export interface PetAPI {
  readonly isElectron: boolean;
  readonly platform: string;
  dragWindow(dx: number, dy: number): void;
  dragEnded(): void;
  setIgnoreMouseEvents(ignore: boolean): void;
  loadState(): Promise<PersistedState>;
  saveStats(stats: PetStats): void;
  getSettings(): Promise<PetSettings>;
  updateSettings(patch: Partial<PetSettings>): Promise<PetSettings>;
  resetData(): Promise<void>;
  openSettings(): void;
  openContextMenu(): void;
  quit(): void;
  /** Ask the main process to float a speech bubble above the pet. */
  showBubble(text: string, ms?: number): void;
  /** Bubble window only: receive the line it must render. */
  onBubble(handler: (payload: { text: string; duration: number }) => void): () => void;
  /** Bubble window only: report the measured content box to the main process. */
  reportBubbleSize(width: number, height: number): void;
  /** Bubble window only: announce that the listener is attached. */
  bubbleReady(): void;
  /** Bubble window only: pull the line that is currently pending. */
  fetchBubble(): Promise<{ text: string; duration: number } | null>;
  onAction(handler: (action: PetAction) => void): () => void;
  onSettingsChanged(handler: (settings: PetSettings) => void): () => void;
  onReset(handler: () => void): () => void;
}

declare global {
  interface Window {
    petAPI?: PetAPI;
  }
}
