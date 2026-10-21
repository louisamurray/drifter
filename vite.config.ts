/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    // Lets tests read the stylesheet with ?raw, for example its @font-face rules.
    css: { include: [/style\.css/] },
  },
});
