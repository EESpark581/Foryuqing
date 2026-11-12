/**
 * Runtime sprite generation.
 *
 * The pet renders from one transparent character PNG (baked once from the
 * reference artwork by scripts/make_transparent.py). No backdrop is ever drawn.
 * Expression frames (blink / happy / sleep), vector mouth overlays and a
 * soft-light decor layer clipped to the character are derived at startup.
 * Opaque replacement artwork still gets a runtime flood fill, and a missing
 * asset degrades to a fully transparent procedural cat.
 * No image-generation API is required.
 */
import type { PetSettings } from '../../shared/pet';
import type { MouthLayers } from './mouth';
import { PHOTO_ANCHOR, VECTOR_ANCHOR, buildMouthLayers } from './mouth';

export type FrameKey = 'idle0' | 'idle1' | 'blink' | 'happy' | 'sleep';

export interface SpriteSheet {
  frames: Record<FrameKey, HTMLCanvasElement>;
  mouths: MouthLayers;
  decor: HTMLCanvasElement;
  fallback: boolean;
}

export const SPRITE_SIZE = 512;
/** Transparent character asset; no backdrop is ever drawn behind the pet. */
export const SOURCE_PATH = './assets/pet.png';

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
  // Nose and mouth are supplied by the shared mouth overlay layers, so the
  // vector cat gets exactly the same expressive muzzle as the photo artwork.

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
 * Load the transparent character asset, or draw a transparent vector cat when
 * it is missing. A corner alpha test decides whether a replacement image is
 * already cut out; only opaque artwork needs the runtime flood fill.
 */
