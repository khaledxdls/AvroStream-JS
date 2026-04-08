import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    target: 'es2022',
    outDir: 'dist',
    splitting: false,
  },
  {
    entry: { cli: 'src/cli/index.ts' },
    format: ['esm', 'cjs'],
    dts: false,
    sourcemap: false,
    banner: { js: '#!/usr/bin/env node' },
    target: 'node18',
    outDir: 'dist',
    splitting: false,
  },
]);
