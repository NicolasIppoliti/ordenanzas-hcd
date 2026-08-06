// DESIGN.md implementation gap, item 1: self-host Fraunces + Instrument Sans.
//
// The previous system used `system-ui` as its primary face, which the owner read
// — correctly — as "typography was not considered". Serif is the Argentine
// convention for legal text, and it is most of what makes this look like a
// document archive rather than a dashboard.
//
// Self-hosted rather than served from a third party: a font CDN is a request to
// a domain the archive does not control, on every page, for a site whose whole
// premise is that it costs nothing and depends on nobody.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const FONT_DIR = join(process.cwd(), 'public', 'fonts');
const tokens = readFileSync(join(process.cwd(), 'src', 'styles', 'tokens.css'), 'utf-8');

describe('self-hosted fonts', () => {
  it('ships both families, subset to Latin, within the stated budget', () => {
    // DESIGN.md budgets roughly 45 KB for both, cached once across 1,043 pages.
    // Measured after subsetting to the Latin range and restricting the axes:
    // Fraunces 18,504 bytes, Instrument Sans 28,504 — 47,008 together. The sans
    // carries `tnum`, without which every tabular column on the site is a
    // no-op; it costs 1,352 bytes and the design document asks for it by name.
    const fraunces = statSync(join(FONT_DIR, 'fraunces-latin.woff2')).size;
    const instrument = statSync(join(FONT_DIR, 'instrument-sans-latin.woff2')).size;

    expect(fraunces).toBe(18_504);
    expect(instrument).toBe(28_504);
    expect(fraunces + instrument).toBeLessThanOrEqual(48_000);
  });

  it('ships the OFL licence for each family', () => {
    // Both are OFL-1.1, which requires the licence to travel with the font. The
    // archive asks the HCD to be a good citizen about its documents; it holds
    // itself to the same standard about someone else's typeface.
    for (const file of ['Fraunces-OFL.txt', 'InstrumentSans-OFL.txt']) {
      expect(readFileSync(join(FONT_DIR, file), 'utf-8')).toContain(
        'SIL OPEN FONT LICENSE Version 1.1'
      );
    }
  });

  it('declares both faces against the files it ships', () => {
    expect(tokens).toContain("src: url('/fonts/fraunces-latin.woff2') format('woff2')");
    expect(tokens).toContain("src: url('/fonts/instrument-sans-latin.woff2') format('woff2')");
  });

  it('never blocks text on a font download', () => {
    // `font-display: swap` renders the fallback immediately and swaps when the
    // file lands. A resident on a slow phone reads the ordinance either way —
    // invisible text while a typeface loads would be the whole point inverted.
    expect(tokens.match(/font-display:\s*swap/g)?.length).toBe(2);
  });

  it('uses the shipped families in the type tokens, not system-ui', () => {
    const sans = /--font-sans:\s*([^;]+);/.exec(tokens)?.[1] ?? '';
    const serif = /--font-serif:\s*([^;]+);/.exec(tokens)?.[1] ?? '';

    expect(sans).toContain('Instrument Sans');
    expect(serif).toContain('Fraunces');
    // The fallback matters more than the face: it is what a reader sees for the
    // first paint, and on the 3% of visits where the download fails, forever.
    expect(sans).toContain('system-ui');
    expect(serif).toMatch(/serif/);
  });

  it('states the unicode range it subset to, so the next reader can reproduce it', () => {
    // Latin plus the punctuation the corpus actually uses. Spanish needs the
    // accented vowels, ñ, ¿, ¡, º and ª — every one inside U+0000-00FF.
    expect(tokens).toContain('unicode-range:');
    expect(tokens).toContain('U+0000-00FF');
  });
});

describe('the faces where they are used', () => {
  const layout = readFileSync(
    join(process.cwd(), 'src', 'components', 'Layout.astro'),
    'utf-8'
  );

  it('sets headings in the serif, which is what makes this read as a document', () => {
    // Serif is the Argentine convention for legal text. Every heading on the
    // site is a document title or a section of one.
    const rule = layout.slice(layout.indexOf('      h1,\n      h2,\n      h3 {'));
    expect(rule.slice(0, rule.indexOf('}'))).toContain('var(--font-serif)');
  });

  it('never asks the serif for a weight it does not ship', () => {
    // Only 600 is in the file. Asking for 700 does not fail — the browser
    // synthesises a fake bold by smearing the outlines, which looks exactly as
    // cheap as it sounds, and only on the headings a reader sees first.
    const rule = layout.slice(layout.indexOf('      h1,\n      h2,\n      h3 {'));
    const declared = /font-weight:\s*([^;]+);/.exec(rule.slice(0, rule.indexOf('}')))?.[1];
    expect(declared, 'headings must pin the one weight the file carries').toBe(
      'var(--weight-semibold)'
    );
    expect(tokens).toContain('--weight-semibold: 600;');
  });

  it('preloads both faces, since neither is discoverable until the CSS parses', () => {
    // The browser finds a @font-face only after it has fetched and parsed the
    // stylesheet, so without a preload the swap happens a full round trip late.
    expect(layout).toContain('rel="preload"');
    expect(layout).toContain('/fonts/fraunces-latin.woff2');
    expect(layout).toContain('/fonts/instrument-sans-latin.woff2');
  });
});

describe('the features the type tokens depend on', () => {
  it('does not ask the serif for a feature it has never had', () => {
    // `font-variant-numeric: tabular-nums` does nothing unless the font carries
    // `tnum`. Fraunces carries none — not in the subset, not upstream — so the
    // declaration on a serif element reads as a measured decision and is a
    // no-op. The sans does carry it, but only because the subset was rebuilt to
    // keep it: the first build dropped the feature, and every column on the site
    // had been asking for an alignment that never happened.
    //
    // Verified with fonttools, which is the only thing that can read a compressed
    // woff2's feature table:
    //   fonttools ttx -t GSUB -o - site/public/fonts/instrument-sans-latin.woff2 | grep tnum
    // The 1,352-byte difference between the two subsets is what that feature costs,
    // and the byte counts above are what pin it.
    // Every source file, not a list: the first version of this guard named two
    // and missed `documentos.astro`, whose year headings inherit the serif from
    // Layout's global rule and asked for tabular figures anyway.
    const sources = readdirSync(join(process.cwd(), 'src'), { recursive: true }) as string[];
    const rendered = sources.filter((file) => file.endsWith('.astro'));
    expect(rendered.length, 'no components found to check').toBeGreaterThan(5);

    for (const file of rendered) {
      const source = readFileSync(join(process.cwd(), 'src', file), 'utf-8');
      // Every rule block that sets the serif, and every heading rule — headings
      // are serif site-wide, from Layout's global stylesheet.
      for (const block of source.match(/\{[^{}]*\}/g) ?? []) {
        if (!block.includes('var(--font-serif)')) continue;
        expect(block, `${file} asks the serif for tabular figures`).not.toContain('tabular-nums');
      }
      const headingRules = [...source.matchAll(/h[123][^{]*\{([^{}]*)\}/g)];
      for (const [, block] of headingRules) {
        expect(block ?? '', `${file} asks a heading for tabular figures`).not.toContain(
          'tabular-nums'
        );
      }
    }
  });

  it('keeps tabular figures where columns actually line up', () => {
    // The sans is where DESIGN.md puts data, and these are the surfaces that
    // align numbers in a column.
    for (const file of ['components/YearStrip.astro', 'components/DocCard.astro']) {
      const source = readFileSync(join(process.cwd(), 'src', file), 'utf-8');
      expect(source, `${file} sets no tabular figures`).toContain('tabular-nums');
    }
  });
});
