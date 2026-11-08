import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // tests/tile.net.test.ts hits the network and only runs with NET=1
    testTimeout: 20000,
  },
});
