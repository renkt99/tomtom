import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  base: '/tomtom/',
  plugins: [preact()],
  build: {
    sourcemap: false
  }
});
