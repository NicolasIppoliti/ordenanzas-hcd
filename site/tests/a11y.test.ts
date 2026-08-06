// Task 4a.11: axe-core + happy-dom over five page shapes — index, browse,
// detail-with-title, detail-null-title, detail-convenio.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import axe from 'axe-core';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import { OFF_CANVAS, ruleBodies, ruleBody, withoutComments } from './helpers/css';
import IndexPage from '../src/pages/index.astro';
import DetailPage from '../src/pages/documento/[doc_id].astro';
import DesignSystemPage from '../src/pages/design-system.astro';
import DocumentosPage from '../src/pages/documentos.astro';
import type { ManifestDocument } from '../src/lib/contract';

function baseDoc(overrides: Partial<ManifestDocument> & { doc_id: string }): ManifestDocument {
  return {
    number: null,
    number_variants: [],
    doc_type: 'ordenanza',
    expediente: null,
    year: null,
    title: null,
    title_source: 'none',
    anchor_text: '',
    source_url: 'https://hcdrosales.gob.ar/x.pdf',
    source_filename: 'x.pdf',
    sha256: 'abc',
    bytes: 100,
    fetched_at: '2026-08-05T00:00:00Z',
    status: 'ok',
    text_path: null,
    cross_references: [],
    notes: '',
    last_error: null,
    last_error_at: null,
    ...overrides,
  };
}

/** Full axe results plus the language the audited root actually carried, so a
 *  test can assert what the audit saw rather than what the string said. */
async function auditDetails(
  html: string
): Promise<{ violations: axe.Result[]; passes: axe.Result[]; lang: string | null }> {
  // GlobalRegistrator installs a full window/document/navigator global set
  // that axe-core's environment detection recognises — plain `new Window()`
  // does not register enough of the global surface for axe to run.
  GlobalRegistrator.register({ url: 'https://ordenanzas.fragua.dev/' });
  try {
    document.documentElement.innerHTML = html.replace(/^<!doctype html>\s*/i, '');
    // Passing `document` itself leaves axe's internal environment detection
    // unable to deduce globals (a Document has no `ownerDocument`); its
    // root element does, which is what axe's setupGlobals actually checks.
    const results = await axe.run(document.documentElement, {
      // The conformance levels these tests claim in their names. `wcag2a` and
      // `wcag2aa` are axe's tags for WCAG 2.0: without the 2.1 pair, every rule
      // that version added — `avoid-inline-spacing`, `autocomplete-valid`, the
      // target-size rules — simply never ran, while six test names asserted
      // "no WCAG 2.1 AA violations". A level nobody checked.
      //
      // This is a conformance filter, not a fragment-suitability one: rules that
      // need real layout, `color-contrast` among them, live inside `wcag2aa` and
      // do run here against a DOM that computes none. `palette.test.ts` is what
      // actually measures contrast, from the token file.
      runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    });
    return {
      violations: results.violations,
      passes: results.passes,
      lang: document.documentElement.getAttribute('lang'),
    };
  } finally {
    await GlobalRegistrator.unregister();
  }
}

async function auditHtml(html: string): Promise<axe.Result[]> {
  return (await auditDetails(html)).violations;
}

