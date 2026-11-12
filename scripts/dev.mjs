/**
 * Bootstraps the Vite dev server and launches Electron against it.
 * Keeps the dependency surface small: no concurrently / wait-on needed.
 */
import { createServer } from 'vite';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const NPM_CMD = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const compiled = spawnSync(NPM_CMD, ['run', 'build:electron'], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (compiled.status !== 0) {
  console.error('[dev] Failed to compile the Electron main process.');
  process.exit(compiled.status ?? 1);
}

const server = await createServer({
  root: ROOT,
  server: { port: 5173, strictPort: true },
});

await server.listen();
server.printUrls();

const ELECTRON_BIN = require('electron');
const child = spawn(ELECTRON_BIN, [ROOT], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, PET_DEV_URL: 'http://localhost:5173' },
});

let closing = false;

/**
 * Tear down both processes so a closed pet window never leaves Vite running.
 * @param {number} code process exit code
 */
function shutdown(code) {
  if (closing) return;
  closing = true;
  try {
    child.kill();
  } catch {
    /* already gone */
  }
  server.close().finally(() => process.exit(code));
}

child.on('exit', (code) => shutdown(code ?? 0));
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
