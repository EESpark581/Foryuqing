/**
 * Runtime sprite generation.
 *
 * The repository ships a single static reference image. At startup we remove
 * its blue gradient background with a seeded flood fill, then derive the
 * expression frames (blink / happy / sleep) and a soft-light decor layer.
 * No image-generation API and no external binary assets are required.
 */
import type { PetSettings } from '../../shared/pet';

export type FrameKey = 'idle0' | 'idle1' | 'blink' | 'happy' | 'sleep';

export interface SpriteSheet {
  frames: Record<FrameKey, HTMLCanvasElement>;
  decor: HTMLCanvasElement;
  fallback: boolean;
}

export const SPRITE_SIZE = 512;
export const SOURCE_PATH = './assets/reference.jpg';

const SEED_TOLERANCE = 26;
const GROW_TOLERANCE = 34;
const MAX_REMOVED_RATIO = 0.68;

/** Normalised eye centres/radius, tuned for the supplied reference image. */
const EYES = [
  { x: 0.44, y: 0.42, r: 0.055 },
  { x: 0.617, y: 0.42, r: 0.055 },
];

/** Create an offscreen 512px canvas. */
function createCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_SIZE;
  canvas.height = SPRITE_SIZE;
  return canvas;
}

/** Clone a canvas with its current pixels. */
function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = createCanvas();
  canvas.getContext('2d')!.drawImage(source, 0, 0);
  return canvas;
}

/**
 * Procedural stand-in drawn when the reference image is missing or unreadable.
 * Uses the same palette and eye coordinates so expression frames still line up.
 */
