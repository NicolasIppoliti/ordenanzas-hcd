import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // Production hostname not yet provisioned — confirm before public
  // announcement. Astro never validates that `site` resolves.
  site: 'https://ordenanzas.fragua.dev',
  output: 'static',

  // @astrojs/sitemap crashes during `astro:build:done` on a zero-route
  // build (`Cannot read properties of undefined (reading 'reduce')`).
  // Slice 4a is the first slice with real pages, so it is enabled here
  // (task 4a.13).
  integrations: [sitemap()],
});
