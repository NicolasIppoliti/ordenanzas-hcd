// Astro's real component types are available to `astro check`'s own
// language-service pass (which resolves `.astro` imports correctly, and
// is what already type-checks these components). The bare `tsc --noEmit`
// pass in the `check` script has no such resolver, so give it a minimal
// ambient fallback for the `.astro` component imports the a11y/alias
// tests exercise via astro/container.
declare module '*.astro' {
  import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
  const Component: AstroComponentFactory;
  export default Component;
}
