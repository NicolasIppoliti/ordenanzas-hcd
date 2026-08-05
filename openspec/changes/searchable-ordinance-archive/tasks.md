# Tasks: Searchable Ordinance Archive

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 3,000–3,750 |
| 800-line budget risk | High |
| Chained PRs recommended | Yes |
| Delivery strategy | ask-on-risk |
| Chain strategy | `feature-branch-chain` — confirmed by the product owner |

Decision needed before apply: RESOLVED — the owner chose the feature-branch chain
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
800-line budget risk: High — mitigated by the 8-slice chain; no single PR exceeds ~500 lines

### Slices (Feature Branch Chain: PR1→tracker, PR2a→PR1, PR2b→PR2a, PR3..5→prior branch)

| # | Slice | Est. lines | Delivers alone | Depends on | Independently reviewable |
|---|---|---|---|---|---|
| 1 | Scaffolding + toolchain | ~250 | Green `test_command`/`build_command`, network guard | — | Yes |
| 2a-i | Listing parser + `doc_id` identity | ~510 measured | `listing.py` + `doc_id.py` + their tests: 1,038 entries parsed from the fixture, ids validated, collisions resolved | 1 | Yes |
| 2a-ii | Metadata derivation | ~345 measured | `doc_meta.py` + tests: title, `doc_type`, year, `expediente`, `number_variants` | 2a-i | Yes |
| 2a-iii | Writers + aliases + CLI | ~510 measured | `manifest_writer`, `sync_status`, `unresolved`, `aliases`, `json_types`, `cli` + tests: the complete 1,038-record `manifest.json`, built offline | 2a-ii | Yes — the emitted manifest is the artifact a reviewer reads |
| 2b | Polite fetching + archive | ~400 | Ported network layer: politeness, `robots.txt` HALT, bounded retries, sha256 archive, drift/failed-refetch, incremental skip | 2a | Yes — small enough that the HALT path gets real review |
| 3 | Text extraction + cross-refs | ~450 | `documents/*.json`, D2 size decision, refs resolved | 2b | Yes |
| 3.5 | First full `data/` import | 0 authored (1,038 generated files) | Real corpus data committed | 3 | Own PR, no code mixed |
| 4a | Site core: layout/detail/aliases/provenance/staleness/a11y | ~500 | One `/documento/{doc_id}` page per record plus one redirect page per alias, type labels visible, axe green | 3.5 | Yes |
| 4b | Site search: Pagefind, type/year filters, no_text marker | ~350 | Findable full-text + metadata-only, type label in every result | 4a | Yes |
| 5 | Workflow + escalation + deploy | ~250 | Weekly cron live, halt/escalate proven | 4b | Yes |

**The slice estimates are running ~3× low — treat every remaining one as a floor.**
Slice 2a was forecast at ~450 authored lines and came in at **~1,370** (923 source across
nine modules, 444 test). Nothing was over-built; the forecast was simply wrong, and it was
wrong in the direction that silently defeats a review budget. PR2a was therefore
re-partitioned into three PRs *after* the code was already written and green — a
presentation change, not rework. Before starting 2b, 3, 4a or 4b, re-forecast against what
2a actually cost rather than against the original table, and expect the 3,000–3,750 total
to be closer to double.

**Why 2 was split at offline-vs-network, not at ports-vs-parsing.** Slice 2 reached ~800
lines — exactly the session budget — before D11's alias map was added. The obvious split
(ports in one PR, parsing in the other) was rejected: the ports PR would produce nothing
observable, so a reviewer would have to accept it on faith. Splitting at the network
boundary gives PR2a a real, inspectable artifact — a manifest built from the committed
fixture, with no network code exercised at all — and lets PR2b introduce the risky
fetching code against an identity model that is already settled and verified.

### Suggested Work Units