describe('accessibility (axe-core)', () => {
  it('audits a root that still carries the language', async () => {
    // The harness assigns the rendered document as `documentElement.innerHTML`,
    // and the page-level rules — `html-has-lang` among them — only mean anything
    // if `lang` survives that. Measured: it does, and `html-has-lang` is in
    // axe's passes. Asserted here so it stays a fact rather than a memory, since
    // nothing else on the site measures it.
    const container = await AstroContainer.create();
    const html = await container.renderToString(IndexPage);
    const audit = await auditDetails(html);

    // Read out of the audited DOM, not out of the string: the harness assigns
    // the rendered document as `documentElement.innerHTML`, and the question is
    // whether `lang` survives that — which is what every page-level rule
    // depends on.
    expect(audit.lang, 'the audited root lost its language').toBe('es');
    expect(audit.passes.map((rule) => rule.id)).toContain('html-has-lang');
  });


  it('index page has no WCAG 2.1 AA violations', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(IndexPage);
    const violations = await auditHtml(html);
    expect(violations, JSON.stringify(violations, null, 2)).toHaveLength(0);
  });

  it('browse-by-year page has no WCAG 2.1 AA violations', async () => {
    // The densest page in the archive: 1,038 links, 16 headings and a sticky
    // index. Density is where landmark and heading-order violations hide.
    const container = await AstroContainer.create();
    const html = await container.renderToString(DocumentosPage);
    const violations = await auditHtml(html);
    expect(violations, JSON.stringify(violations, null, 2)).toHaveLength(0);
  });

  it('design-system page has no WCAG 2.1 AA violations', async () => {
    // The system's own reference page is held to the same bar as the archive.
    // A swatch grid and a disabled button are exactly where contrast and name
    // violations hide, and this page is the one place they all appear at once.
    const container = await AstroContainer.create();
    const html = await container.renderToString(DesignSystemPage);
    const violations = await auditHtml(html);
    expect(violations, JSON.stringify(violations, null, 2)).toHaveLength(0);
  });

  it('detail page with a title has no WCAG 2.1 AA violations', async () => {
    const container = await AstroContainer.create();
    const doc = baseDoc({
      doc_id: '4457-Mesa-de-Gestion-del-Agua',
      number: 4457,
      title: 'Mesa de Gestión del Agua',
      title_source: 'listing',
      year: 2026,
    });
    const html = await container.renderToString(DetailPage, { props: { doc } });
    const violations = await auditHtml(html);
    expect(violations, JSON.stringify(violations, null, 2)).toHaveLength(0);
  });

  it('detail page with a null title has no WCAG 2.1 AA violations', async () => {
    const container = await AstroContainer.create();
    const doc = baseDoc({
      doc_id: '4390-I232025',
      number: 4390,
      title: null,
      title_source: 'none',
    });
    const html = await container.renderToString(DetailPage, { props: { doc } });
    const violations = await auditHtml(html);
    expect(violations, JSON.stringify(violations, null, 2)).toHaveLength(0);
  });

  it('detail page for a convenio has no WCAG 2.1 AA violations', async () => {
    const container = await AstroContainer.create();
    const doc = baseDoc({
      doc_id: 'Convenio-Ministerio-de-las-Mujeres',
      number: null,
      doc_type: 'convenio',
      title: 'Ministerio de las Mujeres',
      title_source: 'listing',
    });
    const html = await container.renderToString(DetailPage, { props: { doc } });
    const violations = await auditHtml(html);
    expect(violations, JSON.stringify(violations, null, 2)).toHaveLength(0);
  });
});


