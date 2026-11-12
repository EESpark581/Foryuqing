/** Dev-only page: render each eyelid frame zoomed in for visual review. */
import { buildSpriteSheet } from './renderer/sprite';
import type { FrameKey } from './renderer/sprite';

const LABELS: Array<[FrameKey, string]> = [
  ['idle0', 'idle (open)'],
  ['blink', 'blink'],
  ['happy', 'happy'],
  ['sleep', 'sleep'],
];

/** Crop the face area of a 512px frame so the lids are easy to judge. */
function faceCrop(source: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = 300;
  out.height = 300;
  const ctx = out.getContext('2d')!;
  // Face lives around x 0.40-0.66, y 0.34-0.52 of the sprite.
  const sx = 512 * 0.38;
  const sy = 512 * 0.32;
  const sw = 512 * 0.3;
  const sh = 512 * 0.26;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return out;
}

async function main(): Promise<void> {
  const grid = document.getElementById('grid')!;
  const sheet = await buildSpriteSheet();
  for (const [key, label] of LABELS) {
    const figure = document.createElement('figure');
    figure.appendChild(faceCrop(sheet.frames[key]));
    const caption = document.createElement('figcaption');
    caption.textContent = label;
    figure.appendChild(caption);
    grid.appendChild(figure);
  }
}

void main();