| Unit | Goal | PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Toolchain scaffold | PR1 | `uv run --directory pipeline pytest -q` | N/A — no logic yet | Revert `pipeline/`,`site/` scaffolds |
| 2a-i | Listing parser + identity | PR2a-i | `uv run --directory pipeline pytest -q tests/test_listing.py tests/test_doc_id.py` | Committed `listing-2026-08-04.html`; network guard makes "no HTTP" enforced, not claimed | Revert `hcd_sync/{listing,doc_id}.py` |
| 2a-ii | Metadata derivation | PR2a-ii | `uv run --directory pipeline pytest -q tests/test_doc_meta.py` | Same fixture, no network | Revert `hcd_sync/doc_meta.py` |
| 2a-iii | Writers + aliases + CLI | PR2a-iii | `uv run --directory pipeline pytest -q tests/test_aliases.py tests/test_cli_build_manifest.py` | Same fixture; acceptance is the emitted 1,038-record manifest | Revert `hcd_sync/{manifest_writer,sync_status,unresolved,aliases,json_types,cli}.py` |
| 2b | Polite fetching + archive | PR2b | `uv run --directory pipeline pytest -q tests/test_http_client.py tests/test_archive.py tests/test_sync_loop.py` | Fake fetchers + injected clock/sleep; no live host | Revert `hcd_sync/{http_client,archive,storage}.py` and `manifest.py`'s drift branch |
| 3 | Extraction + crossrefs | PR3 | `pytest -q tests/test_extract.py tests/test_crossrefs.py` | PyMuPDF-generated fixture PDFs | Revert `extract.py`,`crossrefs.py` |
| 3.5 | Data import | PR3.5 | `git status --porcelain data/` clean | Real `hcd-sync run` on operator machine | `git revert` single commit |
| 4a | Site core + alias routes | PR4a | `pnpm --dir site run test` | `astro build` + axe smoke | Revert `site/src/{pages,components,lib}` |
| 4b | Search | PR4b | `pnpm --dir site run test -- pagefind` | `pagefind --site dist` + manual query | Revert `buscar.astro`, filter attrs |
| 5 | Workflow + escalation | PR5 | `actionlint .github/workflows/*.yml` | Manual `workflow_dispatch` + live Resend test send | Disable workflow, revert files |

## Phase 1: Scaffolding (PR1)

- [x] 1.1 `pipeline/pyproject.toml` (uv, requests/pymupdf, pytest/ruff/mypy)
- [x] 1.2 `pipeline/tests/conftest.py` autouse fixture monkeypatching `socket.socket` to raise
- [x] 1.3 TEST: guard fixture blocks a real `requests.get` call
- [x] 1.4 `site/package.json`, `astro.config.mjs`, `tsconfig.json`
- [x] 1.5 `data/.gitkeep`, `.gitignore` (`archive/`,`dist/`,`.venv/`,`node_modules/`)
- [x] 1.6 Fill `openspec/config.yaml` apply/verify `test_command`/`build_command`/`coverage_threshold: 80`; set `strict_tdd: true`
- [x] 1.7 Verify both commands run green with zero tests (empty pass) — both green. Two integrations that cannot operate on a zero-page site were moved to the slice that first produces pages, rather than being worked around: `@astrojs/sitemap` (crashes in `astro:build:done` with `Cannot read properties of undefined (reading 'reduce')`) is enabled in 4a.13, and `pagefind` (exits 1 with "not able to build an index" on 0 HTML files) rejoins the `build` script in 4b.8.

## Phase 2a: Listing → manifest, fully offline (PR2a)

Every task here runs against the committed fixture with the network guard active. Nothing
in this PR opens a socket.

- [x] 2a.1 Commit the captured 2026-08-04 listing HTML verbatim as
      `pipeline/tests/fixtures/listing-2026-08-04.html` (source:
      `https://hcdrosales.gob.ar/?lsvr_document_cat=ordenanzas`, 1,182,351 bytes,
      1,038 PDF links). Every task below develops and tests against this fixture; the live
      government host is not touched again during development
