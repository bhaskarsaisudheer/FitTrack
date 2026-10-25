import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The integration suite talks to the real MySQL instance, so the files
    // must not run concurrently against the same tables.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
