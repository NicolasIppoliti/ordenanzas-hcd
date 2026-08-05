# Exploration: searchable-ordinance-archive

## Current State

Greenfield repo — only `.git/`, `.atl/`, `BRIEF.md`, and the `openspec/` skeleton exist.
No code, no toolchain chosen. `openspec/config.yaml` already frames scope correctly and
defers the stack choice to design.

## Affected Areas

- `openspec/config.yaml` — already scoped correctly, no changes needed at explore time
- (future) ingestion pipeline directory (Python recommended) — new
- (future) Astro site directory — new
- Reference, read-only: `/Users/nicolasmateoippoliti/dev/votus-plataforma-lla/etl/etl/{archive,manifest,http_client}.py`,
  `etl/etl/ingest/pba.py`, `etl/sources.yaml` — patterns to port (not import), specifically
  fetch / sha256 / manifest / politeness handling

## Approaches

### 1. Search index: Pagefind

Chunked static index built by crawling generated HTML.

- **Pros:** built-in Spanish stemming and diacritic handling; chunked delivery keeps
  per-query mobile payload tiny (tens of KB); no index code to hand-write; well-documented
  Astro pairing.
- **Cons:** indexes rendered HTML, not raw JSON — detail pages must render extracted text
  at build time (already required anyway).
- **Effort:** Low.

Alternatives compared: Lunr.js / MiniSearch (whole-index load, multi-MB for this corpus,
weak or absent Spanish stemming), FlexSearch / Orama (tunable but no first-class Spanish
stemming or automatic chunking), hand-rolled sharded index (reinvents what Pagefind ships).
All rejected in favour of Pagefind.

### 2. Site generator: Astro (static output)

1,038 `getStaticPaths` detail pages at `/documento/{doc_id}`, zero client JS by default.

- **Pros:** best match for "many mostly-static pages plus one small interactive widget";
  documented Pagefind integration; measurably smaller mobile payload than a React-shaped
  framework.
- **Cons:** introduces a stack the workspace does not otherwise use (house default is
  Next.js) — deviation flagged explicitly for the user.
- **Effort:** Medium.

Alternative: Next.js static export — matches workspace convention but ships more client JS
by default even for fully static content, working against the mobile-payload acceptance
criterion, while gaining none of Next's dynamic features (disabled under static export).
Eleventy considered: less type-safe templating. Plain build script rejected as reinventing
routing and templating.

### 3. Ingestion language: Python

Port votus's `archive.py` / `http_client.py` patterns (port, do not import); `PyMuPDF` for
text extraction.

- **Pros:** directly reusable fetch / politeness / manifest engineering already solved and
  tested in the reference repo; PyMuPDF is the stronger extractor for this clean,
  born-digital corpus.
- **Cons:** two-language repo (Python pipeline plus TS/Astro site) — mitigated because the
  hand-off is a flat JSON contract with no shared runtime.
- **Effort:** Medium.

Alternative: Node plus `pdfjs-dist` — fully viable, single-language repo, no material
extraction-quality gap for this corpus, but forgoes the reuse benefit.

## Recommendation

Pagefind (search) + Astro static output (site) + Python pipeline (ingestion), emitting
committed JSON (`data/manifest.json` plus `data/documents/{doc_id}.json`) that Astro reads
directly at build time. A GitHub Actions cron drives weekly sync and rebuild, at zero cost.

Full comparison tables and the data-shape / cross-reference / automation detail are
persisted in the Engram artifact `sdd/searchable-ordinance-archive/explore`.

## Risks

- The Astro + Pagefind + committed-JSON combination is well documented in general but
  unverified end to end against this corpus's text profile — worth a small spike in
  `sdd-design`.
- Manifest and text-body JSON size at full 1,038-document scale is estimated, not measured
  — check a real sample before finalising commit-to-git vs. fetch-at-build for text bodies.
- Direct-commit-to-main vs. PR-gated sync via GitHub Actions needs an explicit decision
  (token management, "fail visibly" mechanics) — not specified in `BRIEF.md`.
- Cross-reference regex precision (title and body patterns, resolved only against known
  manifest numbers) is untested against the real corpus until the first sync run.
- Listing-metadata degradation for the 141 number-only and 54 no-leading-number anchor
  texts needs a concrete fallback rule — a spec decision, not an architecture one.

**Corrected by the 2026-08-04 measurement** (details and BRIEF.md discrepancies in
`design.md`, "Measured source facts"):

- The corpus is 1,038 **documents**, not 1,038 ordinances — the `Ordenanzas` listing also
  carries convenios, decretos, resoluciones, anexos and preparatorias.
- The ordinance-number floor is **1999**, not 3263.
- Document identity is `doc_id` (the filename stem), not `number`: 984 numbered files carry
  only 942 distinct numbers.

## Ready for Proposal

Yes. Every open architecture decision (search engine, site generator, pipeline language,
data shape, cross-reference approach, automation) has a stated recommendation with honest
tradeoffs. Remaining detail (exact regex set, manifest schema field names, exact commit
strategy) belongs to `sdd-spec` and `sdd-design`.