function drawProceduralCat(ctx: CanvasRenderingContext2D): void {
  const S = SPRITE_SIZE;
  ctx.clearRect(0, 0, S, S);

  // Curled tail behind the body.
  const tailGradient = ctx.createLinearGradient(330, 300, 470, 470);
  tailGradient.addColorStop(0, '#bfe4f8');
  tailGradient.addColorStop(1, '#c5b0ee');
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = 62;
  ctx.strokeStyle = tailGradient;
  ctx.beginPath();
  ctx.moveTo(322, 428);
  ctx.bezierCurveTo(440, 430, 486, 340, 424, 308);
  ctx.bezierCurveTo(374, 282, 344, 330, 382, 352);
  ctx.stroke();
  ctx.restore();

  // Translucent fairy wings.
  const wings: Array<[number, number, number, number, number]> = [
    [152, 292, 108, 62, -0.32],
    [372, 288, 96, 56, 0.32],
  ];
  for (const [x, y, rx, ry, rotation] of wings) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    const wing = ctx.createRadialGradient(0, 0, 4, 0, 0, rx);
    wing.addColorStop(0, 'rgba(226,246,255,0.85)');
    wing.addColorStop(0.65, 'rgba(170,214,250,0.5)');
    wing.addColorStop(1, 'rgba(190,180,245,0.05)');
    ctx.fillStyle = wing;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // Sitting body.
  const body = ctx.createLinearGradient(0, 300, 0, 500);
  body.addColorStop(0, '#fdfdff');
  body.addColorStop(0.6, '#e6eefc');
  body.addColorStop(1, '#b9d4f2');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(256, 410, 112, 108, 0, 0, Math.PI * 2);
  ctx.fill();

  // Front paws.
  ctx.fillStyle = '#f7f6ff';
  for (const x of [212, 300]) {
    ctx.beginPath();
    ctx.ellipse(x, 486, 34, 22, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ears.
  const ears: Array<[number[], number[], number[]]> = [
    [[136, 68], [212, 168], [128, 196]],
    [[376, 68], [384, 196], [300, 168]],
  ];
  for (const [tip, outer, inner] of ears) {
    const ear = ctx.createLinearGradient(tip[0], tip[1], outer[0], outer[1]);
    ear.addColorStop(0, '#c3a9f2');
    ear.addColorStop(1, '#a9d8f5');
    ctx.fillStyle = ear;
    ctx.beginPath();
    ctx.moveTo(tip[0], tip[1]);
    ctx.lineTo(outer[0], outer[1]);
    ctx.lineTo(inner[0], inner[1]);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(255,201,212,0.9)';
    ctx.beginPath();
    ctx.moveTo(tip[0] + 12, tip[1] + 34);
    ctx.lineTo(outer[0] + 12, outer[1] - 28);
    ctx.lineTo(inner[0] + 4, inner[1] - 22);
    ctx.closePath();
    ctx.fill();
  }

  // Head.
  const head = ctx.createLinearGradient(0, 100, 0, 350);
  head.addColorStop(0, '#cfe9fb');
  head.addColorStop(0.45, '#f2f4ff');
  head.addColorStop(1, '#ffffff');
  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.ellipse(256, 238, 142, 128, 0, 0, Math.PI * 2);
  ctx.fill();

  // Forehead fringe.
  ctx.fillStyle = 'rgba(178,214,250,0.85)';
  ctx.beginPath();
  ctx.ellipse(256, 128, 74, 30, -0.18, 0, Math.PI * 2);
  ctx.fill();

  // Eyes.
  for (const eye of EYES) {
    const cx = eye.x * S;
    const cy = eye.y * S;
    const r = eye.r * S;
    const iris = ctx.createRadialGradient(cx - 6, cy - 8, 2, cx, cy, r);
    iris.addColorStop(0, '#6fb6ea');
    iris.addColorStop(0.55, '#2f6cae');
    iris.addColorStop(1, '#1d3459');
    ctx.fillStyle = iris;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0e1b33';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.35, cy - r * 0.4, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3a4c73';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 2, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
  }

  // Blush, nose and smile.
  ctx.fillStyle = 'rgba(255,178,198,0.5)';
  for (const x of [176, 340]) {
    ctx.beginPath();
    ctx.ellipse(x, 268, 24, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ff9fb2';
  ctx.beginPath();
  ctx.moveTo(256, 268);
  ctx.lineTo(244, 260);
  ctx.lineTo(268, 260);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#7d6e93';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(256, 270);
  ctx.lineTo(256, 278);
  ctx.arc(244, 278, 12, 0, Math.PI * 0.55);
  ctx.moveTo(256, 278);
  ctx.arc(268, 278, 12, Math.PI * 0.45, Math.PI);
  ctx.stroke();

  // Forehead gem, collar and pendant.
  ctx.fillStyle = 'rgba(190,235,255,0.95)';
  ctx.beginPath();
  ctx.moveTo(272, 132);
  ctx.quadraticCurveTo(286, 156, 272, 168);
  ctx.quadraticCurveTo(258, 156, 272, 132);
  ctx.fill();
  ctx.strokeStyle = '#c4b3f0';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(196, 316);
  ctx.quadraticCurveTo(256, 340, 316, 316);
  ctx.stroke();
  const pendant = ctx.createLinearGradient(256, 330, 256, 372);
  pendant.addColorStop(0, '#e9f8ff');
  pendant.addColorStop(1, '#9cc9f5');
  ctx.fillStyle = pendant;
  ctx.beginPath();
  ctx.moveTo(256, 352);
  ctx.quadraticCurveTo(274, 372, 256, 386);
  ctx.quadraticCurveTo(238, 372, 256, 352);
  ctx.fill();
}

/**
 * Load the reference image, or fall back to a vector cat drawn on canvas.
 */
function loadSource(): Promise<{ canvas: HTMLCanvasElement; isVector: boolean }> {
  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => {
      const canvas = createCanvas();
      canvas.getContext('2d')!.drawImage(image, 0, 0, SPRITE_SIZE, SPRITE_SIZE);
      resolve({ canvas, isVector: false });
    };

    image.onerror = () => {
      const canvas = createCanvas();
      drawProceduralCat(canvas.getContext('2d')!);
      resolve({ canvas, isVector: true });
    };

    image.src = SOURCE_PATH;
  });
}

/**
 * Remove the flat blue background with a border-seeded flood fill.
 * A per-row left/right colour interpolation models the background gradient,
 * which keeps the pale-blue fur from being eaten together with the backdrop.
 */
function cutOutBackground(source: HTMLCanvasElement): { canvas: HTMLCanvasElement; removed: number } {
  const S = SPRITE_SIZE;
  const canvas = cloneCanvas(source);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const image = ctx.getImageData(0, 0, S, S);
  const pixels = image.data;

  const left = new Float32Array(S * 3);
  const right = new Float32Array(S * 3);

  for (let y = 0; y < S; y += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      let a = 0;
      let b = 0;
      for (let x = 0; x < 6; x += 1) {
        a += pixels[(y * S + x) * 4 + channel];
        b += pixels[(y * S + (S - 1 - x)) * 4 + channel];
      }
      left[y * 3 + channel] = a / 6;
      right[y * 3 + channel] = b / 6;
    }
  }

  /** Distance between a pixel and the modelled background at its position. */
  const distance = (index: number, x: number, y: number): number => {
    const t = x / (S - 1);
    const offset = index * 4;
    const dr = pixels[offset] - (left[y * 3] + (right[y * 3] - left[y * 3]) * t);
    const dg = pixels[offset + 1] - (left[y * 3 + 1] + (right[y * 3 + 1] - left[y * 3 + 1]) * t);
    const db = pixels[offset + 2] - (left[y * 3 + 2] + (right[y * 3 + 2] - left[y * 3 + 2]) * t);
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };

  const visited = new Uint8Array(S * S);
  const queue = new Int32Array(S * S);
  let head = 0;
  let tail = 0;

  /** Seed the flood fill from the four borders. */
  const seed = (x: number, y: number): void => {
    const index = y * S + x;
    if (visited[index] || distance(index, x, y) >= SEED_TOLERANCE) return;
    visited[index] = 1;
    queue[tail++] = index;
  };

  for (let x = 0; x < S; x += 1) {
    seed(x, 0);
    seed(x, S - 1);
  }
  for (let y = 0; y < S; y += 1) {
    seed(0, y);
    seed(S - 1, y);
  }

  while (head < tail) {
    const index = queue[head++];
    const x = index % S;
    const y = (index - x) / S;
    const neighbours = [
      x > 0 ? index - 1 : -1,
      x < S - 1 ? index + 1 : -1,
      y > 0 ? index - S : -1,
      y < S - 1 ? index + S : -1,
    ];

    for (const next of neighbours) {
      if (next < 0 || visited[next]) continue;
      const nx = next % S;
      const ny = (next - nx) / S;
      if (distance(next, nx, ny) >= GROW_TOLERANCE) continue;
      visited[next] = 1;
      queue[tail++] = next;
    }
  }

  const originalAlpha = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i += 1) originalAlpha[i] = pixels[i * 4 + 3];

  for (let i = 0; i < S * S; i += 1) {
    if (visited[i]) pixels[i * 4 + 3] = 0;
  }

  // Feather the cut edge by softening the first ring of kept pixels.
  for (let y = 1; y < S - 1; y += 1) {
    for (let x = 1; x < S - 1; x += 1) {
      const index = y * S + x;
      if (!visited[index]) continue;
      const ring = [index - 1, index + 1, index - S, index + S];
      for (const next of ring) {
        if (!visited[next] && originalAlpha[next] > 0) {
          pixels[next * 4 + 3] = Math.round(originalAlpha[next] * 0.72);
        }
      }
    }
  }

  ctx.putImageData(image, 0, 0);
  return { canvas, removed: tail / (S * S) };
}