- [x] 2a.2 `listing.py` per D9: select `a.post-tree__item-link--file` anywhere inside the nested `ul.post-tree__children--level-N` tree; unescape HTML entities (`&#8211;`); emit `{doc_id, number, url, filename, anchor_text}[]`. Derive nothing from nesting depth
- [x] 2a.3 TEST: parser against `listing-2026-08-04.html` → exactly 1,038 anchors, entity-unescaped anchor text, no field derived from `level-N`
- [x] 2a.4 TEST: zero anchors parsed → `last_run_status: "error"`, escalation, `data/` not rewritten
- [x] 2a.5 `doc_id` derivation per D7 (final URL path segment minus `.pdf`) + path-safety validator: percent-decode, NFC-normalize and reject if normalization changes the value; reject `/`, `\`, NUL, C0/C1 controls, `..` substring, `.`/`..`, leading `.` or `-`, trailing space (a trailing `.` is ACCEPTED — three real ordinances carry one), reserved device names (`CON`/`PRN`/`AUX`/`NUL`/`COM1-9`/`LPT1-9`), >120 chars; accept everything else including non-ASCII. **Reject only — no sanitising, truncating or slugifying branch**
- [x] 2a.6 TEST: path-safety rejections table-driven (`../../etc/passwd`, `a/b`, `a\b`, `..`, `.hidden`, `-rf`, `trailing␠`, NUL/C0, NFC-unstable homoglyph, `NUL`/`COM1`, `%2f..%2f` decoded, 121 chars) → recorded in `unresolved-listing-entries.json`, **zero writes outside `archive/` and `data/documents/`**, run `partial`. PR2b re-asserts the same table under a real `Fetcher` to prove the entry is never fetched
- [x] 2a.7 TEST: `4298-O252023-Ley-Provincial-N°-15430.-Carga-administrativa` is **accepted**, run `ok` — regression test for the discarded ASCII allowlist, which failed this one real ordinance out of 1,038
- [x] 2a.8 TEST: the trailing-dot stems `3909-…-en-los-cajeros.`, `3913-Acepta-donacion.` and `3915-Colillas-de-cigarrillos.` are **accepted** — regression test for the discarded trailing-dot ban, which failed three more real ordinances
- [x] 2a.9 TEST: whole-corpus id validation over all 1,038 stems in the fixture → zero rejections, 1,038 unique ids after collision resolution, exactly four suffixed ids, max stem length 102. **Any future hardening rule must be replayed through this test before it lands**
- [x] 2a.10 `doc_id` collision resolution per D7: on a stem shared by two distinct URLs, append the upload path's `YYYY-MM` to **only the colliding records** (`3298--2021-11`, `3298--2021-12`); non-colliding records keep the clean stem; run continues, nothing dropped
- [x] 2a.11 TEST: the real `3298`/`3299` pairs → four records with the suffixed ids, `last_run_status: "ok"`, no error, and every non-colliding record in the fixture keeps its unsuffixed stem
- [x] 2a.12 Identical-URL collapse in the listing parser (byte-identical `source_url` → one record, before any fetch); defensive path the measured corpus does not exercise
- [x] 2a.13 TEST: synthetic fixture repeating one URL → exactly one record, `ok` not `partial`, nothing in `unresolved-listing-entries.json`
- [x] 2a.14 `doc_meta.py` per D4/D7/D8/D10 (replaces the planned `filename_meta.py`, which is no longer filename-only): `doc_id`, nullable `number`, `expediente`, `year`, `title`, `title_source`, `doc_type`
- [x] 2a.15 Anchor-text title extraction per D4: unescape entities, strip the leading number and its separator (`-`, `–`, `—`, `:` with surrounding whitespace, only when the leading token is the record's own number), keep accents → `title_source: "listing"`; fall back to the filename slug (`-` → space, verbatim, **no accent restoration**) → `"filename"`; else `null` → `"none"`
- [x] 2a.16 TEST: `4457 &#8211; Mesa de Gestión del Agua` → title `Mesa de Gestión del Agua` with accents, `title_source: "listing"`; slug-only entry → `"filename"` and no accents invented; number-only entry → `title is None`/`"none"`; body text never used as a title
- [x] 2a.17 `doc_type` classification per D8: own non-null `number` → `ordenanza` FIRST; else explicit marker in anchor text or filename (`Convenio`, `Resolución`/`Resolucion`, `Decreto`/`Dec.`, `Anexo`, `Preparatoria`, whole-word, accent-tolerant); else `sin clasificar`. **Never derived from subject matter** — the original marker-first priority misclassified 67 real ordinances whose titles mention a convenio or a decree
- [x] 2a.18 TEST: `Convenio-Ministerio-de-las-Mujeres` → `convenio`; `Resolucion-053-2021-…` → `resolucion`; `Dec.-377-Promulga-Ordenanza-3288-…` → `decreto` (marker beats number); `ANEXO-I-…` → `anexo`; `4457-…` → `ordenanza`; `Calle-Irigoyen` → `sin clasificar`
- [x] 2a.19 Duplicate-number variant handling per D7: records sharing a non-null `number` each carry `number_variants` naming the others; neither dropped, merged, nor marked preferred
- [x] 2a.20 TEST: `3296` + `3296-1` → two records, two `doc_id`s, reciprocal `number_variants`, no preferred record selected
- [x] 2a.21 TEST: `Convenio.pdf` (no leading number) → **present** in `manifest.json` with `number: null` and `doc_type: "convenio"`, `last_run_status: "ok"` — a missing number is not an error
- [x] 2a.22a Rewrite `expediente` extraction per D13: three families (GDE / compact / dashed), longest-match, anchored right after the leading number; everything else `null`. **Fixes a real defect in the shipped PR2a code**, which truncates `EX-2025-00106406-MUNICRO-DCSE` to `EX-2025`
- [x] 2a.22b TEST: `EX-2025-00106406-MUNICRO-DCSE` captured whole and never as a strict prefix; `O822024` and `COR03-17` captured; `4457-Mesa-de-Gestion-del-Agua` and `4372-O89-…` both absent; whole-corpus assertion records the measured 373-of-987 coverage and asserts no captured value is a prefix of a longer expediente-shaped token
- [x] 2a.22 Year derivation per D10 (expediente → document header → `null` + `Año no determinado`); TEST asserts `/uploads/YYYY/` is never used as the year. The header-transcription branch is exercised with a stubbed text body; it is wired to real extracted text in PR3
- [x] 2a.23 Manifest writer for the object-shaped `manifest.json` (upsert of new records only; the drift and failed-refetch branches are ported in PR2b, which is where a re-fetch can first occur)
- [x] 2a.24 `sync_status.py` status record incl. `halted`
- [x] 2a.25 `unresolved-listing-entries.json` writer (URL + raw filename + rejection reason)
- [x] 2a.26 `aliases.py` per D11: emit `data/doc-id-aliases.json` (`schema_version`, `generated_at`, `aliases[]` of `{alias, target, created_at, reason}`); when a record's `doc_id` changes, append the previous id as an alias. **Append-only**: never delete, never repoint, never reuse; alias strings pass the same D7 validation as a live `doc_id`
- [x] 2a.27 TEST: a record whose `doc_id` changes between two runs → the previous id appears as an alias targeting the new id, and the manifest record carries only the current id
- [x] 2a.28 TEST: two consecutive runs → every alias from run 1 survives byte-identical with unchanged `target` and `created_at`; a rewrite that would drop or repoint an entry raises instead of writing
- [x] 2a.29 TEST: an alias string failing D7 validation is rejected before it is written
- [x] 2a.30 `cli.py` offline path: `hcd-sync build-manifest --listing-file <path>` — parses a local listing and emits `data/**` with no network layer involved. The fetching subcommand lands in PR2b
- [x] 2a.31 TEST (acceptance for this PR): running the offline path against `listing-2026-08-04.html` emits a `manifest.json` of **1,038 records** with every title, number, type and year populated per spec, and the network guard records **zero** socket attempts

