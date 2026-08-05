// Two-language contract (task 3.9): validates the SAME committed fixtures
// pytest validates (`fixtures/contract-*.json`, repo root) against
// `assertManifest`/`assertAliases`. Both sides must agree or CI fails.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { assertAliases, assertManifest } from '../src/lib/contract';

const fixturesDir = fileURLToPath(new URL('../../fixtures/', import.meta.url));

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(`${fixturesDir}${name}`, 'utf-8'));
}

describe('assertManifest', () => {
  it('accepts the committed contract-manifest.json fixture', () => {
    const manifest = assertManifest(loadFixture('contract-manifest.json'));
    expect(manifest.documents).toHaveLength(3);
    expect(manifest.documents[0]?.doc_id).toBe('4457-Mesa-de-Gestion-del-Agua');
  });

  it('rejects an unknown status', () => {
    const raw = loadFixture('contract-manifest.json') as {
      documents: Array<Record<string, unknown>>;
    };
    raw.documents[0]!.status = 'not_a_real_status';
    expect(() => assertManifest(raw)).toThrow();
  });

  it('rejects a cross-reference carrying a doc_id (D5: number-only evidence)', () => {
    const raw = loadFixture('contract-manifest.json') as {
      documents: Array<{ cross_references: Array<Record<string, unknown>> }>;
    };
    raw.documents[0]!.cross_references[0]!.doc_id = 'some-doc';
    expect(() => assertManifest(raw)).toThrow();
  });

  it('rejects a non-object input', () => {
    expect(() => assertManifest(null)).toThrow();
    expect(() => assertManifest('not a manifest')).toThrow();
  });
});

describe('assertAliases', () => {
  it('accepts the committed contract-aliases.json fixture', () => {
    const aliases = assertAliases(loadFixture('contract-aliases.json'));
    expect(aliases.aliases).toHaveLength(1);
    expect(aliases.aliases[0]?.alias).toBe('3298');
    expect(aliases.aliases[0]?.target).toBe('3298--2021-11');
  });

  it('rejects an alias missing its target', () => {
    const raw = loadFixture('contract-aliases.json') as {
      aliases: Array<Record<string, unknown>>;
    };
    delete raw.aliases[0]!.target;
    expect(() => assertAliases(raw)).toThrow();
  });
});
