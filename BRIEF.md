# Searchable archive of Coronel Rosales municipal ordinances

Brief for `/sdd-new`. Self-contained: every fact below was verified in August 2026
against the live source. No external context is required to act on it.

---

## Why this exists

The Honorable Concejo Deliberante of Coronel Rosales (Buenos Aires, Argentina)
publishes its complete legislative archive at `hcdrosales.gob.ar`. The documents
are public but effectively unusable: 1,038 PDF links in reverse-chronological
order, with no full-text search, no topic or date filter, and no grouping of an
ordinance with the ordinances that later amend it.

A resident checking a local regulation, a shop owner looking up licensing rules,
or a local journalist researching precedent must currently open files one at a
time.

This project makes that archive searchable. It is a free public utility published
by Fragua, and it is deliberately **unofficial**: the authoritative document is
always the PDF hosted by the HCD.

## Verified facts about the source

Measured directly, not assumed:

| Fact | Value |
| --- | --- |
| Total PDF documents | 1,038 |
| Range | Ordinance 3263 (2011 budget) through 4457 (January 2026) |
| Listing pagination | **None.** All 1,038 links come from a single 1.18 MB page |
| `robots.txt` | **Returns 404.** No crawl restrictions declared |
| Filenames with a descriptive title | 839 (81%) |
| Filenames with number only | 144 (14%) |
| Other | 55 (5%) |
| Text-extractable PDFs | **84%** (21 of a systematic 25-document sample) |
| Scanned, no text layer | 16% — **all four from the 2021 bulk historical upload** |
| Documents uploaded 2022 onward | 100% text-extractable in sample (9 of 9) |

Filenames encode usable metadata, for example:

```
3653-COR03-17-Recorrido-omnibus-larga-distancia.pdf
4390-I232025-Leasing-camion-compactador.pdf
4457-Mesa-de-Gestion-del-Agua.pdf
```

Ordinance number, originating file number (`expediente`), year and title are all
derivable without opening the document.

Extracted text is clean and structurally regular across the corpus:

```
Punta Alta, 27 de enero de 2.026
Corresponde Expte. O-02-2026

EL HONORABLE CONCEJO DELIBERANTE DEL PARTIDO DE CORONEL ROSALES SANCIONA
LA SIGUIENTE
O R D E N A N Z A 4457

Artículo 1º: MESA DEL AGUA: Créase la Mesa de Gestión del Agua en el Distrito de
Coronel de Marina Leonardo Rosales ...
```

**OCR is not required and is explicitly out of scope.**

## Goals

1. Make every published ordinance findable by number, year, originating file
   number and title — for 100% of the corpus.
2. Make ordinance content searchable by full text — for the ~84% that carries a
   text layer.
3. Link an ordinance to the ordinances that amend it, reconstructing a relationship
   the official site does not expose.
4. Always show provenance: link to the official PDF, and state when the archive was
   last synchronised.

## Non-goals

Out of scope, deliberately:

- OCR of scanned documents
- Per-councillor voting records
- Notifications, alerts, or any outbound messaging
- User accounts, authentication, or any storage of personal data
- Comments, ratings, or social features
- Any editorial layer: commentary, summaries, rankings, or highlighting of
  particular councillors or political blocs

## Hard constraints

These are product constraints, not preferences. They exist because a previous
Fragua product was abandoned when per-message costs scaled with usage.

- **Zero variable cost.** Nothing in the running system may scale in price with
  traffic or usage. Static hosting with a pre-generated search index.
- **No backend, no database, no user accounts, no personal data.** This removes
  the entire class of obligations under Argentine data protection law (Ley 25.326)
  and eliminates the support and security surface.
- **Maintenance under 15 minutes per week.** Synchronisation must be automated and
  incremental.
- **Fail visibly.** Stale or missing data must be visible to the user, never
  silently hidden.
- **Strict neutrality.** The site presents official documents and nothing else. It
  must be equally useful to every political bloc. This is a reputational
  requirement for Fragua, not a stylistic one.

