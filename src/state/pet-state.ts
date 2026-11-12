/** Mood/state machine, stats decay, reminders and Chinese dialogue lines. */
import { DEFAULT_SETTINGS, DEFAULT_STATS } from '../../shared/pet';
import type { PetAction, PetAPI, PetMoodState, PersistedState, PetSettings, PetStats } from '../../shared/pet';

const LINES = {
  pet: ['喵~ 好舒服', '再摸摸嘛', '呼噜呼噜…', '耳朵痒痒的'],
  feed: ['小鱼干！最喜欢了', '谢谢主人~', '吃饱饱啦'],
  play: ['再来一次！', '尾巴忍不住啦', '翅膀也跟着抖起来'],
  wake: ['醒啦~ 刚刚梦见星星', '唔…我在这儿'],
  sleep: ['困了…Zzz'],
  remind: ['坐太久啦，起来动一动、喝口水吧', '眼睛也该休息一下咯'],
  idle: [
    '今天也要好好休息哦',
    '要记得喝水呀',
    '我在这里陪着你',
    '翅膀有点痒~',
    '星露落下来了',
    '偷偷看你在忙什么',
  ],
  hungry: '肚子咕咕叫了…',
  lonely: '有点无聊…陪我玩会儿？',
};

const SLEEP_AFTER_MS = 5 * 60 * 1000;
const WARNING_COOLDOWN_MS = 10 * 60 * 1000;

const clamp = (value: number): number => Math.min(100, Math.max(0, value));
const pick = (items: string[]): string => items[Math.floor(Math.random() * items.length)];

export class PetState {
  stats: PetStats;
  settings: PetSettings;
  moodState: PetMoodState = 'idle';

  onBubble?: (text: string, ms?: number) => void;
  onSound?: () => void;
  onStats?: () => void;
  onMoodState?: (state: PetMoodState) => void;

  private stateUntil = 0;
  private lastReminder = Date.now();
  private lastWarning = 0;
  private petCount = 0;

  constructor(private readonly api: PetAPI, initial: PersistedState) {
    this.stats = {
      ...DEFAULT_STATS(),
      ...initial.stats,
      lastTick: initial.stats?.lastTick || Date.now(),
      lastInteraction: initial.stats?.lastInteraction || Date.now(),
    };
    this.settings = { ...DEFAULT_SETTINGS, ...initial.settings };
  }

  /** Apply a settings snapshot pushed from Electron. */
  applySettings(settings: PetSettings): void {
    this.settings = { ...settings };
  }

  /** Reset only the pet stats (settings are owned by the main process). */
  resetStats(): void {
    this.stats = DEFAULT_STATS();
    this.setMood('idle', 0);
    this.afterStats();
  }

  /** Route an interaction from the tray, context menu or pointer. */
  handle(action: PetAction): void {
    switch (action) {
      case 'pet':
        this.onPet();
        break;
      case 'feed':
        this.onFeed();
        break;
      case 'play':
        this.onPlay();
        break;
      case 'sleep':
        this.toggleSleep();
        break;
      case 'wake':
        this.wake();
        break;
      case 'remind':
        this.remind();
        break;
      case 'show':
      case 'hide':
      case 'toggle-visible':
        this.wake();
        break;
      default:
        // Window-level actions are handled by the Electron main process.
        break;
    }
  }

  /** Single-click affection. */
  onPet(): void {
    this.noteInteraction();
    this.stats.mood = clamp(this.stats.mood + 4);
    this.petCount += 1;
    this.setMood('petted', 1.2);
    if (this.petCount % 3 === 0) this.say(pick(LINES.pet));
    if (this.petCount % 2 === 0) this.onSound?.();
    this.afterStats();
  }

  /** Feeding raises satiety and mood. */
  onFeed(): void {
    this.noteInteraction();
    this.stats.satiety = clamp(this.stats.satiety + 20);
    this.stats.mood = clamp(this.stats.mood + 6);
    this.setMood('eating', 1.6);
    this.say(pick(LINES.feed));
    this.onSound?.();
    this.afterStats();
  }

