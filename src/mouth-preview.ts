/**
 * Developer preview for the mouth overlay: renders every pose against the real
 * sprite sheet so nose registration, fur patch and line weight can be checked
 * without launching the Electron window. Vite-only, not part of the build.
 */
import type { MouthKey } from './renderer/mouth';
import { SPRITE_SIZE, buildSpriteSheet } from './renderer/sprite';

interface Pose {
  key: MouthKey;
  label: string;
  note: string;
}

const POSES: Pose[] = [
  { key: 'smile', label: '微笑', note: '待机 / 悬停' },
  { key: 'smileSoft', label: '轻微笑', note: '眨眼瞬间' },
  { key: 'grin', label: '开心张嘴', note: '抚摸 / 玩耍' },
  { key: 'chew', label: '咀嚼（闭）', note: '喂食循环' },
  { key: 'chewOpen', label: '咀嚼（张）', note: '喂食循环' },
  { key: 'talk', label: '说话（小）', note: '台词气泡期间' },
  { key: 'talkWide', label: '说话（大）', note: '台词气泡期间' },
  { key: 'mew', label: '喵呜', note: '被拖拽' },
  { key: 'surprised', label: '惊讶', note: '久坐提醒' },
  { key: 'sleepy', label: '睡嘴', note: '入睡' },
];

/** Face detail crop in sprite coordinates, enlarged for inspection. */
const FACE_CROP = { x: 188, y: 176, w: 190, h: 146 };

async function main(): Promise<void> {
  const sheet = await buildSpriteSheet();
  const hero = document.getElementById('hero') as HTMLCanvasElement;
  const heroCtx = hero.getContext('2d')!;
  const heroLabel = document.getElementById('hero-label')!;
  const controls = document.getElementById('controls')!;
  const grid = document.getElementById('grid')!;
  const status = document.getElementById('status')!;

  const composed = document.createElement('canvas');
  composed.width = SPRITE_SIZE;
  composed.height = SPRITE_SIZE;
  const composedCtx = composed.getContext('2d')!;

  /** Composite a body frame with one mouth layer. */
  function compose(key: MouthKey): void {
    composedCtx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
    composedCtx.drawImage(sheet.frames.idle0, 0, 0);
    const layer = sheet.mouths[key];
    composedCtx.drawImage(layer.canvas, layer.x, layer.y);
  }

  function renderHero(pose: Pose): void {
    compose(pose.key);
    heroCtx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
    heroCtx.drawImage(composed, 0, 0);
    heroLabel.textContent = pose.label;
    for (const button of controls.querySelectorAll('button')) {
      button.classList.toggle('active', button.dataset.key === pose.key);
    }
  }

  for (const pose of POSES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = pose.label;
    button.dataset.key = pose.key;
    button.addEventListener('click', () => renderHero(pose));
    controls.appendChild(button);

    const card = document.createElement('div');
    card.className = 'card';
    const canvas = document.createElement('canvas');
    canvas.width = 380;
    canvas.height = 292;
    const ctx = canvas.getContext('2d')!;
    const strong = document.createElement('strong');
    strong.textContent = pose.label;
    const span = document.createElement('span');
    span.textContent = pose.note;
    card.append(canvas, strong, span);
    grid.appendChild(card);

    compose(pose.key);
    ctx.drawImage(
      composed,
      FACE_CROP.x,
      FACE_CROP.y,
      FACE_CROP.w,
      FACE_CROP.h,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  }

  renderHero(POSES[0]);
  status.textContent =
    `抠图状态：${sheet.fallback ? '降级为羽化卡片' : '透明主体正常'} · ` +
    `共 ${POSES.length} 种口型 · 画布 ${SPRITE_SIZE}px，窗口默认 280px`;

  // Signals readiness to headless screenshot tooling.
  (window as unknown as { __MOUTH_READY__: boolean }).__MOUTH_READY__ = true;
}

void main().catch((error) => {
  console.error(error);
  const status = document.getElementById('status');
  if (status) status.textContent = `预览生成失败：${String(error)}`;
});
