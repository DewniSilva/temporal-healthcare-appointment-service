import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    // The frontend is a separate package with its own vitest config and a
    // jsdom environment; without this, root `vitest run` also collects its
    // *.test.tsx files and runs them under this config's Node environment.
    exclude: [...configDefaults.exclude, 'frontend/**']
  }
});
