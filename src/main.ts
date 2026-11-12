/**
 * Renderer entry point: sprite generation, animation, pointer input and IPC.
 * Falls back to a fully interactive browser preview when Electron is absent.
 */
import { DEFAULT_SETTINGS, DEFAULT_STATS } from '../shared/pet';
import type { PetAction, PetAPI, PersistedState, PetSettings } from '../shared/pet';
import { playMeow } from './renderer/audio';
import { Animator } from './renderer/animator';
import { ParticleField } from './renderer/particles';
import { buildSpriteSheet } from './renderer/sprite';
import { PetState } from './state/pet-state';
import { Bubble } from './ui/bubble';

const WEB_STATE_KEY = 'stardew-pet-state';
const DRAG_THRESHOLD = 5;

const webOffset = { x: 0, y: 0 };
let webScale = DEFAULT_SETTINGS.scale;

/** Preview-only: size and move the DOM container instead of a native window. */
function applyWebLayout(): void {
  if (window.petAPI) return;
  const app = document.getElementById('app');
  if (!app) return;
  app.style.width = `${Math.round(280 * webScale)}px`;
  app.style.height = `${Math.round(280 * webScale)}px`;
  app.style.transform = `translate(${webOffset.x}px, ${webOffset.y}px)`;
}

/** localStorage-backed PetAPI used by `npm run dev:web`. */
function createWebApi(): PetAPI {
  const read = (): PersistedState => {
    try {
      const raw = localStorage.getItem(WEB_STATE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedState>;
        return {
          stats: { ...DEFAULT_STATS(), ...(parsed.stats ?? {}) },
          settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
          position: parsed.position ?? null,
        };
      }
    } catch {
      /* corrupt storage -> defaults */
    }
    return { stats: DEFAULT_STATS(), settings: { ...DEFAULT_SETTINGS }, position: null };
  };

  const write = (state: PersistedState): void => {
    try {
      localStorage.setItem(WEB_STATE_KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked */
    }
  };

  const actionHandlers = new Set<(action: PetAction) => void>();
  const settingsHandlers = new Set<(settings: PetSettings) => void>();
  const resetHandlers = new Set<() => void>();

  window.addEventListener('storage', (event) => {
    if (event.key !== WEB_STATE_KEY || !event.newValue) return;
    try {
      const parsed = JSON.parse(event.newValue) as PersistedState;
      settingsHandlers.forEach((handler) => handler(parsed.settings));
    } catch {
      /* ignore */
    }
  });

  return {
    isElectron: false,
    platform: 'web',
    dragWindow: (dx, dy) => {
      webOffset.x += dx;
      webOffset.y += dy;
      applyWebLayout();
    },
    dragEnded: () => undefined,
    setIgnoreMouseEvents: () => undefined,
    loadState: async () => read(),
    saveStats: (stats) => {
      const state = read();
      state.stats = stats;
      write(state);
    },
    getSettings: async () => read().settings,
    updateSettings: async (patch) => {
      const state = read();
      state.settings = { ...state.settings, ...patch };
      write(state);
      settingsHandlers.forEach((handler) => handler(state.settings));
      return state.settings;
    },
    resetData: async () => {
      localStorage.removeItem(WEB_STATE_KEY);
      resetHandlers.forEach((handler) => handler());
    },
    openSettings: () => {
      window.open('./settings.html', '_blank');
    },
    openContextMenu: () => undefined,
    quit: () => window.close(),
    onAction: (handler) => {
      actionHandlers.add(handler);
      return () => {
        actionHandlers.delete(handler);
      };
    },
    onSettingsChanged: (handler) => {
      settingsHandlers.add(handler);
      return () => {
        settingsHandlers.delete(handler);
      };
    },
    onReset: (handler) => {
      resetHandlers.add(handler);
      return () => {
        resetHandlers.delete(handler);
      };
    },
  };
}

const WEB_MENU_ITEMS: Array<[string, PetAction]> = [
  ['抚摸一下', 'pet'],
  ['喂小鱼干', 'feed'],
  ['一起玩耍', 'play'],
  ['睡觉 / 唤醒', 'sleep'],
  ['设置...', 'settings'],
  ['重置数据', 'reset'],
  ['退出', 'quit'],
];

/** Boot all renderer subsystems. */
async function boot(): Promise<void> {
  const api: PetAPI = window.petAPI ?? createWebApi();
  const app = document.getElementById('app')!;
  const petCanvas = document.getElementById('pet-canvas') as HTMLCanvasElement;
  const fxCanvas = document.getElementById('fx-canvas') as HTMLCanvasElement;
  const bubbleEl = document.getElementById('bubble')!;
  const moodBar = document.getElementById('mood-bar')!;
  const satietyBar = document.getElementById('satiety-bar')!;
  const webMenu = document.getElementById('web-menu')!;

  if (!api.isElectron) {
    document.body.classList.add('web-mode');
    const hint = document.createElement('p');
    hint.className = 'web-hint';
    hint.textContent = '浏览器预览模式 · 拖拽移动 · 右键菜单 · 双击说话';
    document.body.appendChild(hint);
  }

  const persisted = await api.loadState();
  const sheet = await buildSpriteSheet();
  if (sheet.fallback) console.warn('[pet] Cutout was rejected; using the feathered card fallback.');

  const state = new PetState(api, persisted);
  const bubble = new Bubble(bubbleEl);
  const animator = new Animator(petCanvas.getContext('2d')!, sheet, state.settings);
  const particles = new ParticleField(fxCanvas.getContext('2d')!);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Refresh the two stat meters. */
  function updateHud(): void {
    moodBar.style.width = `${state.stats.mood}%`;
    satietyBar.style.width = `${state.stats.satiety}%`;
  }

  /** Central action router for pointer, tray, menu and web menu. */
  function handleAction(action: PetAction): void {
    switch (action) {
      case 'settings':
        api.openSettings();
        return;
      case 'quit':
        api.quit();
        return;
      case 'reset':
        void api.resetData().then(() => window.location.reload());
        return;
      case 'toggle-passthrough':
      case 'toggle-autolaunch': {
        if (!api.isElectron) {
          const key = action === 'toggle-passthrough' ? 'passthrough' : 'autoLaunch';
          void api.updateSettings({ [key]: !state.settings[key] } as Partial<PetSettings>);
        }
        return;
      }
      default:
        state.handle(action);
    }
  }

  /** Show the DOM context menu in browser preview mode. */
  function showWebMenu(x: number, y: number): void {
    webMenu.replaceChildren();
    for (const [label, action] of WEB_MENU_ITEMS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => {
        webMenu.hidden = true;
        handleAction(action);
      });
      webMenu.appendChild(button);
    }
    webMenu.style.left = `${Math.max(0, Math.min(x, window.innerWidth - 176))}px`;
    webMenu.style.top = `${Math.max(0, Math.min(y, window.innerHeight - 280))}px`;
    webMenu.hidden = false;
  }

  state.onBubble = (text, ms) => bubble.show(text, ms);
  state.onSound = () => playMeow(state.settings.volume);
  state.onStats = updateHud;
  state.onMoodState = (mood) => animator.setState(mood);

  // Pointer: distinguish a click from a drag, and a click from a double-click.
  let dragging = false;
  let moved = false;
  let downX = 0;
  let downY = 0;
  let lastX = 0;
  let lastY = 0;
  let clickTimer = 0;

  app.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    dragging = true;
    moved = false;
    downX = event.screenX;
    downY = event.screenY;
    lastX = event.screenX;
    lastY = event.screenY;
    app.setPointerCapture(event.pointerId);
  });

  app.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const dx = event.screenX - lastX;
    const dy = event.screenY - lastY;
    lastX = event.screenX;
    lastY = event.screenY;

    if (!moved && Math.hypot(event.screenX - downX, event.screenY - downY) > DRAG_THRESHOLD) {
      moved = true;
      state.beginDrag();
    }
    if (moved) api.dragWindow(dx, dy);
  });

  app.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    if (moved) {
      api.dragEnded();
      state.endDrag();
    } else {
      clickTimer = window.setTimeout(() => handleAction('pet'), 220);
    }
  });

  app.addEventListener('dblclick', () => {
    if (clickTimer) {
      window.clearTimeout(clickTimer);
      clickTimer = 0;
    }
    state.speakRandom();
  });

  app.addEventListener('pointerenter', () => state.setHover(true));
  app.addEventListener('pointerleave', () => state.setHover(false));

  app.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    if (api.isElectron) api.openContextMenu();
    else showWebMenu(event.clientX, event.clientY);
  });

  document.addEventListener('pointerdown', (event) => {
    if (!webMenu.hidden && !webMenu.contains(event.target as Node)) webMenu.hidden = true;
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') webMenu.hidden = true;
  });

  api.onAction((action) => handleAction(action));
  api.onSettingsChanged((settings) => {
    state.applySettings(settings);
    animator.setSettings(settings);
    webScale = settings.scale;
    applyWebLayout();
    updateHud();
  });
  api.onReset(() => window.location.reload());

  webScale = state.settings.scale;
  applyWebLayout();
  updateHud();

  window.setInterval(() => state.tick(), 1000);

  let lastFrame = performance.now();
  /** Render loop; pauses all canvas work while the window is hidden. */
  function frame(now: number): void {
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;

    if (!document.hidden) {
      const motion = state.settings.motionEnabled && !reduceMotion;
      animator.update(dt);
      particles.update(dt, motion);
      animator.render();
      particles.render(motion);
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

void boot().catch((error) => {
  console.error('[pet] Failed to start:', error);
  const message = document.createElement('p');
  message.textContent = '启动失败，请打开开发者工具查看控制台。';
  message.style.cssText = 'padding:16px;color:#2c3e63;font:14px sans-serif;';
  document.body.appendChild(message);
});