## Phase 2b: Polite fetching + archive (PR2b)

- [x] 2b.1 Port `http_client.py` (UA, `HostPolicy`, `PolicedHostFetcher`, `check_robots_txt_still_absent`)
- [x] 2b.2 TEST: politeness delay ≥4.0s via injected clock/sleep fakes
- [x] 2b.3 TEST: concurrency cap never >1 in flight
- [x] 2b.4 TEST: robots.txt 200 → halt, zero `get` calls, `halted` status, notifier called once, exit 1
- [x] 2b.5 TEST: bounded retries exhausted → `status: error`, prior `ok` preserved via `last_error`
- [x] 2b.6 Port `archive.py`, `storage.py` (fetch→sha256→`archive/{doc_id}.pdf`→record, `Fetcher` Protocol)
- [x] 2b.7 Port `manifest.py`'s drift and failed-refetch semantics onto the object-shaped manifest written in 2a.23 (`{doc_id}@{YYYY-MM-DD}` drift preservation)
- [x] 2b.8 TEST: drift/failed-refetch cases re-asserted against the object-shaped manifest
- [x] 2b.9 Incremental skip: a listing entry whose `doc_id` already has an `ok`/`no_text` record is never re-fetched (keyed on `doc_id`, so `3296` and `3296-1` are both archived). A `pending` record is NOT skipped — per D13 it means "described but never fetched", so it must be fetched on this run
- [x] 2b.9a TEST: a `pending` record from a PR2a-built manifest is fetched exactly once and transitions to `ok`/`no_text`/`error`; nothing ever transitions back to `pending`; `pending` never sets `last_run_status` to `error` or `partial` and never escalates
- [x] 2b.10 TEST: a rejected `doc_id` from the 2a.6 table is never passed to the `Fetcher`
- [x] 2b.11 `cli.py` fetching path: `hcd-sync run [--recheck][--limit][--dry-run]`
- [x] 2b.12 TEST: offline integration — hand-built `post-tree` fixture (20 links: text PDF, no-text PDF, number-only, accented anchor, numberless convenio, `-1` duplicate-number pair, repeated identical URL, `Modifica Ordenanza 3351`) + fake fetchers → correct `manifest.json`+`sync-status.json` golden
- [x] 2b.13 TEST (acceptance for this PR): the full loop runs twice against fake fetchers; the second run issues **zero** PDF `get` calls and leaves a clean `git status` on `data/`

