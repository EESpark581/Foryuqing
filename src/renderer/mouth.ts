/**
 * Procedural nose + mouth overlays.
 *
 * The reference artwork is downscaled twice (source -> 512px sprite -> ~280px
 * window), which leaves its original mouth as a blurry 25px smudge. These
 * overlays repaint the muzzle with crisp vector shapes: a soft fur patch hides
 * the raster mouth, then a rounded cat nose and one of ten mouth shapes are
 * drawn on top. Each shape is a small transparent layer so the animator can
 * swap mouth poses per frame without regenerating full sprite frames.
 */
export type MouthKey =
  | 'smile'
  | 'smileSoft'
  | 'grin'
  | 'chew'
  | 'chewOpen'
  | 'sleepy'
  | 'talk'
  | 'talkWide'
  | 'mew'
  | 'surprised';

export interface FaceAnchor {
  /** All values are pixels in the 512px sprite coordinate space. */
  noseX: number;
  noseY: number;
  mouthY: number;
  halfWidth: number;
  noseWidth: number;
  /** Photo artwork has raster cheeks that the fur patch washes out. */
  blush: boolean;
}

export interface MouthLayer {
  canvas: HTMLCanvasElement;
  /** Top-left corner of the layer in sprite coordinates. */
  x: number;
  y: number;
}

export type MouthLayers = Record<MouthKey, MouthLayer>;

const LOCAL_W = 200;
const LOCAL_H = 160;

/** Measured against the supplied reference image (1071x1016 -> 512px). */
export const PHOTO_ANCHOR: FaceAnchor = {
  noseX: 281,
  noseY: 244,
  mouthY: 258,
  halfWidth: 27,
  noseWidth: 9.5,
  blush: true,
};

/** Matches the procedurally drawn fallback cat. */
export const VECTOR_ANCHOR: FaceAnchor = {
  noseX: 256,
  noseY: 266,
  mouthY: 280,
  halfWidth: 15,
  noseWidth: 6.5,
  blush: false,
};

const MOUTH_KEYS: MouthKey[] = [
  'smile',
  'smileSoft',
  'grin',
  'chew',
  'chewOpen',
  'sleepy',
  'talk',
  'talkWide',
  'mew',
  'surprised',
];

const LINE = '#846f92';
const LINE_SOFT = '#94849f';

/** Turn an `rgb(...)` sample into a translucent `rgba(...)` stop. */
function withAlpha(color: string, alpha: number): string {
  const parts = color.match(/\d+/g);
  if (!parts || parts.length < 3) return `rgba(246, 246, 255, ${alpha})`;
  return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
}

/**
 * Cover the original raster nose/mouth with a feathered patch sampled from the
 * artwork itself. Blurring the source keeps the exact local fur gradient (no
 * white "sticker" disc), while dissolving the low-resolution mouth lines. A
 * light wash of sampled fur removes the last dark pixels.
 */
function paintFurPatch(
  ctx: CanvasRenderingContext2D,
  base: HTMLCanvasElement,
  a: FaceAnchor,
  fur: string,
): void {
  const cy = (a.noseY + a.mouthY) / 2 + a.halfWidth * 0.12;
  const rx = a.halfWidth * 1.95;
  const ry = a.halfWidth * 1.05 + (a.mouthY - a.noseY) * 0.6;

  /** Apply a radial, feathered ellipse in the layer's scaled space. */
  const ellipse = (paint: (gradient: CanvasGradient) => void, mode?: GlobalCompositeOperation): void => {
    ctx.save();
    if (mode) ctx.globalCompositeOperation = mode;
    ctx.translate(a.noseX, cy);
    ctx.scale(rx / ry, 1);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, ry);
    paint(gradient);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, ry, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  ctx.save();
  ctx.filter = 'blur(10px)';
  ctx.drawImage(base, 0, 0);
  ctx.restore();

  ellipse((g) => {
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.62, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
  }, 'destination-in');

  ellipse((g) => {
    g.addColorStop(0, withAlpha(fur, 0.4));
    g.addColorStop(0.62, withAlpha(fur, 0.26));
    g.addColorStop(1, withAlpha(fur, 0));
  });
}

