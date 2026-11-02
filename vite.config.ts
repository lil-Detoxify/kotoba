import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const rootDir = import.meta.dirname;

export default defineConfig({
  plugins: [vue()],
  root: 'apps/web',
  publicDir: 'public',
  build: {
    manifest: true,
    outDir: process.env.CLOUDFLARE_BUILD ? '../../dist-cloudflare' : '../../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'apps/web/index.html'),
        app: resolve(rootDir, 'apps/web/app.html'),
        landing: resolve(rootDir, 'apps/web/landing.html')
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