## Phase 3: Extraction + cross-references (PR3)

- [x] 3.1 Archive ≥50 real PDFs into `archive/` via a real limited sync run — done 2026-08-05: 50 documents in 3m31s (~4.2s/doc, politeness respected), all with sha256, 34.3 MB of PDFs in gitignored scratch
- [x] 3.2 Run D2 one-line PyMuPDF size measurement — done: mean 4154 B, p95 10326, max 45543, projected 3.61 MB for 870 text-bearing docs. 14x under the 50 MB threshold; **commit-to-git locked**, escape hatch not built. Sample caveat recorded in D2: it is the 50 newest documents, not a random draw
- [x] 3.3 `extract.py` (PyMuPDF text; empty → `no_text`) — wired into `run_sync`'s fetch loop (fetch → sha256 → archive → extract)
- [x] 3.3a Narrow the incremental skip: `ok` with `text_path: null` is "archived but not yet extracted" and MUST be re-fetched once, since `archive/` is per-run scratch and the PDF is gone by the time extraction lands. Only `no_text`, or `ok` **with** a `text_path`, settles a record — `cli._is_settled`
- [x] 3.3b TEST: a manifest record written `ok` with `text_path: null` by a PR2b-era run is re-fetched exactly once, extracted, and ends `ok` with a `text_path` or `no_text`; a record already carrying a `text_path` is not re-fetched
- [x] 3.4 `crossrefs.py` D5 patterns P1/P2/P3 + negatives + manifest gating; resolution maps a number to the **set** of records carrying it, never to a single chosen record
- [x] 3.5 TEST: `Incorpora artículo 169 bis a la Ordenanza 1999` → `{1999}` only
- [x] 3.6 TEST: `Ordenanza General 267` → `{}`; self-reference → `{}`
- [x] 3.7 TEST: unresolved candidate → absent from `cross_references`, present in `unresolved-references.json`
- [x] 3.8 TEST: contract — pytest JSON Schema validation of pipeline output (`pipeline/schemas/{manifest,aliases}.schema.json`, `pipeline/tests/test_contract.py`)
- [x] 3.9 `site/src/lib/contract.ts` + `assertManifest` + `assertAliases`; TEST (vitest) the same fixtures validate (`fixtures/contract-manifest.json`, `fixtures/contract-aliases.json`, shared between pytest and vitest)
- [x] 3.10 Wire `documents/{doc_id}.json` + `unresolved-references.json` writers into `cli.py`; writer takes `doc_id` from the validated record, never re-derived at write time
- [x] 3.11 Wire D10's header-year fallback to real extracted text: `derive_year(header_text=...)` exists and is tested against a stub, but nothing passes the extracted body into it, so a record whose year is not in its expediente still ends `null`. Task 2a.22 promised this "in PR3" and no numbered task ever assigned it — found by the PR3 agent and flagged rather than freelanced
- [x] 3.12 TEST: a document with no expediente year token whose body begins `Punta Alta, 27 de enero de 2.026` ends with `year: 2026` after extraction; a document with neither source keeps `year: null` and lands in the `Año no determinado` bucket. Measured over the 50 archived PDFs: 34 already had a year from the expediente, 13 gained one from the header, 3 remain null — coverage 34/50 -> 47/50 (94%)

