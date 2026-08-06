// The home page's composition, which is the one layer DESIGN.md's five gap
// items never touched. The site got new type and new colour on the same austere
// structure, and the owner read the result — correctly — as unfinished.
//
// Three defects drove this:
//
// 1. `.doc-list` was a class no stylesheet defined, so the recent documents
//    rendered with the browser's default bullets. Literally unstyled HTML.
// 2. Four entry points competed above the fold — the search band, a link to
//    /buscar, a link to /documentos, and the nav's own — two of them to the
//    same destination.
// 3. The copy described the system rather than the reader's problem, and the
//    excerpts dumped uppercase legal text nobody can scan.
//
// The tone is a separate decision from the structure, and it has a hard limit:
// this archive is unofficial and survives because the HCD tolerates it. Copy may
// speak plainly to a resident and may use any measured fact about the SITE, but
// it may never point at the source — "stop fighting with loose PDFs" has a
// villain, and the only villain available is the body that publishes them.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { markupBetween, ruleBody } from './helpers/css';
import IndexPage from '../src/pages/index.astro';
import { getDocuments } from '../src/lib/data';
import { homeHighlights } from '../src/lib/highlights';

const { shortcuts } = homeHighlights();

const html = await (await AstroContainer.create()).renderToString(IndexPage);
const main = markupBetween(html, '<main', '</main>');

/** Every year-strip row, as anchor id -> the count it actually renders.
 *
 * Scoped to the strip's own markup, not to <main>: the fact cards link to
 * `/documentos#anio-…` too, and a lazy match across the whole page would start
 * reading their numbers the day any `class="count"` appears below them. The
 * assertion would keep passing while measuring another component. */
const yearStripMarkup = (() => {
  return markupBetween(main, 'year-strip', '</ul>');
})();
const rows = new Map<string, number>(
  [...yearStripMarkup.matchAll(/href="\/documentos#(anio-[a-z0-9-]+)"(?:(?!<\/li>)[\s\S])*?class="count"[^>]*>(\d+)</g)].map(
    (match) => [match[1] ?? '', Number(match[2])]
  )
);


