import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  root: import.meta.dirname,
  base: './',
  publicDir: '.generated',
  plugins: [vue()],
  server: { host: '127.0.0.1', port: 5192, strictPort: true, proxy: { '/api/v1': { target: 'https://kotobud.com', changeOrigin: true } } },
  build: {
    outDir: 'dist', emptyOutDir: true, target: 'chrome116',
    rollupOptions: {
      input: { sidepanel: resolve(import.meta.dirname, 'sidepanel.html'), learning: resolve(import.meta.dirname, 'learning.html'), background: resolve(import.meta.dirname, 'src/background.ts') },
      output: { entryFileNames: chunk => chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js' },
    },
  },
});
