// Task 4b.3/4b.7: buscar.astro's static shell — labelled input, aria-live
// results container, the exact seven-value type filter, corpus copy, and
// WCAG 2.1 AA (keyboard navigation + visible focus, via axe-core).
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import axe from 'axe-core';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import BuscarPage from '../src/pages/buscar.astro';

async function auditHtml(html: string): Promise<axe.Result[]> {
  GlobalRegistrator.register({ url: 'https://ordenanzas.fragua.dev/buscar' });
  try {
    document.documentElement.innerHTML = html.replace(/^<!doctype html>\s*/i, '');
    const results = await axe.run(document.documentElement, {
      runOnly: ['wcag2a', 'wcag2aa'],
    });
    return results.violations;
  } finally {
    await GlobalRegistrator.unregister();
  }
}

describe('buscar.astro', () => {
  it('has no WCAG 2.1 AA violations', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(BuscarPage);
    const violations = await auditHtml(html);
    expect(violations, JSON.stringify(violations, null, 2)).toHaveLength(0);
  });

  it('renders a real form with a labelled search input', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(BuscarPage);
    expect(html).toMatch(/<form[^>]*>/);
    expect(html).toMatch(/<input[^>]*type="search"[^>]*>/);
    expect(html).toMatch(/<label[^>]*for="q"[^>]*>/);
  });

  it('has an aria-live="polite" results container', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(BuscarPage);
    expect(html).toContain('aria-live="polite"');
  });

  it('exposes exactly the seven document types in the type filter, in order', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(BuscarPage);
    const optionMatches = [...html.matchAll(/<select id="tipo"[^>]*>([\s\S]*?)<\/select>/g)];
    expect(optionMatches).toHaveLength(1);
    const selectHtml = optionMatches[0]?.[1] ?? '';
    const optionLabels = [...selectHtml.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map(
      (m) => (m[1] ?? '').trim()
    );
    expect(optionLabels).toEqual([
      'Todos los tipos',
      'Ordenanza',
      'Convenio',
      'Decreto',
      'Resolución',
      'Anexo',
      'Preparatoria',
      'Sin clasificar',
    ]);
  });

  it('describes the corpus as documents, with the exact copy', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(BuscarPage);
    expect(html).toContain('Buscar en 1.038 documentos');
  });

  it('is excluded from its own Pagefind index', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(BuscarPage);
    expect(html).not.toContain('data-pagefind-body');
  });
});
