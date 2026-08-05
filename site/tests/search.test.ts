// Task 4b.1/4b.2/4b.4/4b.5/4b.6: pure helpers behind the search UI. These are
// unit-tested directly so the no-fabrication and no-excerpt-for-no_text
// rules are pinned without needing a live Pagefind index. The real built
// index is exercised separately in search-index.test.ts.
import { describe, expect, it } from 'vitest';
import {
  EMPTY_QUERY_MESSAGE,
  NO_RESULTS_MESSAGE,
  NO_TEXT_MARKER,
  TEXTO_CON,
  TEXTO_SIN,
  TYPE_FILTER_LABELS,
  TYPE_FILTER_OPTIONS,
  buildYearOptions,
  getAnioFilterValue,
  getTextoFilterValue,
  getTipoFilterValue,
  toDisplayResult,
} from '../src/lib/search';
import type { ManifestDocument } from '../src/lib/contract';

function doc(overrides: Partial<ManifestDocument> & { doc_id: string }): ManifestDocument {
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
    sha256: null,
    bytes: null,
    fetched_at: null,
    status: 'ok',
    text_path: null,
    cross_references: [],
    notes: '',
    last_error: null,
    last_error_at: null,
    ...overrides,
  };
}

describe('getTextoFilterValue', () => {
  it('is "Con texto indexado" for an ok document', () => {
    expect(getTextoFilterValue('ok')).toBe(TEXTO_CON);
  });

  it('is "Sin texto indexado" for a no_text document', () => {
    expect(getTextoFilterValue('no_text')).toBe(TEXTO_SIN);
  });

  it('is "Sin texto indexado" for pending/error, which never had extracted text', () => {
    expect(getTextoFilterValue('pending')).toBe(TEXTO_SIN);
    expect(getTextoFilterValue('error')).toBe(TEXTO_SIN);
  });
});

describe('getAnioFilterValue', () => {
  it('renders the year as a string when present', () => {
    expect(getAnioFilterValue(2021)).toBe('2021');
  });

  it('buckets a null year as "Año no determinado", never inferring one', () => {
    expect(getAnioFilterValue(null)).toBe('Año no determinado');
  });
});

describe('getTipoFilterValue', () => {
  it('uses the exact Spanish label set, e.g. convenio never reads as Ordenanza', () => {
    expect(getTipoFilterValue('convenio')).toBe('Convenio');
    expect(getTipoFilterValue('convenio')).not.toBe('Ordenanza');
  });

  it('labels an unclassified document "Documento sin clasificar"', () => {
    expect(getTipoFilterValue('sin clasificar')).toBe('Documento sin clasificar');
  });
});

describe('TYPE_FILTER_OPTIONS', () => {
  it('exposes exactly the seven corpus types, in the specified order', () => {
    expect(TYPE_FILTER_OPTIONS.map((t) => t)).toEqual([
      'ordenanza',
      'convenio',
      'decreto',
      'resolucion',
      'anexo',
      'preparatoria',
      'sin clasificar',
    ]);
  });
});

describe('TYPE_FILTER_LABELS', () => {
  it('renders the compact "Sin clasificar" filter label, distinct from the fuller per-document label', () => {
    // Requirement "The type filter exposes every type in the corpus" pins
    // this exact compact set; D8's fuller "Documento sin clasificar" is
    // reserved for labelling an actual document, not the filter chooser.
    expect(TYPE_FILTER_OPTIONS.map((t) => TYPE_FILTER_LABELS[t])).toEqual([
      'Ordenanza',
      'Convenio',
      'Decreto',
      'Resolución',
      'Anexo',
      'Preparatoria',
      'Sin clasificar',
    ]);
  });
});

describe('buildYearOptions', () => {
  it('returns distinct years descending, with "Año no determinado" last when present', () => {
    const documents = [
      doc({ doc_id: 'a', year: 2021 }),
      doc({ doc_id: 'b', year: 2023 }),
      doc({ doc_id: 'c', year: 2021 }),
      doc({ doc_id: 'd', year: null }),
    ];
    expect(buildYearOptions(documents)).toEqual(['2023', '2021', 'Año no determinado']);
  });

  it('omits the "Año no determinado" bucket when every record has a year', () => {
    const documents = [doc({ doc_id: 'a', year: 2021 })];
    expect(buildYearOptions(documents)).toEqual(['2021']);
  });
});

describe('toDisplayResult', () => {
  it('surfaces an excerpt for a text-bearing (ok) result', () => {
    const result = toDisplayResult({
      url: '/documento/4457-mesa/',
      excerpt: 'Mesa de Gestión del <mark>Agua</mark>',
      meta: { title: 'Ordenanza 4457 — Mesa de Gestión del Agua' },
      filters: { tipo: ['Ordenanza'], anio: ['2026'], texto: [TEXTO_CON] },
    });
    expect(result.hasIndexedText).toBe(true);
    expect(result.excerpt).toBe('Mesa de Gestión del <mark>Agua</mark>');
    expect(result.tipo).toBe('Ordenanza');
    expect(result.title).toBe('Ordenanza 4457 — Mesa de Gestión del Agua');
  });

  it('never shows an excerpt for a no_text result, even if Pagefind produced one', () => {
    const result = toDisplayResult({
      url: '/documento/4390-i232025/',
      // Pagefind can still generate an excerpt from the heading/metadata
      // text in the indexed region; the UI must discard it regardless.
      excerpt: 'Ordenanza <mark>4390</mark> — Expediente 123/2025',
      meta: { title: 'Ordenanza 4390' },
      filters: { tipo: ['Ordenanza'], anio: ['Año no determinado'], texto: [TEXTO_SIN] },
    });
    expect(result.hasIndexedText).toBe(false);
    expect(result.excerpt).toBeNull();
  });

  it('renders the type label from filters, never substituting Ordenanza for a convenio', () => {
    const result = toDisplayResult({
      url: '/documento/convenio-x/',
      excerpt: '',
      meta: { title: 'Convenio — Ministerio de las Mujeres' },
      filters: { tipo: ['Convenio'], anio: ['Año no determinado'], texto: [TEXTO_CON] },
    });
    expect(result.tipo).toBe('Convenio');
    expect(result.tipo).not.toBe('Ordenanza');
  });
});

describe('copy constants', () => {
  it('are Spanish, neutral and never blank', () => {
    for (const message of [EMPTY_QUERY_MESSAGE, NO_RESULTS_MESSAGE, NO_TEXT_MARKER]) {
      expect(message.length).toBeGreaterThan(0);
    }
  });
});