function loadSource(): Promise<{ canvas: HTMLCanvasElement; isVector: boolean; hasAlpha: boolean }> {
  return new Promise((resolve) => {
    const image = new Image();

    const vectorFallback = (): void => {
      const canvas = createCanvas();
      drawProceduralCat(canvas.getContext('2d')!);
      resolve({ canvas, isVector: true, hasAlpha: true });
    };

    image.onload = () => {
      const canvas = createCanvas();
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(image, 0, 0, SPRITE_SIZE, SPRITE_SIZE);
      let hasAlpha = true;
      try {
        hasAlpha = ctx.getImageData(0, 0, 1, 1).data[3] < 250;
      } catch {
        // A tainted canvas under strict file:// still means our clean PNG.
      }
      resolve({ canvas, isVector: false, hasAlpha });
    };

    image.onerror = vectorFallback;
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

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Deterministic PRNG so a given frame always looks identical. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function cssRgb(colour: Rgb, alpha = 1): string {
  const r = Math.round(Math.max(0, Math.min(255, colour.r)));
  const g = Math.round(Math.max(0, Math.min(255, colour.g)));
  const b = Math.round(Math.max(0, Math.min(255, colour.b)));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Push a colour towards white (k > 1) or into shadow (k < 1). */
function shade(colour: Rgb, k: number): Rgb {
  if (k >= 1) {
    const t = Math.min(1, k - 1) * 1.1;
    return {
      r: colour.r + (255 - colour.r) * t,
      g: colour.g + (255 - colour.g) * t,
      b: colour.b + (255 - colour.b) * t,
    };
  }
  return { r: colour.r * k, g: colour.g * k, b: colour.b * k };
}

/**
 * Draw one tapered hair, wide at the root and pointed at the tip.
 *
 * Filled shapes read as fur far better than uniform strokes, which is what
 * makes the closed eyelid look fluffy instead of drawn.
 */
function drawHair(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dx: number,
  len: number,
  width: number,
  bend: number,
  colour: string,
): void {
  const tipX = x + dx * len;
  const tipY = y + len;
  const midX = x + dx * len * 0.45 + bend;
  const midY = y + len * 0.5;
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(x - width, y);
  ctx.quadraticCurveTo(midX - width * 0.5, midY, tipX, tipY);
  ctx.quadraticCurveTo(midX + width * 0.5, midY, x + width, y);
  ctx.closePath();
  ctx.fill();
}

/**
 * Paint one closed eye so the lid reads as fluffy fur.
 *
 * The eye is covered with a feathered patch interpolated from the actual fur
 * above and below it, so local face shading continues through the closed lid.
 */
function drawFluffyLid(
  ctx: CanvasRenderingContext2D,
  sourcePixels: Uint8ClampedArray,
  cx: number,
  cy: number,
  r: number,
  kind: 'blink' | 'happy' | 'sleep',
  seed: number,
): void {
  const rand = seeded(seed);
  const sample = (x: number, y: number): Rgb => {
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    for (let py = -2; py <= 2; py += 1) {
      for (let px = -2; px <= 2; px += 1) {
        const sx = Math.max(0, Math.min(SPRITE_SIZE - 1, Math.round(x) + px));
        const sy = Math.max(0, Math.min(SPRITE_SIZE - 1, Math.round(y) + py));
        const offset = (sy * SPRITE_SIZE + sx) * 4;
        if (sourcePixels[offset + 3] < 128) continue;
        red += sourcePixels[offset];
        green += sourcePixels[offset + 1];
        blue += sourcePixels[offset + 2];
        count += 1;
      }
    }
    if (count === 0) return { r: 246, g: 246, b: 255 };
    return { r: red / count, g: green / count, b: blue / count };
  };
  const halfW = r * 1.12;
  const halfH = r * 1.03;
  const width = Math.ceil(halfW * 2);
  const height = Math.ceil(halfH * 2);
  const lidCanvas = document.createElement('canvas');
  lidCanvas.width = width;
  lidCanvas.height = height;
  const lidCtx = lidCanvas.getContext('2d')!;
  const lid = lidCtx.createImageData(width, height);
  const furTop: Rgb[] = [];
  const furBottom: Rgb[] = [];
  for (let x = 0; x < width; x += 1) {
    const faceX = cx - halfW + x;
    furTop.push(sample(faceX, cy - halfH * 1.08));
    furBottom.push(sample(faceX, cy + halfH * 1.08));
  }

  for (let y = 0; y < height; y += 1) {
    const v = (y / (height - 1)) * 2 - 1;
    for (let x = 0; x < width; x += 1) {
      const u = (x / (width - 1)) * 2 - 1;
      const distance = Math.hypot(u, v);
      if (distance >= 1) continue;
      const t = (v + 1) / 2;
      const top = furTop[x];
      const bottom = furBottom[x];
      const offset = (y * width + x) * 4;
      const edge = Math.max(0, Math.min(1, (1 - distance) * Math.min(halfW, halfH) * 0.8));
      const alpha = edge * edge * (3 - 2 * edge);
      lid.data[offset] = Math.round(top.r + (bottom.r - top.r) * t);
      lid.data[offset + 1] = Math.round(top.g + (bottom.g - top.g) * t);
      lid.data[offset + 2] = Math.round(top.b + (bottom.b - top.b) * t);
      lid.data[offset + 3] = Math.round(255 * alpha);
    }
  }
  lidCtx.putImageData(lid, 0, 0);
  ctx.drawImage(lidCanvas, Math.round(cx - halfW), Math.round(cy - halfH));

  const topMid = furTop[Math.floor(width / 2)];
  const bottomMid = furBottom[Math.floor(width / 2)];
  const furMid = shade(
    {
      r: (topMid.r + bottomMid.r) / 2,
      g: (topMid.g + bottomMid.g) / 2,
      b: (topMid.b + bottomMid.b) / 2,
    },
    0.96,
  );

  const lidY = cy + r * (kind === 'sleep' ? 0.26 : 0.14);

  if (kind === 'happy') {
    // ^ shaped grin, drawn as soft fur shading rather than a hard outline.
    const arcR = r * 0.6;
    const arcCy = cy + r * 0.44;
    ctx.lineCap = 'round';
    ctx.strokeStyle = cssRgb(shade(furMid, 0.72), 0.32);
    ctx.lineWidth = r * 0.11;
    ctx.beginPath();
    ctx.arc(cx, arcCy, arcR, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();

    ctx.strokeStyle = cssRgb(topMid, 0.34);
    ctx.lineWidth = r * 0.05;
    ctx.beginPath();
    ctx.arc(cx, arcCy - r * 0.05, arcR * 0.95, Math.PI * 1.16, Math.PI * 1.84);
    ctx.stroke();

    for (let i = 0; i < 12; i += 1) {
      const t = i / 11;
      const angle = Math.PI * (1.12 + 0.76 * t);
      const px = cx + Math.cos(angle) * arcR;
      const py = arcCy + Math.sin(angle) * arcR;
      drawHair(
        ctx,
        px,
        py,
        Math.cos(angle) * 0.35,
        r * (0.14 + rand() * 0.1),
        r * 0.028,
        Math.sin(angle) * r * 0.03,
        cssRgb(rand() > 0.4 ? topMid : furMid, 0.42 + rand() * 0.18),
      );
    }
    return;
  }

  // 2. Volume: a soft shadow under the lid.
  const shadeGrad = ctx.createLinearGradient(cx, lidY - r * 0.32, cx, lidY + r * 0.3);
  shadeGrad.addColorStop(0, cssRgb(shade(furMid, 0.86), 0));
  shadeGrad.addColorStop(0.55, cssRgb(shade(furMid, 0.86), 0.18));
  shadeGrad.addColorStop(1, cssRgb(shade(furMid, 0.86), 0.02));
  ctx.fillStyle = shadeGrad;
  ctx.beginPath();
  ctx.ellipse(cx, lidY + r * 0.04, r * 0.96, r * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();

  // 3. Fringe: short tapered hairs hanging from the lid line.
  const hairs = 26;
  for (let i = 0; i < hairs; i += 1) {
    const t = i / (hairs - 1);
    const x = cx - halfW * 0.86 + halfW * 1.72 * t;
    const arc = Math.sin(Math.PI * t);
    const y = lidY - r * 0.1 * arc;
    const dir = t < 0.5 ? -0.5 : 0.5;
    const len = r * (0.11 + rand() * 0.12) * (0.55 + arc * 0.75);
    drawHair(
      ctx,
      x,
      y,
      dir * 0.35,
      len,
      r * (0.022 + rand() * 0.014),
      dir * r * 0.02,
      cssRgb(rand() > 0.45 ? shade(furMid, 0.8) : furMid, 0.28 + rand() * 0.16),
    );
  }

  // A few longer hairs at the corners break the silhouette without becoming
  // spiky lashes.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i += 1) {
      drawHair(
        ctx,
        cx + side * halfW * (0.8 + i * 0.06),
        lidY + r * 0.02 + i * r * 0.05,
        side * 0.28,
        r * (0.2 + rand() * 0.08),
        r * 0.022,
        side * r * 0.03,
        cssRgb(shade(furMid, 0.76), 0.24 + rand() * 0.1),
      );
    }
  }

  // Soft fuzz along the fold unifies the hairs with the lid.
  ctx.save();
  ctx.filter = 'blur(4px)';
  ctx.strokeStyle = cssRgb(furMid, 0.3);
  ctx.lineWidth = r * 0.16;
  ctx.beginPath();
  ctx.moveTo(cx - halfW * 0.86, lidY - r * 0.1);
  ctx.quadraticCurveTo(cx, lidY + r * 0.12, cx + halfW * 0.86, lidY - r * 0.1);
  ctx.stroke();
  ctx.restore();

  // 4. Lid crease: soft, but strong enough to read as a closed eye.
  ctx.strokeStyle = cssRgb(shade(furMid, 0.7), 0.2);
  ctx.lineWidth = r * 0.045;
  ctx.beginPath();
  ctx.moveTo(cx - halfW * 0.9, lidY - r * 0.12);
  ctx.quadraticCurveTo(cx, lidY + r * 0.16, cx + halfW * 0.9, lidY - r * 0.12);
  ctx.stroke();

  // 5. A softer fold line above it for a little depth.
  ctx.strokeStyle = cssRgb(shade(furMid, 0.8), 0.08);
  ctx.lineWidth = r * 0.04;
  ctx.beginPath();
  ctx.moveTo(cx - halfW * 0.66, lidY - r * 0.36);
  ctx.quadraticCurveTo(cx, lidY - r * 0.16, cx + halfW * 0.66, lidY - r * 0.36);
  ctx.stroke();
}

/** Derive an expression frame by painting closed / smiling eyes. */
function expressionFrame(base: HTMLCanvasElement, kind: 'blink' | 'happy' | 'sleep'): HTMLCanvasElement {
  const S = SPRITE_SIZE;
  const canvas = cloneCanvas(base);
  const ctx = canvas.getContext('2d')!;
  const source = base.getContext('2d', { willReadFrequently: true })!;
  const sourcePixels = source.getImageData(0, 0, S, S).data;

  for (let eyeIndex = 0; eyeIndex < EYES.length; eyeIndex += 1) {
    const eye = EYES[eyeIndex];
    const cx = eye.x * S;
    const cy = eye.y * S;
    const r = eye.r * S;

    drawFluffyLid(ctx, sourcePixels, cx, cy, r, kind, 8191 + eyeIndex * 137);

    if (kind === 'happy') {
      ctx.fillStyle = 'rgba(255,170,195,0.42)';
      ctx.beginPath();
      ctx.ellipse(cx - r * 1.9, cy + r * 1.5, r * 0.55, r * 0.3, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + r * 1.9, cy + r * 1.5, r * 0.55, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (kind === 'sleep') {
    // Tint the character only; a full-canvas fill would paint a visible
    // rectangle on the transparent window.
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(40,60,110,0.1)';
    ctx.fillRect(0, 0, S, S);
    ctx.globalCompositeOperation = 'source-over';
  }

  return canvas;
}

/** Additive glow layer clipped to the character so no light floats outside. */
function buildDecor(base: HTMLCanvasElement): HTMLCanvasElement {
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

  // Keep glows on the fur only; otherwise they read as stray backdrop blobs
  // against a transparent desktop.
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(base, 0, 0, S, S);
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}

/**
 * Build the full sprite sheet. Resolves even when the character asset is
 * absent, so the app never renders a blank window - and never a backdrop card.
 */
export async function buildSpriteSheet(_settings?: PetSettings): Promise<SpriteSheet> {
  const source = await loadSource();
  let base: HTMLCanvasElement;
  let anchor = PHOTO_ANCHOR;
  let fallback = false;

  if (source.isVector) {
    base = source.canvas;
    anchor = VECTOR_ANCHOR;
    fallback = true;
  } else if (source.hasAlpha) {
    // The shipped asset is already transparent: use it verbatim.
    base = source.canvas;
  } else {
    try {
      const result = cutOutBackground(source.canvas);
      if (result.removed > MAX_REMOVED_RATIO) throw new Error('cutout removed too much');
      base = result.canvas;
    } catch (error) {
      // A failed cutout must never reintroduce an opaque rectangle.
      console.warn('[pet] Cutout unavailable, drawing the procedural cat:', error);
      base = createCanvas();
      drawProceduralCat(base.getContext('2d')!);
      anchor = VECTOR_ANCHOR;
      fallback = true;
    }
  }
  let furColor = 'rgb(246, 246, 255)';
  try {
    furColor = sampleFur(
      base.getContext('2d', { willReadFrequently: true })!,
      anchor.noseX,
      anchor.noseY - anchor.halfWidth * 1.9,
    );
  } catch {
    // A tainted canvas still gets a readable muzzle in the neutral fur tone.
  }

  return {
    frames: {
      idle0: cloneCanvas(base),
      idle1: cloneCanvas(base),
      blink: expressionFrame(base, 'blink'),
      happy: expressionFrame(base, 'happy'),
      sleep: expressionFrame(base, 'sleep'),
    },
    mouths: buildMouthLayers(base, furColor, anchor),
    decor: buildDecor(base),
    fallback,
  };
}
