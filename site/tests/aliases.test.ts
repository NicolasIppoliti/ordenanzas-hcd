// Task 4a.9 / 4a.10: alias resolution and the redirect page it drives (D11).
import { describe, expect, it } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { resolveAliases } from '../src/lib/aliases';
import AliasRedirectPage from '../src/pages/d/[alias].astro';
import type { Alias, AliasMap, ManifestDocument } from '../src/lib/contract';

function doc(doc_id: string): ManifestDocument {
  return {
    doc_id,
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
    sha256: null,
    bytes: null,
    fetched_at: null,
    status: 'ok',
    text_path: null,
    cross_references: [],
    notes: '',
    last_error: null,
    last_error_at: null,
  };
}

function aliasMap(aliases: Alias[]): AliasMap {
  return { schema_version: 1, generated_at: '2026-08-05T00:00:00Z', aliases };
}

describe('resolveAliases', () => {
  it('resolves an alias whose target exists in the manifest', () => {
    const map = aliasMap([
      { alias: '3298', target: '3298--2021-11', created_at: '2026-08-05T00:00:00Z', reason: 'doc_id_collision' },
    ]);
    const documents = [doc('3298--2021-11')];
    expect(resolveAliases(map, documents)).toEqual(map.aliases);
  });

  it('fails loudly, naming the alias and its missing target, when the target is absent from the manifest', () => {
    const map = aliasMap([
      { alias: '3298', target: '3298--2021-99', created_at: '2026-08-05T00:00:00Z', reason: 'doc_id_collision' },
    ]);
    expect(() => resolveAliases(map, [])).toThrowError(/3298.*3298--2021-99/s);
  });

  it('never skips a broken alias silently — every alias is checked', () => {
    const map = aliasMap([
      { alias: '3298', target: '3298--2021-11', created_at: '2026-08-05T00:00:00Z', reason: 'x' },
      { alias: '3299', target: 'missing-target', created_at: '2026-08-05T00:00:00Z', reason: 'x' },
    ]);
    expect(() => resolveAliases(map, [doc('3298--2021-11')])).toThrow();
  });
});

describe('d/[alias].astro redirect page', () => {
  it('carries the refresh meta, canonical link and visible fallback for a resolved alias', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(AliasRedirectPage, {
      props: {
        alias: { alias: '3298', target: '3298--2021-11', created_at: '2026-08-05T00:00:00Z', reason: 'doc_id_collision' },
      },
    });

    expect(html).toContain('http-equiv="refresh"');
    expect(html).toContain('url=/documento/3298--2021-11');
    expect(html).toContain('rel="canonical"');
    expect(html).toContain('/documento/3298--2021-11');
    expect(html).toContain('Este documento ahora está en otra dirección.');
    expect(html).toContain('data-pagefind-ignore');
  });
});
