import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@game-logic': resolve(__dirname, 'src/game-logic'),
      '@application': resolve(__dirname, 'src/application'),
      '@presentation': resolve(__dirname, 'src/presentation'),
      '@infrastructure': resolve(__dirname, 'src/infrastructure'),
      '@assets': resolve(__dirname, 'src/assets'),
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          babylonjs: ['@babylonjs/core', '@babylonjs/gui', '@babylonjs/loaders'],
        },
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
