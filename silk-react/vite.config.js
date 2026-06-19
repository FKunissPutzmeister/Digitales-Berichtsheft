import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Library build: emits ONE self-contained ES module + ONE CSS file into
// ../app/silk/. Everything (react, three, fiber, motion, gsap) is INLINED —
// the runtime server 404-blocks /node_modules, so no bare-specifier imports
// may survive in the artifact. base:'./' keeps any accidental asset URL
// relative; NODE_ENV=production ships React's production build.
export default defineConfig({
  plugins: [react()],
  define: { 'process.env.NODE_ENV': '"production"' },
  base: './',
  build: {
    outDir: '../app/silk',
    emptyOutDir: true,
    cssCodeSplit: false,
    minify: 'esbuild',
    target: 'es2020',
    lib: {
      entry: fileURLToPath(new URL('./src/entry.js', import.meta.url)),
      formats: ['es'],
      fileName: () => 'silk-bundle.js',
    },
    rollupOptions: {
      external: [], // bundle EVERYTHING — nothing resolved from node_modules at runtime
      output: {
        inlineDynamicImports: true, // guarantee a single JS file (no hashed chunks)
        assetFileNames: 'silk-bundle.css',
      },
    },
  },
});
