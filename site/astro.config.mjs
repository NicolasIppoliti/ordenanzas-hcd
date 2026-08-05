import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // Production hostname not yet provisioned — confirm before public
  // announcement. Astro never validates that `site` resolves.
  site: 'https://ordenanzas.fragua.dev',
  output: 'static',

  build: {
    // One shared stylesheet instead of the same ~6 KB inlined into all 1,038
    // pages. Astro inlines small stylesheets by default, which is the right
    // default for a landing page and the wrong one for an archive: people here
    // open several documents in a row, and the second one should cost nothing.
    // The trade is one extra request on the first page, against ~6 KB saved on
    // every page after it.
    inlineStylesheets: 'never',
  },

  // @astrojs/sitemap crashes during `astro:build:done` on a zero-route
  // build (`Cannot read properties of undefined (reading 'reduce')`).
  // Slice 4a is the first slice with real pages, so it is enabled here
  // (task 4a.13).
  integrations: [
    sitemap({
      // The design-system reference is for whoever maintains this, not for a
      // resident looking up a regulation.
      filter: (page) => !page.includes('/design-system'),
    }),
  ],
});