describe('nothing is parked off the left edge of the page', () => {
  it('holds for every component, not just the one that broke', () => {
    // The bug was in `Layout.astro`, but a `.visually-hidden { left: -9999px }`
    // anywhere else reintroduces the identical iOS scroll. The name of this
    // block promises the page, so it checks the page.
    // Every `.astro` AND the global stylesheet: Astro scopes component styles,
    // so a shared `.visually-hidden` utility would live in `tokens.css`, which
    // is where this defect is likeliest to come back.
    const dir = join(process.cwd(), 'src');
    const files = (readdirSync(dir, { recursive: true }) as string[]).filter(
      (file) => file.endsWith('.astro') || file.endsWith('.css')
    );
    expect(files.length, 'no components found to sweep').toBeGreaterThan(5);

    for (const file of files) {
      const source = withoutComments(readFileSync(join(dir, file), 'utf-8'));
      // The WHOLE file, not a slice from `<style`: five components carry no
      // style block at all, and `indexOf` returning -1 would have sliced a
      // single stray character and asserted against that. Inline `style="…"`
      // attributes park an element just as well, and they live in the markup.
      expect(source, `${file} parks something off-canvas`).not.toMatch(OFF_CANVAS);
    }
  });

  it('hides the skip link without pushing it off-canvas', () => {
    // `position: absolute; left: -9999px` is the classic way to hide a skip
    // link, and on iOS Safari it makes the page horizontally scrollable: that
    // engine counts overflow to the LEFT of the origin as scrollable area,
    // where Chromium clamps it. A phone could drag the whole layout sideways
    // and read the header cut off at the left edge.
    //
    // Headless Chromium reports no overflow either way, which is exactly why
    // this shipped and why a measurement is not a proof unless it runs on the
    // engine that has the problem. The replacement keeps the element at the
    // origin with no size, which no engine can scroll to.
    const layout = readFileSync(
      join(process.cwd(), 'src', 'components', 'Layout.astro'),
      'utf-8'
    );
    // EVERY rule for the selector, not the first: a declaration reintroduced
    // inside a `@media` block would be invisible to a guard that reads only the
    // base rule.
    const bodies = ruleBodies(withoutComments(layout), '.skip-link');
    expect(bodies.length, 'no .skip-link rule at all').toBeGreaterThan(0);

    // Every spelling, not just `left: -9999px`: any unit, the logical
    // properties a refactor would reach for, and a transform, which moves the
    // paint without moving the box.
    for (const body of bodies) {
      expect(body, 'off-canvas positioning is what caused the scroll').not.toMatch(OFF_CANVAS);
    }
    // Anchored: `toContain('clip-path')` is satisfied by `clip-path: none`,
    // which is the hidden rule not hiding.
    // At least one rule clips, and NONE un-clips. Demanding the clip in every
    // body would redden perfectly good CSS — a second `.skip-link` rule setting
    // only a colour, or a `prefers-reduced-motion` tweak, carries no clip-path
    // and should not have to.
    expect(bodies.some((body) => /clip-path:\s*inset\(/.test(body)), 'nothing clips it').toBe(
      true
    );
    for (const body of bodies) {
      expect(body, 'a rule un-hides the link').not.toMatch(/(?:^|[\s;{])clip-path:\s*none/);
    }

    // Nothing of it may paint while hidden: padding and a border still draw
    // around a 1px content box, and the link would sit as a small bordered
    // artefact in the corner of all 1,043 pages.
    // Anchored: `toContain('padding: 0')` is satisfied by `padding: 0.5rem`,
    // so the guard whose whole job is "nothing paints while hidden" would stay
    // green while the artefact shipped.
    // Over every rule, like the off-canvas check: a `@media` block that gave
    // the hidden link back its padding and border would ship the artefact with
    // this green.
    for (const body of bodies) {
      // Stated positively rather than as a negative pattern: `/padding:\s*[^0]/`
      // reads as "padding that is not zero" and matches `padding: 0`, because
      // `\s*` can match nothing and let `[^0]` eat the space.
      // Every longhand too: `padding-top`, `border-width` and
      // `border-bottom` all paint, and a guard that knows only the two
      // shorthands says "nothing paints" while the artefact ships. Anchored, so
      // `scroll-padding` does not answer for `padding`. Zero in any spelling —
      // `0`, `0px`, `0 0`, `0 none` — because pinning one is the over-rejection
      // this project keeps having to undo.
      // `border-radius`, `border-collapse` and `border-spacing` draw nothing on
      // their own — a radius on a clipped 1px box is invisible — so they are not
      // in the list. What paints is a width, a style or a colour.
      const paints = [
        ...body.matchAll(
          /(?:^|[\s;{])((?:padding[\w-]*|border(?!-radius|-collapse|-spacing|-image)[\w-]*))\s*:\s*([^;}]+)/g
        ),
      ];
      for (const [, property, value] of paints) {
        const isZero = (value ?? '')
          .trim()
          .split(/\s+/)
          .every((token) => /^0(px|rem|em|%)?$/.test(token) || token === 'none');
        expect(isZero, `the hidden link would paint its ${property}: ${value}`).toBe(true);
      }
    }

    // And it must still become visible on focus, with the box back: a skip link
    // nobody can see is a skip link that is not there.
    const focused = ruleBody(withoutComments(layout), '.skip-link:focus');
    // A pattern, not a literal: `clip-path:none` is what a minifier emits, and
    // `-webkit-clip-path: none` would satisfy a substring check while leaving
    // the standard property untouched.
    expect(focused).toMatch(/(?:^|[\s;{])clip-path:\s*none/);
    expect(focused).toMatch(/padding:\s*var/);
    expect(focused).toMatch(/border:\s*2px/);
  });
});