## Phase 3.5: First data import (PR3.5, own commit)

- [ ] 3.5.1 Run full `hcd-sync run` on operator machine (~70 min, 1,038 docs)
- [ ] 3.5.2 Commit generated `data/**` alone as `github-actions[bot]`, no authored code mixed

## Phase 4a: Site core (PR4a)

- [ ] 4a.1 `site/src/lib/{data,related,staleness,excerpt,aliases}.ts`
- [ ] 4a.2 TEST: undirected union `refs(A)={B}` ⇒ `related(A)∋B` and `related(B)∋A`, no verb/direction string; and a reference to a number held by two records links **both**, each labelled with its type and title, with no "best match" chosen
- [ ] 4a.3 TEST: staleness 29/30/31-day boundaries; runtime script only adds notice
- [ ] 4a.4 `Layout/DocCard/Provenance/StalenessNotice/Footer.astro`
- [ ] 4a.5 `index.astro`, `documento/[doc_id].astro` (getStaticPaths over every manifest record — the route is document-neutral for every type, there is no `/ordenanza/` route), `acerca.astro`; render the `doc_type` label in the `<h1>` and metadata block (`Ordenanza 4457 — Mesa de Gestión del Agua`, `Convenio — Ministerio de las Mujeres`), omit an absent number rather than substituting one, and show the same-number variant notice with links to siblings
- [ ] 4a.6 Site copy counts documents, never ordinances: `1.038 documentos del HCD` on the index, `Buscar en 1.038 documentos` on search entry points
- [ ] 4a.7 `acerca.astro` states plainly, in neutral Spanish, that the archive reproduces the HCD `Ordenanzas` listing exactly as published, that the listing includes documents that are not ordinances (convenios, decretos, resoluciones, anexos, preparatorias), and that nothing is added, removed or reclassified. No framing beyond that factual statement
- [ ] 4a.8 `d/[alias].astro` per D11: `getStaticPaths` over `doc-id-aliases.json`; emit one static redirect page per alias with `<meta http-equiv="refresh">`, a canonical link to `/documento/{target}`, a visible fallback link and the line `Este documento ahora está en otra dirección.`; `data-pagefind-ignore` on the page
- [ ] 4a.9 TEST: alias `3298` → `/d/3298` is emitted, carries the refresh meta and canonical to `/documento/3298--2021-11`, and includes a visible link
- [ ] 4a.10 TEST: an alias whose target is absent from the manifest **fails `astro build`** with a message naming the alias and its missing target; assert no page is emitted and the miss is not skipped silently
- [ ] 4a.11 TEST: `axe-core`+`happy-dom` on index/detail-with-title/detail-null-title/detail-convenio
- [ ] 4a.12 Verify `astro build` emits one page per manifest record (1,038) plus one page per alias, 0 JS beyond staleness script, ≤20KB chrome/page, whole-page p95 ≤50KB with the observed max recorded
- [ ] 4a.13 Enable `@astrojs/sitemap` in `site/astro.config.mjs` (`integrations: [sitemap()]`); deferred from slice 1 because it crashes on a zero-route build. Verify `dist/sitemap-index.xml` is emitted