/** Restore the soft pink cheeks that the fur patch would otherwise erase. */
function drawBlush(ctx: CanvasRenderingContext2D, a: FaceAnchor): void {
  const y = a.mouthY - a.halfWidth * 0.1;
  for (const side of [-1, 1]) {
    const x = a.noseX + side * a.halfWidth * 1.42;
    const radius = a.halfWidth * 0.9;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, 'rgba(255, 158, 190, 0.42)');
    gradient.addColorStop(0.55, 'rgba(255, 170, 198, 0.24)');
    gradient.addColorStop(1, 'rgba(255, 180, 205, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Rounded inverted-triangle cat nose with a wet highlight and philtrum. */
function drawNose(ctx: CanvasRenderingContext2D, a: FaceAnchor): void {
  const { noseX: cx, noseY: ny, noseWidth: n, mouthY: my, halfWidth: w } = a;

  // A faint pink halo and shadow seat the nose into the fur instead of
  // letting the vector shape look like a pasted sticker.
  const halo = ctx.createRadialGradient(cx, ny, n * 0.2, cx, ny, n * 2.1);
  halo.addColorStop(0, 'rgba(255, 154, 184, 0.2)');
  halo.addColorStop(1, 'rgba(255, 168, 195, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, ny, n * 2.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(146, 108, 146, 0.13)';
  ctx.beginPath();
  ctx.ellipse(cx, ny + n * 0.95, n * 1.05, n * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();

  const nose = ctx.createLinearGradient(cx, ny - n, cx, ny + n);
  nose.addColorStop(0, '#ffd6df');
  nose.addColorStop(0.48, '#ffb3c5');
  nose.addColorStop(1, '#f38fab');
  ctx.fillStyle = nose;
  ctx.beginPath();
  ctx.moveTo(cx - n, ny - n * 0.42);
  ctx.quadraticCurveTo(cx - n * 0.55, ny - n * 0.82, cx, ny - n * 0.5);
  ctx.quadraticCurveTo(cx + n * 0.55, ny - n * 0.82, cx + n, ny - n * 0.42);
  ctx.quadraticCurveTo(cx + n * 0.78, ny + n * 0.5, cx, ny + n);
  ctx.quadraticCurveTo(cx - n * 0.78, ny + n * 0.5, cx - n, ny - n * 0.42);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(214, 128, 155, 0.28)';
  ctx.lineWidth = Math.max(0.8, n * 0.08);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
  ctx.beginPath();
  ctx.ellipse(cx - n * 0.34, ny - n * 0.3, n * 0.3, n * 0.17, -0.35, 0, Math.PI * 2);
  ctx.fill();

  // Short philtrum joining the nose to the mouth.
  ctx.strokeStyle = LINE_SOFT;
  ctx.lineWidth = Math.max(1.5, w * 0.075);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, ny + n * 0.95);
  ctx.lineTo(cx, my - w * 0.08);
  ctx.stroke();
}

/** Classic omega cat smile: two down-curved arcs with lifted corners. */
function strokeOmega(
  ctx: CanvasRenderingContext2D,
  a: FaceAnchor,
  width: number,
  depth: number,
  color: string,
): void {
  const { noseX: cx, mouthY: my } = a;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.7, a.halfWidth * 0.08);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, my);
  ctx.bezierCurveTo(cx - width * 0.2, my + depth, cx - width * 0.72, my + depth, cx - width, my - depth * 0.14);
  ctx.moveTo(cx, my);
  ctx.bezierCurveTo(cx + width * 0.2, my + depth, cx + width * 0.72, my + depth, cx + width, my - depth * 0.14);
  ctx.stroke();
}

/** Filled oral cavity with an optional tongue and tiny fangs. */
function openMouth(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  tongue: boolean,
  fangs = false,
): void {
  const cavity = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
  cavity.addColorStop(0, '#794a66');
  cavity.addColorStop(1, '#a86381');
  ctx.fillStyle = cavity;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(104, 66, 90, 0.42)';
  ctx.lineWidth = Math.max(1, rx * 0.065);
  ctx.stroke();

  if (tongue) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    const tongueFill = ctx.createLinearGradient(cx, cy, cx, cy + ry);
    tongueFill.addColorStop(0, '#ffc0d0');
    tongueFill.addColorStop(1, '#f48fae');
    ctx.fillStyle = tongueFill;
    ctx.beginPath();
    ctx.ellipse(cx, cy + ry * 0.68, rx * 0.68, ry * 0.66, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (fangs) {
    ctx.fillStyle = '#fffafd';
    for (const side of [-1, 1]) {
      const fx = cx + side * rx * 0.55;
      ctx.beginPath();
      ctx.moveTo(fx - rx * 0.11, cy - ry * 0.9);
      ctx.lineTo(fx + rx * 0.11, cy - ry * 0.9);
      ctx.lineTo(fx, cy - ry * 0.34);
      ctx.closePath();
      ctx.fill();
    }
  }
}

/** Wide open grin used for happy / petted states. */
function drawGrin(ctx: CanvasRenderingContext2D, a: FaceAnchor): void {
  const { noseX: cx, mouthY: my, halfWidth: w } = a;
  const rx = w * 0.84;
  const ry = w * 0.52;
  const top = my + w * 0.1;

  const shape = new Path2D();
  shape.moveTo(cx - rx, top - ry * 0.34);
  shape.quadraticCurveTo(cx, top + ry * 0.1, cx + rx, top - ry * 0.34);
  shape.quadraticCurveTo(cx + rx * 0.94, top + ry, cx, top + ry);
  shape.quadraticCurveTo(cx - rx * 0.94, top + ry, cx - rx, top - ry * 0.34);
  shape.closePath();

  const cavity = ctx.createLinearGradient(cx, top - ry * 0.34, cx, top + ry);
  cavity.addColorStop(0, '#7b4a67');
  cavity.addColorStop(1, '#a86280');
  ctx.fillStyle = cavity;
  ctx.fill(shape);

  ctx.save();
  ctx.clip(shape);
  const tongueFill = ctx.createLinearGradient(cx, top, cx, top + ry);
  tongueFill.addColorStop(0, '#ffc3d3');
  tongueFill.addColorStop(1, '#f28dae');
  ctx.fillStyle = tongueFill;
  ctx.beginPath();
  ctx.ellipse(cx, top + ry * 0.78, rx * 0.62, ry * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#fffafd';
  for (const side of [-1, 1]) {
    const fx = cx + side * rx * 0.53;
    ctx.beginPath();
    ctx.moveTo(fx - rx * 0.1, top - ry * 0.06);
    ctx.lineTo(fx + rx * 0.1, top - ry * 0.06);
    ctx.lineTo(fx, top + ry * 0.3);
    ctx.closePath();
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(104, 66, 90, 0.3)';
  ctx.lineWidth = Math.max(1, w * 0.045);
  ctx.lineCap = 'round';
  ctx.stroke(shape);
}

function drawShape(ctx: CanvasRenderingContext2D, key: MouthKey, a: FaceAnchor): void {
  const { noseX: cx, mouthY: my, halfWidth: w } = a;

  switch (key) {
    case 'smile':
      strokeOmega(ctx, a, w, w * 0.3, LINE);
      break;
    case 'smileSoft':
      strokeOmega(ctx, a, w * 0.92, w * 0.24, LINE_SOFT);
      break;
    case 'sleepy':
      strokeOmega(ctx, a, w * 0.66, w * 0.13, LINE_SOFT);
      break;
    case 'grin':
      drawGrin(ctx, a);
      break;
    case 'chew':
      openMouth(ctx, cx, my + w * 0.22, w * 0.36, w * 0.13, true);
      break;
    case 'chewOpen':
      openMouth(ctx, cx, my + w * 0.24, w * 0.43, w * 0.29, true);
      break;
    case 'talk':
      openMouth(ctx, cx, my + w * 0.17, w * 0.26, w * 0.19, true);
      break;
    case 'talkWide':
      openMouth(ctx, cx, my + w * 0.19, w * 0.31, w * 0.32, true);
      break;
    case 'mew':
      openMouth(ctx, cx, my + w * 0.15, w * 0.2, w * 0.24, false);
      break;
    case 'surprised':
      openMouth(ctx, cx, my + w * 0.2, w * 0.24, w * 0.36, false);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.beginPath();
      ctx.ellipse(cx, my + w * 0.08, w * 0.1, w * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
}

/**
 * Build one transparent layer per mouth pose. Drawing uses sprite-space
 * coordinates via a translate, so every layer stays perfectly registered
 * with the body frames regardless of its local size.
 */
export function buildMouthLayers(
  base: HTMLCanvasElement,
  furColor: string,
  anchor: FaceAnchor,
): MouthLayers {
  const x = Math.round(anchor.noseX - LOCAL_W / 2);
  const y = Math.round(anchor.noseY - LOCAL_H * 0.35);
  const layers = {} as MouthLayers;

  for (const key of MOUTH_KEYS) {
    const canvas = document.createElement('canvas');
    canvas.width = LOCAL_W;
    canvas.height = LOCAL_H;
    const ctx = canvas.getContext('2d')!;
    ctx.translate(-x, -y);
    paintFurPatch(ctx, base, anchor, furColor);
    if (anchor.blush) drawBlush(ctx, anchor);
    drawNose(ctx, anchor);
    drawShape(ctx, key, anchor);
    layers[key] = { canvas, x, y };
  }

  return layers;
}
