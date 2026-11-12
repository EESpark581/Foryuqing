import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const ROOT = process.cwd();

export default defineConfig({
  base: './',
  root: ROOT,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(ROOT, 'index.html'),
        settings: resolve(ROOT, 'settings.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
