/** Settings window controller; works with Electron IPC or localStorage. */
import { DEFAULT_SETTINGS } from '../shared/pet';
import type { PetSettings } from '../shared/pet';

const WEB_STATE_KEY = 'stardew-pet-state';

/** Read settings from localStorage in browser preview mode. */
function readLocal(): PetSettings {
  try {
    const raw = localStorage.getItem(WEB_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { settings?: Partial<PetSettings> };
      return { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) };
    }
  } catch {
    /* corrupt storage */
  }
  return { ...DEFAULT_SETTINGS };
}

/** Merge settings into localStorage without dropping stats/position. */
function writeLocal(settings: PetSettings): void {
  try {
    const raw = localStorage.getItem(WEB_STATE_KEY);
    const state: Record<string, unknown> = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    state.settings = settings;
    localStorage.setItem(WEB_STATE_KEY, JSON.stringify(state));
  } catch {
    /* storage blocked */
  }
}

const getSettings = async (): Promise<PetSettings> =>
  window.petAPI ? window.petAPI.getSettings() : readLocal();

const updateSettings = async (patch: Partial<PetSettings>): Promise<PetSettings> => {
  if (window.petAPI) return window.petAPI.updateSettings(patch);
  const next = { ...readLocal(), ...patch };
  writeLocal(next);
  return next;
};

const resetData = async (): Promise<void> => {
  if (window.petAPI) {
    await window.petAPI.resetData();
    return;
  }
  localStorage.removeItem(WEB_STATE_KEY);
};

/** Typed getElementById helper. */
function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const scale = el<HTMLInputElement>('scale');
const opacity = el<HTMLInputElement>('opacity');
const volume = el<HTMLInputElement>('volume');
const scaleValue = el<HTMLOutputElement>('scale-value');
const opacityValue = el<HTMLOutputElement>('opacity-value');
const volumeValue = el<HTMLOutputElement>('volume-value');
const autoLaunch = el<HTMLInputElement>('autoLaunch');
const motionEnabled = el<HTMLInputElement>('motionEnabled');
const gravityEnabled = el<HTMLInputElement>('gravityEnabled');
const passthrough = el<HTMLInputElement>('passthrough');
const reminderEnabled = el<HTMLInputElement>('reminderEnabled');
const reminderMinutes = el<HTMLInputElement>('reminderMinutes');
const status = el<HTMLParagraphElement>('status');

const percent = (value: number): string => `${Math.round(value * 100)}%`;

/** Render a settings snapshot into all controls. */
function render(settings: PetSettings): void {
  scale.value = String(settings.scale);
  scaleValue.textContent = percent(settings.scale);
  opacity.value = String(settings.opacity);
  opacityValue.textContent = percent(settings.opacity);
  volume.value = String(settings.volume);
  volumeValue.textContent = percent(settings.volume);
  autoLaunch.checked = settings.autoLaunch;
  motionEnabled.checked = settings.motionEnabled;
  gravityEnabled.checked = settings.gravityEnabled;
  passthrough.checked = settings.passthrough;
  reminderEnabled.checked = settings.reminderEnabled;
  reminderMinutes.value = String(settings.reminderMinutes);
}

let statusTimer = 0;

/** Brief "saved" confirmation. */
function flash(text: string): void {
  window.clearTimeout(statusTimer);
  status.textContent = text;
  statusTimer = window.setTimeout(() => {
    status.textContent = '';
  }, 1600);
}

/** Persist a patch and re-render with the effective values. */
async function save(patch: Partial<PetSettings>): Promise<void> {
  const settings = await updateSettings(patch);
  render(settings);
  flash('设置已保存');
}

/** Bind a range input: live label on `input`, persisted on `change`. */
function bindRange(
  input: HTMLInputElement,
  output: HTMLOutputElement,
  key: 'scale' | 'opacity' | 'volume',
): void {
  input.addEventListener('input', () => {
    output.textContent = percent(Number(input.value));
  });
  input.addEventListener('change', () => {
    void save({ [key]: Number(input.value) } as Partial<PetSettings>);
  });
}

/** Bind a checkbox to a boolean setting. */
function bindCheck(input: HTMLInputElement, key: 'autoLaunch' | 'motionEnabled' | 'gravityEnabled' | 'passthrough' | 'reminderEnabled'): void {
  input.addEventListener('change', () => {
    void save({ [key]: input.checked } as Partial<PetSettings>);
  });
}

bindRange(scale, scaleValue, 'scale');
bindRange(opacity, opacityValue, 'opacity');
bindRange(volume, volumeValue, 'volume');
bindCheck(autoLaunch, 'autoLaunch');
bindCheck(motionEnabled, 'motionEnabled');
bindCheck(gravityEnabled, 'gravityEnabled');
bindCheck(passthrough, 'passthrough');
bindCheck(reminderEnabled, 'reminderEnabled');

reminderMinutes.addEventListener('change', () => {
  const minutes = Math.min(240, Math.max(1, Math.round(Number(reminderMinutes.value) || 45)));
  reminderMinutes.value = String(minutes);
  void save({ reminderMinutes: minutes });
});

el<HTMLButtonElement>('btn-reset').addEventListener('click', () => {
  if (!window.confirm('确定重置心情、饱食度、位置和所有设置吗？')) return;
  void resetData().then(() => {
    render({ ...DEFAULT_SETTINGS });
    flash('已重置，请重新打开宠物窗口');
  });
});

el<HTMLButtonElement>('btn-close').addEventListener('click', () => window.close());

void getSettings().then(render);
