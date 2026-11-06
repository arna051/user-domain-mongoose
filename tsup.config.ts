import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', nestjs: 'src/nestjs.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  external: ['mongoose', '@nestjs/common', 'reflect-metadata', 'rxjs'],
});