## Functional scope, first version

1. **Listing sync.** One request retrieves the full document listing. Compare
   against what is already archived; download only what is new.
2. **Polite fetching.** One request at a time, delay between requests, honest
   identifying `User-Agent` including a contact URL, local cache so nothing is
   re-downloaded, bounded retries, stop on persistent error. Re-check `robots.txt`
   on every run: it currently 404s; if it ever returns 200, halt and escalate
   rather than continue.
3. **Metadata extraction from filename.** Ordinance number, `expediente`, year,
   title. Must degrade gracefully for the 14% that carry only a number.
4. **Text extraction and indexing.** For documents with a text layer. Documents
   without one are still indexed by their metadata and are marked in results as
   having no indexed text.
5. **Search.** Full text plus filter by year. Results show ordinance number, title,
   year and a matching excerpt.
6. **Ordinance detail view.** Metadata, extracted text, link to the official PDF.
7. **Cross-reference detection.** Identify references to other ordinances — both in
   titles (`Modifica Ordenanza 3351`, `Incorpora artículo 169 bis a la Ordenanza
   1999`) and in body text — and render them as links in both directions.
8. **Provenance and disclaimer.** Visible last-synchronised date, a clear statement
   that this is an unofficial consultation tool, and that in case of any
   discrepancy the official HCD PDF prevails.

## Acceptance criteria

- All 1,038 documents are discoverable by number, year, `expediente` and title.
- A full-text query returns results from the text-bearing subset with a usable
  excerpt.
- Documents without a text layer appear in metadata results, explicitly marked.
- Every result links to the official PDF at `hcdrosales.gob.ar`.
- The last-synchronised date is visible on the page.
- A re-run of the sync downloads only documents not already archived.
- The deployed site issues no per-user or per-request paid calls of any kind.
- The site is usable on a mobile phone: most local traffic will be mobile.

## Risks to handle explicitly

| Risk | Handling |
| --- | --- |
| Source reorganises its URLs | Sync must recover by re-reading the listing, not by assuming stable paths |
| `robots.txt` starts returning 200 | Halt and escalate; do not continue crawling |
| Filename metadata is inconsistent | Degrade gracefully; never fabricate a title |
| Corpus grows over time | Incremental sync; index rebuild must stay cheap |
| Perceived political bias | No editorial content whatsoever; official documents only |

## Conventions

- **Code, identifiers, commits and technical documentation: English.**
- **User-facing site copy: Spanish** (neutral, professional — the audience is
  residents and municipal officials of Coronel Rosales).
- Accessibility: WCAG 2.1 AA minimum. Keyboard navigable, visible focus, semantic
  HTML, adequate contrast.
- Prefer the simplest stack that satisfies the constraints. A static site with a
  pre-built index is sufficient; do not introduce a database or a server runtime
  unless a stated requirement makes it unavoidable.

## Prior art — reference implementation, outside this repository

An ingestion pipeline for official Argentine electoral data covering this same
district already exists at:

```
/Users/nicolasmateoippoliti/dev/votus-plataforma-lla
```

Read-only reference. Do not import code from it and do not create any dependency
on it — that project is unrelated work and must stay separate from this one.

What is worth reading there, and why:

| Path | What to take from it |
| --- | --- |
| `etl/etl/archive.py`, `etl/etl/manifest.py` | Source archiving with checksum verification and a manifest of what was fetched, when, and from where |
| `etl/etl/http_client.py` | Identifying User-Agent, `robots.txt` absence re-check, bounded retries |
| `etl/etl/ingest/pba.py` | Politeness policy against a government host: single concurrency, enforced delay, registered paths only, archive-first caching |
| `etl/sources.yaml` | How each source is registered with its URL, checksum, size and verification notes |
| `openspec/changes/electoral-analysis-platform/` | The spec and design format already used in this workspace |

That project explicitly excludes OCR and PDF parsing from scope. The same
exclusion applies here, for the same reason.
