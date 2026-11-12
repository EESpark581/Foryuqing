/** Frame selection and whole-body motion for the pet canvas. */
import type { PetMoodState, PetSettings } from '../../shared/pet';
import type { FrameKey, SpriteSheet } from './sprite';
import { SPRITE_SIZE } from './sprite';

export class Animator {
  private time = 0;
  private stateAge = 0;
  private state: PetMoodState = 'idle';
  private blinkCountdown = 3 + Math.random() * 3;
  private blinkRemaining = 0;
  private settings: PetSettings;

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly sheet: SpriteSheet,
    settings: PetSettings,
  ) {
    this.settings = settings;
  }

  /** Replace the active settings snapshot (called after IPC settings changes). */
  setSettings(settings: PetSettings): void {
    this.settings = settings;
  }

  /** Switch mood state; resets the transient animation clock. */
  setState(state: PetMoodState): void {
    if (state === this.state) return;
    this.state = state;
    this.stateAge = 0;
  }

  /** Advance clocks. @param dt seconds since the previous frame */
  update(dt: number): void {
    this.time += dt;
    this.stateAge += dt;

    if (!this.settings.motionEnabled) return;
    if (this.blinkRemaining > 0) {
      this.blinkRemaining -= dt;
    } else if (this.state !== 'sleep') {
      this.blinkCountdown -= dt;
      if (this.blinkCountdown <= 0) {
        this.blinkRemaining = 0.14;
        this.blinkCountdown = 3 + Math.random() * 4;
      }
    }
  }

  /** Draw one composed frame. */
  render(): void {
    const S = SPRITE_SIZE;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, S, S);

    const motion = this.settings.motionEnabled;
    const breath = motion ? Math.sin(this.time * 2.6) : 0;
    const floatY = motion ? Math.sin(this.time * 1.3) * 2 : 0;
    let tilt = 0;
    let bounce = 0;
    let sway = 0;

    switch (this.state) {
      case 'dragged':
        tilt = -0.085;
        break;
      case 'petted':
        sway = motion ? Math.sin(this.time * 12) * 0.035 : 0;
        break;
      case 'eating':
      case 'happy': {
        const decay = Math.max(0, 1 - this.stateAge / 1.4);
        bounce = motion ? Math.abs(Math.sin(this.stateAge * 9)) * 11 * decay : 0;
        break;
      }
      case 'remind':
        bounce = motion ? Math.abs(Math.sin(this.time * 4)) * 6 : 0;
        break;
      default:
        break;
    }

    let frame: FrameKey = 'idle0';
    if (this.state === 'sleep') frame = 'sleep';
    else if (this.blinkRemaining > 0) frame = 'blink';
    else if (this.state === 'happy' || this.state === 'eating' || this.state === 'petted') frame = 'happy';
    else if (breath > 0.55) frame = 'idle1';

    ctx.save();
    ctx.translate(S / 2, S / 2 + floatY - bounce);
    ctx.rotate(tilt + sway);
    ctx.scale(1 + breath * 0.008, 1 - breath * 0.012);
    ctx.translate(-S / 2, -S / 2);

    ctx.drawImage(this.sheet.frames[frame], 0, 0, S, S);

    if (motion) {
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.4 + 0.35 * (0.5 + 0.5 * Math.sin(this.time * 1.8));
      ctx.drawImage(this.sheet.decor, 0, 0, S, S);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    if (this.state === 'sleep') {
      ctx.fillStyle = 'rgba(35,55,105,0.08)';
      ctx.fillRect(0, 0, S, S);
    }

    ctx.restore();
  }
}
