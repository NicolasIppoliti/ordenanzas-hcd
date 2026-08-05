import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Phase 1 ships no product code yet — an empty suite is expected and
    // must still exit 0. Later phases add real specs (see tasks.md).
    passWithNoTests: true,
    environment: 'node',
  },
});
