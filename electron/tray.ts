/** System tray icon and shared context-menu template. */
import { Menu, Tray, nativeImage } from 'electron';
import zlib from 'node:zlib';
import type { MenuItemConstructorOptions } from 'electron';
import type { PetAction, PetSettings } from '../shared/pet';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 used by the minimal PNG encoder below. */
function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** One PNG chunk: length, type, data, CRC. */
function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBytes = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

/** Barycentric point-in-triangle test for the ear shapes. */
function inTriangle(px: number, py: number, a: number[], b: number[], c: number[]): boolean {
  const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(d) < 1e-6) return false;
  const w1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / d;
  const w2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / d;
  const w3 = 1 - w1 - w2;
  return w1 >= 0 && w2 >= 0 && w3 >= 0;
}

/**
 * Build a 32x32 RGBA tray icon in memory so the repo needs no binary assets.
 * A tiny blue-violet cat face with ears, eyes and a pink nose.
 */
function buildTrayIcon(): Electron.NativeImage {
  const S = 32;
  const stride = S * 4 + 1;
  const raw = Buffer.alloc(stride * S);

  const put = (x: number, y: number, r: number, g: number, b: number, a = 255): void => {
    const i = y * stride + 1 + x * 4;
    raw[i] = r;
    raw[i + 1] = g;
    raw[i + 2] = b;
    raw[i + 3] = a;
  };

  const earL = [[7, 2], [15, 13], [3, 16]];
  const earR = [[25, 2], [29, 16], [17, 13]];
  const innerL = [[8, 6], [13, 13], [6, 14]];
  const innerR = [[24, 6], [26, 14], [19, 13]];

  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const t = Math.min(1, Math.max(0, (y - 8) / 22));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      if (inTriangle(x, y, earL[0], earL[1], earL[2]) || inTriangle(x, y, earR[0], earR[1], earR[2])) {
        r = Math.round(178 - 20 * t);
        g = Math.round(170 + 10 * t);
        b = 242;
        a = 255;
        if (inTriangle(x, y, innerL[0], innerL[1], innerL[2]) || inTriangle(x, y, innerR[0], innerR[1], innerR[2])) {
          r = 255;
          g = 201;
          b = 212;
        }
      } else {
        const dx = x - 16;
        const dy = y - 19;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= 11.2) {
          r = Math.round(169 - 20 * t);
          g = Math.round(221 - 37 * t);
          b = Math.round(247 - 2 * t);
          a = 255;

          const eye = Math.hypot(x - 12, y - 18) <= 2.5 || Math.hypot(x - 20, y - 18) <= 2.5;
          const sparkle = Math.hypot(x - 11.2, y - 17.2) <= 0.9 || Math.hypot(x - 19.2, y - 17.2) <= 0.9;
          const blush = Math.hypot(x - 7.5, y - 23) <= 2.1 || Math.hypot(x - 24.5, y - 23) <= 2.1;
          const nose = Math.hypot(x - 16, y - 23.5) <= 1.3;

          if (sparkle) { r = 255; g = 255; b = 255; }
          else if (eye) { r = 43; g = 74; b = 122; }
          else if (nose) { r = 255; g = 157; b = 176; }
          else if (blush) { r = 255; g = 190; b = 205; a = 170; }
        }
      }

      put(x, y, r, g, b, a);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0);
  ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);

  return nativeImage.createFromBuffer(png);
}

/** Menu definition shared by the tray and the right-click menu. */
function menuTemplate(
  dispatch: (action: PetAction) => void,
  settings: PetSettings,
): MenuItemConstructorOptions[] {
  return [
    { label: '显示 / 隐藏  星露灵猫', click: () => dispatch('toggle-visible') },
    { type: 'separator' },
    { label: '抚摸一下', click: () => dispatch('pet') },
    { label: '喂小鱼干', click: () => dispatch('feed') },
    { label: '一起玩耍', click: () => dispatch('play') },
    { label: '睡觉 / 唤醒', click: () => dispatch('sleep') },
    { type: 'separator' },
    {
      label: '鼠标穿透 (Ctrl+Alt+P)',
      type: 'checkbox',
      checked: settings.passthrough,
      click: () => dispatch('toggle-passthrough'),
    },
    {
      label: '开机自启',
      type: 'checkbox',
      checked: settings.autoLaunch,
      click: () => dispatch('toggle-autolaunch'),
    },
    { type: 'separator' },
    { label: '设置...', click: () => dispatch('settings') },
    { label: '重置数据', click: () => dispatch('reset') },
    { type: 'separator' },
    { label: '退出', click: () => dispatch('quit') },
  ];
}

/** Create the tray and attach its first context menu. */
export function createTray(
  dispatch: (action: PetAction) => void,
  getSettings: () => PetSettings,
): Tray {
  const tray = new Tray(buildTrayIcon());
  tray.setToolTip('星露灵猫 · 桌面宠物');
  refreshTray(tray, dispatch, getSettings);
  tray.on('double-click', () => dispatch('show'));
  return tray;
}

/** Rebuild the tray menu after any settings change (checkbox state). */
export function refreshTray(
  tray: Tray,
  dispatch: (action: PetAction) => void,
  getSettings: () => PetSettings,
): void {
  tray.setContextMenu(Menu.buildFromTemplate(menuTemplate(dispatch, getSettings())));
}

/** Right-click menu shown over the pet window. */
export function buildContextMenu(
  dispatch: (action: PetAction) => void,
  getSettings: () => PetSettings,
): Menu {
  return Menu.buildFromTemplate(menuTemplate(dispatch, getSettings()));
}
