import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Builds the embeddable library: dist/lib/liquid-glass.js (ES module, no dependencies).
export default defineConfig({
  build: {
    outDir: 'dist/lib',
    emptyOutDir: false,
    copyPublicDir: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/lib/index.ts'),
      formats: ['es'],
      fileName: () => 'liquid-glass.js',
    },
  },
});
