import { defineConfig } from 'astro/config';

export default defineConfig({
  // Production hostname not yet provisioned — confirm before public
  // announcement. Astro never validates that `site` resolves.
  site: 'https://ordenanzas.fragua.dev',
  output: 'static',

  // The @astrojs/sitemap integration is deliberately NOT enabled yet.
  // It crashes during `astro:build:done` when the site has zero routes
  // (`Cannot read properties of undefined (reading 'reduce')`), and this
  // slice intentionally ships no pages. It is enabled in slice 4a,
  // together with the first real pages — which is the only point at which
  // a sitemap has anything to describe. `site` above is already set, so
  // enabling it later is a one-line change.
  integrations: [],
});
