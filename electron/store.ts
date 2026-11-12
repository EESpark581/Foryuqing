/** File-backed persistence for stats, settings and window position. */
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS, DEFAULT_STATS } from '../shared/pet';
import type { PersistedState, PetSettings, PetStats } from '../shared/pet';

const STATE_FILE = 'pet-state.json';
let cache: PersistedState | null = null;

/** Absolute path of the state file inside Electron's userData directory. */
function statePath(): string {
  return path.join(app.getPath('userData'), STATE_FILE);
}

/** A clean default state used on first launch or after a corrupt file. */
function freshState(): PersistedState {
  return {
    stats: DEFAULT_STATS(),
    settings: { ...DEFAULT_SETTINGS },
    position: null,
  };
}

/** Load (and memoise) the persisted state, falling back to defaults on error. */
export function loadState(): PersistedState {
  if (cache) return cache;

  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(), 'utf8')) as Partial<PersistedState>;
    cache = {
      stats: { ...DEFAULT_STATS(), ...(parsed.stats ?? {}) },
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      position: parsed.position ?? null,
    };
  } catch {
    cache = freshState();
  }

  return cache;
}

/** Persist a partial state update without ever dropping the other fields. */
export function saveState(patch: Partial<PersistedState>): PersistedState {
  const current = loadState();

  cache = {
    stats: patch.stats ?? current.stats,
    settings: patch.settings ?? current.settings,
    position: patch.position !== undefined ? patch.position : current.position,
  };

  try {
    fs.mkdirSync(path.dirname(statePath()), { recursive: true });
    fs.writeFileSync(statePath(), JSON.stringify(cache, null, 2), 'utf8');
  } catch (error) {
    console.error('[store] Failed to write state:', error);
  }

  return cache;
}

/** Convenience helper for the stats-only save path. */
export function saveStats(stats: PetStats): void {
  saveState({ stats });
}

/** Current settings, always merged over defaults. */
export function getSettings(): PetSettings {
  return loadState().settings;
}

/** Merge a settings patch, persist it and return the effective settings. */
export function updateSettings(patch: Partial<PetSettings>): PetSettings {
  const next = { ...loadState().settings, ...patch };
  next.scale = Math.min(2, Math.max(0.5, next.scale));
  next.opacity = Math.min(1, Math.max(0.3, next.opacity));
  next.volume = Math.min(1, Math.max(0, next.volume));
  next.reminderMinutes = Math.min(240, Math.max(1, Math.round(next.reminderMinutes)));
  saveState({ settings: next });
  return next;
}

/** Wipe all user data and return a pristine state. */
export function resetState(): PersistedState {
  cache = freshState();
  try {
    fs.writeFileSync(statePath(), JSON.stringify(cache, null, 2), 'utf8');
  } catch (error) {
    console.error('[store] Failed to reset state:', error);
  }
  return cache;
}