/** Graceful degradation: keep the whole artwork as a soft-edged card. */
function featheredCard(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = cloneCanvas(source);
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(256, 250, 130, 256, 256, 258);
  gradient.addColorStop(0, 'rgba(0,0,0,1)');
  gradient.addColorStop(0.72, 'rgba(0,0,0,0.96)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}

/** Average a small opaque patch of fur to paint over an eye. */
function sampleFur(ctx: CanvasRenderingContext2D, cx: number, cy: number): string {
  try {
    const patch = ctx.getImageData(Math.round(cx) - 4, Math.round(cy) - 4, 9, 9).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let i = 0; i < patch.length; i += 4) {
      if (patch[i + 3] < 128) continue;
      r += patch[i];
      g += patch[i + 1];
      b += patch[i + 2];
      count += 1;
    }
    if (count > 0) return `rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`;
  } catch {
    /* tainted or unreadable canvas */
  }
  return 'rgb(246, 246, 255)';
}

/** Derive an expression frame by painting closed / smiling eyes. */
function expressionFrame(base: HTMLCanvasElement, kind: 'blink' | 'happy' | 'sleep'): HTMLCanvasElement {
  const S = SPRITE_SIZE;
  const canvas = cloneCanvas(base);
  const ctx = canvas.getContext('2d')!;
  const source = base.getContext('2d', { willReadFrequently: true })!;

  for (const eye of EYES) {
    const cx = eye.x * S;
    const cy = eye.y * S;
    const r = eye.r * S;

    ctx.fillStyle = sampleFur(source, cx, cy - r * 1.5);
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 1.14, r * 1.04, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = kind === 'happy' ? '#4d5c86' : '#5a6b90';
    ctx.lineWidth = Math.max(2, r * 0.14);
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (kind === 'happy') {
      ctx.arc(cx, cy + r * 0.32, r * 0.64, Math.PI * 1.08, Math.PI * 1.92);
    } else {
      ctx.arc(cx, cy - r * 0.04, r * 0.7, Math.PI * 0.12, Math.PI * 0.88);
    }
    ctx.stroke();

    if (kind === 'happy') {
      ctx.fillStyle = 'rgba(255,170,195,0.42)';
      ctx.beginPath();
      ctx.ellipse(cx - r * 1.9, cy + r * 1.5, r * 0.55, r * 0.3, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + r * 1.9, cy + r * 1.5, r * 0.55, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (kind === 'sleep') {
    ctx.fillStyle = 'rgba(40,60,110,0.1)';
    ctx.fillRect(0, 0, S, S);
  }

  return canvas;
}

/** Additive glow layer for wings, forehead gem and collar pendant. */
function buildDecor(): HTMLCanvasElement {
  const S = SPRITE_SIZE;
  const canvas = createCanvas();
  const ctx = canvas.getContext('2d')!;
  ctx.globalCompositeOperation = 'lighter';

  const glow = (x: number, y: number, radius: number, color: string): void => {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  };

  glow(0.22 * S, 0.5 * S, 0.19 * S, 'rgba(185,232,255,0.5)');
  glow(0.76 * S, 0.49 * S, 0.15 * S, 'rgba(200,220,255,0.45)');
  glow(0.545 * S, 0.335 * S, 0.05 * S, 'rgba(255,255,255,0.75)');
  glow(0.5 * S, 0.66 * S, 0.055 * S, 'rgba(215,240,255,0.65)');

  return canvas;
}

/**
 * Build the full sprite sheet. Resolves even when the reference image is
 * absent, so the app never renders a blank window.
 */
export async function buildSpriteSheet(_settings?: PetSettings): Promise<SpriteSheet> {
  const source = await loadSource();
  let base: HTMLCanvasElement;
  let fallback = false;

  if (source.isVector) {
    base = source.canvas;
  } else {
    const result = cutOutBackground(source.canvas);
    if (result.removed > MAX_REMOVED_RATIO) {
      fallback = true;
      base = featheredCard(source.canvas);
    } else {
      base = result.canvas;
    }
  }

  return {
    frames: {
      idle0: cloneCanvas(base),
      idle1: cloneCanvas(base),
      blink: expressionFrame(base, 'blink'),
      happy: expressionFrame(base, 'happy'),
      sleep: expressionFrame(base, 'sleep'),
    },
    decor: buildDecor(),
    fallback,
  };
}
