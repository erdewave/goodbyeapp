import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({ root: 'ui', base: './', plugins: [react(), tailwindcss()], resolve: { alias: { '@': fileURLToPath(new URL('./ui', import.meta.url)) } }, build: { outDir: '../dist-ui', emptyOutDir: true } });
