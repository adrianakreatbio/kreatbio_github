import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: {
    lib: {
      entry: 'src/main.ts',
      name: 'Microload',
      formats: ['iife'],
      fileName: () => 'game.js',
      cssFileName: 'styles',
    },
  },
});
