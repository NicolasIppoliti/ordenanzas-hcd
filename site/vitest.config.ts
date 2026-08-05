import { getViteConfig } from 'astro/config';

// getViteConfig (not plain vitest defineConfig) wires in the Astro Vite
// plugin, which is required from 4a onward: tests render .astro components
// via astro/container (aliases.test.ts, a11y.test.ts).
export default getViteConfig({
  test: {
    // Phase 1 ships no product code yet — an empty suite is expected and
    // must still exit 0. Later phases add real specs (see tasks.md).
    passWithNoTests: true,
    environment: 'node',
  },
});