describe('one way in', () => {
  it('offers a single search entry above the recent documents', () => {
    // The header band is the search. A second "Buscar en 1.038 documentos" link
    // under it asks the reader to choose between two doors to the same room.
    const beforeList = markupBetween(main, '<main', 'doc-list');
    expect(beforeList.match(/href="\/buscar"/g) ?? []).toHaveLength(0);
  });

  it('does not repeat the browse link inside the page body', () => {
    // It appeared twice: in the nav and again as a paragraph under the strip.
    // Counting inside <main> could never see the nav — which sits above it — so
    // the guard passed while the duplicate shipped.
    //
    // The header itself now carries the link twice by design: a row on a wide
    // screen and a `<details>` menu on a phone, with CSS showing exactly one.
    // What must not come back is a third copy in the body.
    expect(main.match(/href="\/documentos"/g) ?? []).toHaveLength(0);
    const header = markupBetween(html, '<header', '</header>');
    expect(header.match(/href="\/documentos"/g) ?? [], 'the two presentations').toHaveLength(2);
    // The strip's own rows are not duplicates: each goes to one year's anchor.
    expect((main.match(/href="\/documentos#anio-/g) ?? []).length).toBeGreaterThan(10);
  });
});

describe('the recent documents are styled, not just marked up', () => {
  it('defines every class it uses, in the component that uses it', () => {
    // `.doc-list` was used and never defined — the defect that made the page
    // look unfinished. Astro scopes styles per component, so a rule and its
    // element must live in the same file or the shipped selector matches
    // nothing; that has already cost this project one silent regression.
    const card = readFileSync(join(process.cwd(), 'src', 'components', 'DocCard.astro'), 'utf-8');
    const page = readFileSync(join(process.cwd(), 'src', 'pages', 'index.astro'), 'utf-8');

    expect(page, '.doc-list is used in index.astro').toContain('class="doc-list"');
    expect(page, '.doc-list must be defined where it is used').toMatch(/\.doc-list\s*\{/);
    expect(card).toContain('class="doc-card"');
    expect(card, '.doc-card must be defined where it is used').toMatch(/\.doc-card\s*\{/);
  });

  it('removes the browser default bullets', () => {
    const page = readFileSync(join(process.cwd(), 'src', 'pages', 'index.astro'), 'utf-8');
    expect(ruleBody(page, '.doc-list')).toContain('list-style: none');
  });

  it('gives the ordinance number its own column, as the detail page does', () => {
    // The number is the identifier a reader arrives with. Hanging it in a
    // tabular column is what lets someone scan 4449 against 4454 at a glance —
    // the same treatment the article renderer already uses.
    const card = readFileSync(join(process.cwd(), 'src', 'components', 'DocCard.astro'), 'utf-8');
    // The column, not just the figures: `tabular-nums` anywhere in the file
    // stayed green with the grid deleted, and a number reflowed inline is the
    // defect this test was written against.
    // Matched as a pattern, like the two assertions above: `indexOf` on a
    // literal demands exactly one space, and on `.doc-card{` it returns -1,
    // which slices to the last character and reports a missing grid where the
    // selector is what moved.
    expect(ruleBody(card, '.doc-card')).toContain('grid-template-columns');
    expect(card).toContain('tabular-nums');
  });

  it('drops the body-text excerpt from the list', () => {
    // The excerpts were uppercase municipal letterhead — the same 30 words on
    // every card, carrying nothing a reader can act on.
    expect(main).not.toContain('class="excerpt"');
  });
});

describe('the year strip states what is in the archive', () => {
  it('shows every year with its measured count', () => {
    // Read the counts OUT of the rows rather than asking whether the number
    // appears somewhere in the strip: the container render stamps
    // `data-astro-source-loc` on every element, so the markup is full of stray
    // digits and `toContain('108')` was true no matter what rendered. Blanking
    // every count still left that assertion green.
    const documents = getDocuments();
    expect(documents.length).toBe(1038);
    expect(rows.size, 'one row per year plus the undated group').toBe(16);

    expect(rows.get('anio-2026')).toBe(9);
    expect(rows.get('anio-2021'), '2021 is the fullest year').toBe(108);
    expect(rows.get('anio-2002')).toBe(1);
    expect([...rows.values()].reduce((a, b) => a + b, 0)).toBe(1038);
  });

  it('gives the undated documents the same weight as any year', () => {
    // 223 of 1,038 — the LARGEST group in the archive, twice the fullest year
    // (2021, at 108). D10 forbids inferring a year, so hiding them would be the
    // only alternative, and that would misstate what the archive holds.
    expect(rows.get('anio-sin-determinar')).toBe(223);
  });

  it('keeps a one-document year visible', () => {
    // 2002 and 2012 hold one each. At true proportion that bar is under a pixel
    // and reads as zero — a different claim from "one". The rule floors it.
    const component = readFileSync(
      join(process.cwd(), 'src', 'components', 'YearStrip.astro'),
      'utf-8'
    );
    expect(ruleBody(component, '.fill')).toContain('min-width');
  });

  it('fits the undated label on one line', () => {
    // "Año no determinado" wrapped to two lines in the label column and threw
    // the row out of alignment. The destination heading still carries it in
    // full; this is the compact index.
    expect(yearStripMarkup).toContain('Sin año');
  });

  it('draws the bars with no script and no image', () => {
    // The bars are proportion, and proportion is a fact here. They are inline
    // widths on a CSS rule — this page ships zero JavaScript and no assets.
    expect(html).not.toContain('<script src');
    expect(main).toMatch(/width:\s*\d+(\.\d+)?%/);
  });
});

describe('"lo último" is actually the latest', () => {
  it('shows the highest numbers of the most recent year, not the first eight alphabetically', () => {
    // 2026 holds nine records and this list shows eight, so the tiebreak inside
    // a year decides which one is dropped. Ordering by doc_id dropped 4457 — the
    // highest number in the archive — from a section headed "lo último".
    const numbers = [...main.matchAll(/class="doc-num"[^>]*>(\d+)</g)].map((m) => Number(m[1]));

    expect(numbers).toHaveLength(8);
    expect(numbers[0], 'the newest record must lead the list').toBe(4457);
    expect(numbers, 'descending, so the newest is always first').toEqual(
      [...numbers].sort((a, b) => b - a)
    );
  });

  it('claims no legislative act over a list that does not filter by type', () => {
    // The archive holds 28 convenios, 8 anexos, a resolución and a decreto. A
    // convenio is signed and a decreto is dictado — neither is sanctioned by the
    // Concejo. Today every record in the top eight happens to be an ordenanza,
    // which is exactly why a heading that asserts the act would go unnoticed
    // until the first one that is not.
    expect(markupBetween(main, 'id="ultimos"', '</h2>').toLowerCase()).not.toContain('sancion');
    // Every row carries its own type label, so a mixed list stays truthful.
    expect(main).toContain('class="doc-meta"');
    expect(main).toContain('Ordenanza ·');
  });
});

describe('the landing surfaces', () => {
  it('puts the search in the hero, not in a strip above it', () => {
    // The home is the one page where search is the whole point, so it gets a
    // field a reader cannot miss. The header band hides itself here rather than
    // duplicating the `q` id its label points at.
    const hero = markupBetween(main, '<h1', '</form>');
    expect(hero).toContain('name="q"');
    expect(html.match(/name="q"/g) ?? [], 'exactly one search field on the page').toHaveLength(1);
    expect(main).toContain('action="/buscar"');
  });

  it('offers each shortcut as a search, never as a category', () => {
    // "Documentos que mencionan obras" is a count. "Ordenanzas de obras" would
    // be a classification nobody made — the same fabrication as an invented
    // title. The wording is the whole safeguard, so it is pinned.
    expect(main).toContain('mencionan');
    expect(main.toLowerCase()).not.toMatch(/ordenanzas de (obras|salud|tránsito)/);

    // Read each chip's count out of its own anchor and compare it to the
    // measured value. Asking whether the number appears somewhere on the page
    // would be answered by the year strip, the stats band or a doc_id.
    // Scoped to the chip list, for the same reason the year-strip map is: a
    // lazy match across <main> would start reading another component's
    // `class="count"` the day a chip lost its own.
    const list = markupBetween(main, 'class="shortcuts"', '</ul>');
    const rendered = new Map(
      [...list.matchAll(/href="\/buscar\?q=([^"]+)"(?:(?!<\/li>)[\s\S])*?class="count"[^>]*>(\d+)</g)].map(
        (match) => [decodeURIComponent(match[1] ?? ''), Number(match[2])]
      )
    );
    expect(rendered.size, 'one chip per shortcut').toBe(shortcuts.length);
    for (const { query, count } of shortcuts) {
      expect(rendered.get(query), `${query} chip shows the wrong count`).toBe(count);
    }
  });

  it('states only figures it measured', () => {
    // Every number in the band comes from the corpus, so none of them can go
    // stale the week the archive grows.
    const head = markupBetween(main, 'class="stats"', '</section>');

    expect(head).toContain('1.038');
    expect(head).toContain('894');
    expect(head).toContain('2002');
    expect(head).toContain('2026');
  });

  it('opens the archive with facts, not with a chosen document', () => {
    // The cards are counts and measured extremes. Featuring one ordinance would
    // be an editorial layer, which this project does not have.
    expect(main).toContain('207 páginas');
    expect(main).toContain('/documento/4270-D-138-2023-Fiscal-e-Impositiva-2024');
    // Scoped to the card: `108` also renders in the year strip, so an unscoped
    // check stays green with the card blanked — the shape this file warns about
    // twice already.
    expect(
      markupBetween(main, 'class="facts"', '</ul>'),
      'the fullest year, counted'
    ).toContain('108');
  });

  it('ships no JavaScript for any of it', () => {
    // The bars, the chips and the cards are CSS and links. The only script on
    // the site is the 268-byte staleness notice.
    expect((html.match(/<script/g) ?? []).length).toBe(1);
  });
});

describe('the copy speaks to a resident without pointing at the source', () => {
  it('opens by naming the archive, with the search immediately under it', () => {
    // The headline says what is here; the field and its button say what to do.
    // Splitting them that way is what lets the h1 stay short enough to read at
    // 40px on a phone.
    const h1 = markupBetween(main, '<h1', '</h1>');
    expect(h1).toContain('1.038 documentos del Concejo Deliberante');
    expect(main.indexOf('name="q"'), 'the field follows the headline').toBeGreaterThan(
      main.indexOf('</h1>')
    );
  });

  it('never criticises the body that publishes the documents', () => {
    // Politeness toward the source is a written non-negotiable, and it is also
    // the commercial reality: the HCD is the client Fragua wants, and this site
    // is unofficial. Any sentence whose energy comes from an enemy is out.
    for (const phrase of ['pelearte', 'dejá de', 'por fin', 'caos', 'desorden', 'imposible de']) {
      expect(main.toLowerCase(), `copy points at the source: "${phrase}"`).not.toContain(phrase);
    }
  });

  it('claims nothing it has not measured', () => {
    // No speed promise, no superlative, no ranking. Every number on the page is
    // a count from the manifest.
    // Including claims of completeness: this archive holds what the HCD
    // publishes, which is not every norm in the district, and the sync is
    // weekly so the set is up to seven days behind by construction. The
    // headline said "toda la normativa de Coronel Rosales" and this guard was
    // the reason it survived — it blocklisted superlatives and never scope.
    for (const phrase of [
      'segundos',
      'el mejor',
      'la mejor',
      'más rápido',
      'al instante',
      'toda la normativa',
      'todas las normas',
      'siempre actualizado',
    ]) {
      expect(main.toLowerCase(), `unmeasured claim: "${phrase}"`).not.toContain(phrase);
    }
  });

  it('states the facts that are true and verifiable', () => {
    expect(main).toContain('1.038');
    // Case-insensitive: the word opens a sentence now, and the claim is the
    // word, not its capitalisation.
    expect(main.toLowerCase()).toContain('gratis');
  });

  it('counts documentos, never ordenanzas (D12)', () => {
    // Seven document types are in here and 51 records carry no number, so
    // attaching 1.038 to "ordenanzas" would claim something the manifest does
    // not support. The h1 may say "ordenanza" because it is an action, not a
    // count.
    expect(main).toContain('1.038 documentos');
    expect(main).not.toMatch(/1\.038\s+ordenanzas/);
  });
});

describe('the one figure the manifest cannot answer', () => {
  it('says "Semanal" only while the workflow actually runs weekly', () => {
    // Three cells of the numbers band come from `corpusStats`. This one comes
    // from the sync workflow's cron, and nothing tied the two: changing the
    // schedule would have left the home page stating a cadence that no longer
    // exists — the same shape as the four stale hand-typed figures this project
    // has already shipped.
    const workflow = readFileSync(
      join(process.cwd(), '..', '.github', 'workflows', 'sync-and-deploy.yml'),
      'utf-8'
    );
    // EVERY cron, not the first: GitHub accepts a list under `schedule:`, and a
    // second daily entry would leave this guard green on the weekly one while
    // the page kept claiming a cadence that no longer describes the workflow.
    const crons = [...workflow.matchAll(/cron:\s*["']([^"']+)["']/g)].map((m) => m[1] ?? '');
    expect(crons, 'no cron in the sync workflow').not.toEqual([]);
    expect(crons, 'more than one schedule; "Semanal" describes only one').toHaveLength(1);

    const cron = crons[0] ?? '';
    const [minute, hour, dayOfMonth, month, dayOfWeek] = cron.split(/\s+/);
    expect(main, 'the band claims a weekly cadence').toContain('Semanal');
    // Weekly means: a fixed day of the week, every month, every day-of-month.
    expect(dayOfMonth).toBe('*');
    expect(month).toBe('*');
    // Cron accepts 0-7 for the day of the week — 0 and 7 both mean Sunday — and
    // the three-letter names. A guard that only knew 0-6 would have failed a
    // schedule that is perfectly weekly, which is the shape of the four rules
    // this project has already had to loosen after they rejected real data.
    expect(
      dayOfWeek,
      `runs on "${dayOfWeek}", which is not a single weekday`
    ).toMatch(/^([0-7]|MON|TUE|WED|THU|FRI|SAT|SUN)$/i);
    expect(minute).toMatch(/^\d+$/);
    expect(hour).toMatch(/^\d+$/);
  });
});

describe('the chip word and its count are two things', () => {
  it('separates them, since the markup does not', () => {
    // Astro drops the whitespace between `{shortcut.term}` and the count span,
    // so the chips shipped reading "salud163". No rendering test can see that —
    // the two nodes are there either way — so the gap is asserted at source.
    const hero = readFileSync(
      join(process.cwd(), 'src', 'components', 'SearchHero.astro'),
      'utf-8'
    );
    expect(ruleBody(hero, '.shortcuts a')).toContain('gap:');
  });
});

describe('the two surfaces the owner saw break', () => {
  it('gives the numbers band padding on both axes', () => {
    // It had `padding: 24px 0`, so the first figure started flush against the
    // surface's own edge and read as clipped — which is how it was reported.
    // Source-level: this suite has no layout engine, and the band's rule is
    // scoped so it never reaches the container's output.
    const page = readFileSync(join(process.cwd(), 'src', 'pages', 'index.astro'), 'utf-8');
    const body = ruleBody(page, '.stats');

    // What matters is that the inline axis is not zero, not which spelling gets
    // there. Pinning the symmetric shorthand would have rejected
    // `padding: var(--space-6) var(--space-8)` — two real axes — which is the
    // shape of every hardening rule this project has had to loosen after it
    // rejected something valid.
    // No trailing `;` required: it is optional on the last declaration of a
    // rule, and demanding it would fail on valid CSS — the shape of every
    // hardening rule this project has had to loosen.
    const padding = /padding:\s*([^;}]+)/.exec(body)?.[1]?.trim() ?? '';
    const inline = /padding-inline:\s*([^;}]+)/.exec(body)?.[1]?.trim() ?? '';
    const inlineFromShorthand = padding.split(/\s+/)[1] ?? padding.split(/\s+/)[0] ?? '';

    expect(padding || inline, 'the band has no padding at all').not.toBe('');
    expect(inline || inlineFromShorthand, 'block-only padding is what clipped it').not.toMatch(
      /^0(px|rem|%)?$/
    );
    // Nothing more to assert here: `body` is sliced up to the rule's closing
    // brace, so a pattern anchored on `}` could never match — an assertion that
    // reads as a guard and guards nothing. Block-only padding is already caught
    // above, where the inline axis has to be non-zero.
  });

  it('steps the hero down where 40px stops fitting', () => {
    // At 390px the headline ran to five lines and pushed the search field it
    // exists to introduce below the fold.
    const hero = readFileSync(
      join(process.cwd(), 'src', 'components', 'SearchHero.astro'),
      'utf-8'
    );
    // Scoped to the rule itself, the way the sibling assertions in this file
    // are: an earlier version sliced to `indexOf('.big-search')`, which is -1
    // inside this media query, so the bounds collapsed and it read the whole
    // tail — the exact shape this file warns about twice.
    const query = hero.slice(hero.search(/@media\s*\(max-width:\s*34rem\)/));

    expect(query).toContain('.hero h1');
    expect(ruleBody(query, '.hero h1')).toContain('var(--text-2xl)');
  });
});