## Phase 4b: Search (PR4b)

- [ ] 4b.1 `data-pagefind-body` on article region only; `data-pagefind-ignore` on chrome
- [ ] 4b.2 `data-pagefind-filter="anio"`/`"texto"`/`"tipo"`; `Año no determinado` bucket for absent years; non-empty indexed region for `no_text` docs (number/title/expediente/type)
- [ ] 4b.3 `buscar.astro` (labelled `<input type="search">`, `aria-live="polite"` results); the type filter exposes exactly `Ordenanza`, `Convenio`, `Decreto`, `Resolución`, `Anexo`, `Preparatoria`, `Sin clasificar`; corpus copy reads `Buscar en 1.038 documentos`
- [ ] 4b.4 TEST: query returns excerpt for text-bearing match; no-match shows Spanish empty state
- [ ] 4b.5 TEST: `no_text` doc findable by metadata, marked "no indexed text", no excerpt
- [ ] 4b.6 TEST: a `convenio` result carries the visible `Convenio` label and is never labelled `Ordenanza`; a `sin clasificar` result shows `Documento sin clasificar`; a numberless record is findable and renders no substitute number
- [ ] 4b.7 TEST: keyboard-only navigation reaches input+results with visible focus
- [ ] 4b.8 Restore `"build": "astro build && pagefind --site dist"` in `site/package.json` (split into `build` + `build:search` in slice 1, since pagefind exits 1 on a zero-HTML `dist/`). Verify the index is emitted and that a `no_text` document is still indexed

## Phase 5: Workflow + escalation + deploy (PR5)

- [ ] 5.1 `notify.py` Resend HTTP POST; TEST error path contains no `RESEND_API_KEY` substring
- [ ] 5.2 Confirm/create Cloudflare Email Routing rule `hcd@fragua.dev`; send + confirm one live test alert
- [ ] 5.3 `.github/workflows/sync-and-deploy.yml`: job1 sync (`permissions: contents:write`, `concurrency: sync`), job2 `build-deploy` `needs: sync, if: always()`
- [ ] 5.4 TEST: two no-change syncs → zero commits, exit 0
- [ ] 5.5 TEST: simulated non-fast-forward → one rebase retry then non-zero exit
- [ ] 5.6 `.github/workflows/ci.yml`: `test_command`+`build_command`+`actionlint`
- [ ] 5.7 TEST: `actionlint` passes; assert no `${{ }}` interpolation of pipeline output in any `run:`
- [ ] 5.8 `README.md` recording D1 Astro deviation
- [ ] 5.9 Verify Cloudflare Pages project + API token exist; `wrangler pages deploy` succeeds
- [ ] 5.10 Confirm `hcd@fragua.dev` mailbox receipt before marking escalation done
- [ ] 5.11 Verify `https://ordenanzas.fragua.dev` resolves BEFORE the full 1,038-document import (task 3.5). It is the contact URL in the crawler's `User-Agent`, so until the site is live an HCD administrator reading their logs follows it to nothing; `hcd@fragua.dev` is the only working channel until then
