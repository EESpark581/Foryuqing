/** Slow drifting water drops and star sparkles around the pet. */
import { SPRITE_SIZE } from './sprite';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  phase: number;
  kind: 'drop' | 'star';
}

const COUNT = 26;

export class ParticleField {
  private readonly items: Particle[] = [];

  constructor(private readonly ctx: CanvasRenderingContext2D) {
    for (let i = 0; i < COUNT; i += 1) {
      this.items.push(this.create(true));
    }
  }

  /** Create (or recycle) one particle. */
  private create(initial: boolean): Particle {
    const kind: Particle['kind'] = Math.random() > 0.62 ? 'star' : 'drop';
    return {
      x: Math.random() * SPRITE_SIZE,
      y: initial ? Math.random() * SPRITE_SIZE : -20 - Math.random() * 120,
      vx: (Math.random() - 0.5) * 8,
      vy: 8 + Math.random() * 16,
      radius: kind === 'star' ? 1.6 + Math.random() * 2.2 : 2 + Math.random() * 3,
      alpha: 0.2 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
      kind,
    };
  }

  /** Move particles; paused entirely when motion is disabled or page hidden. */
  update(dt: number, enabled: boolean): void {
    if (!enabled) return;
    for (let i = 0; i < this.items.length; i += 1) {
      const p = this.items[i];
      p.phase += dt * 1.4;
      p.x += (p.vx + Math.sin(p.phase) * 6) * dt;
      p.y += p.vy * dt;
      if (p.y > SPRITE_SIZE + 24 || p.x < -30 || p.x > SPRITE_SIZE + 30) {
        this.items[i] = this.create(false);
      }
    }
  }

  /** Paint the particle layer. */
  render(enabled: boolean): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
    if (!enabled) return;

    for (const p of this.items) {
      const twinkle = 0.65 + 0.35 * Math.sin(p.phase * 2);
      ctx.globalAlpha = p.alpha * twinkle;

      if (p.kind === 'drop') {
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 2.2);
        gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
        gradient.addColorStop(0.4, 'rgba(186,226,255,0.7)');
        gradient.addColorStop(1, 'rgba(186,226,255,0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.radius, p.radius * 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(p.x - p.radius * 2, p.y);
        ctx.lineTo(p.x + p.radius * 2, p.y);
        ctx.moveTo(p.x, p.y - p.radius * 2);
        ctx.lineTo(p.x, p.y + p.radius * 2);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
  }
}
