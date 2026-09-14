import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/integration/**/*.integration-spec.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    retry: 0,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
