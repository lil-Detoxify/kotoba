import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],root:'apps/web',publicDir:'public',build:{outDir:process.env.CLOUDFLARE_BUILD?'../../dist-cloudflare':'../../dist',emptyOutDir:true},server:{port:5173,strictPort:true}});