  /** Playing is fun but burns a little energy. */
  onPlay(): void {
    this.noteInteraction();
    this.stats.mood = clamp(this.stats.mood + 10);
    this.stats.satiety = clamp(this.stats.satiety - 6);
    this.setMood('happy', 2.2);
    this.say(pick(LINES.play));
    this.onSound?.();
    this.afterStats();
  }

  /** Double-click: a random line plus a happy expression. */
  speakRandom(): void {
    this.noteInteraction();
    this.setMood('happy', 1.4);
    this.say(pick(LINES.idle), 3200);
    this.onSound?.();
  }

  /** Sedentary / hydration reminder. */
  remind(): void {
    this.setMood('remind', 4);
    this.say(pick(LINES.remind), 5000);
    this.onSound?.();
  }

  /** Enter the dragging pose. */
  beginDrag(): void {
    this.noteInteraction();
    this.moodState = 'dragged';
    this.stateUntil = Number.POSITIVE_INFINITY;
    this.onMoodState?.('dragged');
  }

  /** Return to idle after a drag. */
  endDrag(): void {
    this.setMood('idle', 0);
  }

  /** Hover highlight, only while otherwise idle. */
  setHover(hovered: boolean): void {
    if (hovered && this.moodState === 'idle') {
      this.moodState = 'hover';
      this.onMoodState?.('hover');
    } else if (!hovered && this.moodState === 'hover') {
      this.setMood('idle', 0);
    }
  }

  /** Sleep / wake toggle used by the tray item. */
  toggleSleep(): void {
    if (this.moodState === 'sleep') {
      this.wake();
      this.say(pick(LINES.wake));
    } else {
      this.sleep();
    }
  }

  /** Wake up and reset the idle timer. */
  wake(): void {
    if (this.moodState === 'sleep') this.setMood('idle', 0);
    this.stats.lastInteraction = Date.now();
  }

  /** Enter the sleeping state until the next interaction. */
  sleep(): void {
    this.moodState = 'sleep';
    this.stateUntil = Number.POSITIVE_INFINITY;
    this.onMoodState?.('sleep');
    this.say(pick(LINES.sleep), 2600);
  }

  /** One-second clock: decay, auto-sleep, reminders, state timeouts. */
  tick(): void {
    const now = Date.now();

    const minutes = (now - this.stats.lastTick) / 60_000;
    if (minutes >= 1) {
      this.stats.mood = clamp(this.stats.mood - minutes * 0.5);
      this.stats.satiety = clamp(this.stats.satiety - minutes * 0.7);
      this.stats.lastTick = now;
      this.afterStats();
    }

    if (this.moodState !== 'sleep' && this.stateUntil > 0 && now > this.stateUntil) {
      this.setMood('idle', 0);
    }

    if (this.moodState !== 'sleep' && now - this.stats.lastInteraction > SLEEP_AFTER_MS) {
      this.sleep();
    }

    if (
      this.settings.reminderEnabled &&
      this.moodState !== 'sleep' &&
      now - this.lastReminder >= this.settings.reminderMinutes * 60_000
    ) {
      this.lastReminder = now;
      this.remind();
    }

    if (now - this.lastWarning > WARNING_COOLDOWN_MS && this.moodState !== 'sleep') {
      if (this.stats.satiety < 20) {
        this.say(LINES.hungry);
        this.lastWarning = now;
      } else if (this.stats.mood < 20) {
        this.say(LINES.lonely);
        this.lastWarning = now;
      }
    }
  }

  /** Set a temporary mood state. */
  private setMood(state: PetMoodState, seconds: number): void {
    this.moodState = state;
    this.stateUntil = seconds > 0 ? Date.now() + seconds * 1000 : 0;
    this.onMoodState?.(state);
  }

  /** Show a speech bubble. */
  private say(text: string, ms = 2600): void {
    this.onBubble?.(text, ms);
  }

  /** Record any user interaction (also wakes a sleeping pet). */
  private noteInteraction(): void {
    this.stats.lastInteraction = Date.now();
    if (this.moodState === 'sleep') this.setMood('idle', 0);
  }

  /** Notify listeners and persist stats. */
  private afterStats(): void {
    this.onStats?.();
    this.api.saveStats({ ...this.stats });
  }
}
