# Proposal: Searchable Ordinance Archive

## Intent

**Business problem.** The HCD of Coronel Rosales publishes 1,038 PDFs under its
`Ordenanzas` listing as a single link list: no full-text search, no year filter, no link
between an ordinance and the ordinances that amend it. (Measured 2026-08-04: they are
1,038 *documents*, not 1,038 ordinances — the listing also carries convenios, decretos,
resoluciones, anexos and preparatorias. See `design.md`, "Measured source facts".) Residents, shop owners and local
journalists must open files one at a time to answer a basic regulatory question.

**Why now.** The corpus is measured, stable, and unrestricted (`robots.txt` 404s), the
listing already encodes usable metadata (843 of 1,038 anchor texts carry a descriptive
title), and 84% of PDFs carry a text layer. The work is tractable today with zero running cost.

**Success.** A free, unofficial, publicly hosted, mobile-usable, politically neutral
archive where any published document is findable in seconds, always links back to the
official PDF, and visibly states how fresh it is. The authoritative document remains the
HCD PDF.

## Scope

### In Scope — the full functional scope of `BRIEF.md`, all 8 points (v1, nothing deferred)

1. Listing sync — one request retrieves the full listing; download only what is new.
2. Polite fetching — single concurrency, enforced delay, identifying `User-Agent` with a
   contact URL, local cache, bounded retries, stop on persistent error; re-check
   `robots.txt` every run and **HALT + escalate** if it ever returns 200.
3. Metadata extraction from the listing entry — identity (`doc_id`), number, `expediente`,
   year, title, document type; graceful degradation for the 141 number-only and 54
   no-leading-number anchor texts.
4. Text extraction and indexing for text-bearing PDFs; non-text PDFs indexed by metadata
   and explicitly marked as having no indexed text.
5. Search — full text plus year and document-type filters; results show type, number,
   title, year and excerpt.
6. Document detail view — metadata, extracted text, link to the official PDF.
7. Cross-reference detection — title and body-text references to other ordinances,
   rendered as links in both directions.
8. Provenance and disclaimer — visible last-synchronised date, unofficial-tool statement,
   official-PDF-prevails clause.

Plus the settled product decisions below. All of them are confirmed by the product owner;
none is an open assumption.

- **Staleness signalling.** The last-synchronised date is always visible. After a
  **configurable threshold (confirmed default: 30 days)** with no *successful* sync, the
  site additionally shows an explicit "archive out of date" notice (Spanish copy). The
  status of the last sync *attempt* is deliberately **not** surfaced to end users — that
  is operator noise for this audience and belongs in GitHub Actions run status.
- **Attribution.** A discreet footer credit only: "herramienta no oficial publicada por
  Fragua" with a link. No brand in the header, no logo over the document archive. This is
  a neutrality decision, not a stylistic one.
- **Operator escalation channel.** When the sync halts (`robots.txt` returns 200) or
  retries are exhausted, the failure is escalated to the repository owner via GitHub's
  built-in workflow-failure email AND by an email to `hcd@fragua.dev`. This is operator
  alerting only: it is never surfaced to site visitors, and the site itself sends nothing.
  Volume is bounded by the weekly schedule, so a free-tier transactional email provider
  keeps the zero-variable-cost constraint intact; provider choice and secret handling are
  a design decision.
- **Repository visibility: public.** The GitHub repository holding the pipeline, the
  committed `data/`, and the site source is public. This is what makes the Actions free
  tier unmetered, and it also makes every sync commit an auditable public record of what
  was fetched and when. No secret may ever be committed; credentials live only in Actions
  secrets.
- **Crawler identity.** The `User-Agent` identifies the crawler honestly and carries a
  Fragua-owned contact URL plus the `hcd@fragua.dev` address, so the HCD's operators can
  reach a human without guessing. No prior notification is sent to the HCD: the tool is
  deliberately unofficial and consumes only public documents under a `robots.txt` that
  currently 404s.
- **Cross-reference direction: undirected.** Related ordinances are rendered as neutral
  bidirectional links with no relationship-type label. The site never claims "this
  ordinance modifies X" or "was modified by X", because that claim would be derived from a
  regex over a title, not from the legislative record. Stating a legal relationship the
  source does not assert would breach the strict-neutrality constraint.

### Out of Scope (copied from `BRIEF.md` non-goals)

- OCR of scanned documents
- Per-councillor voting records
- Notifications, alerts, or any outbound messaging **to site users**. This non-goal is
  about the product surface, not about operations: the sync pipeline's failure alerting to
  the operator (above) is explicitly in scope and sends nothing to visitors.
- User accounts, authentication, or any storage of personal data
- Comments, ratings, or social features
- Any editorial layer: commentary, summaries, rankings, or highlighting of particular
  councillors or political blocs

## Capabilities

### New Capabilities

- `source-sync`: polite incremental fetching of the HCD listing and PDFs, local archive
  cache, checksum/drift handling, `robots.txt` halt condition, sync-status recording.
- `document-metadata`: listing-derived `doc_id`/number/`expediente`/year/title/`doc_type`
  with a defined no-fabrication fallback for undescriptive entries.
- `text-extraction`: PDF text-layer extraction; `no_text` marking for scanned documents.
- `ordinance-search`: full-text search plus year and type filters, result excerpts,
  explicit marking of metadata-only records.
- `ordinance-detail`: per-document page at `/documento/{doc_id}` with metadata, type label,
  extracted text, official PDF link.
- `cross-references`: detection and bidirectional linking of ordinance-to-ordinance
  references, resolved only against known manifest entries.
- `provenance-and-staleness`: last-synchronised date, configurable staleness threshold and
  out-of-date notice, unofficial-tool disclaimer, footer attribution.

### Modified Capabilities

None — greenfield repository, `openspec/specs/` is empty.

## Approach

Stated approach carried forward from exploration; **not yet a locked design**.

- **Ingestion (Python).** A pipeline using `PyMuPDF` for text extraction. Politeness,
  archive/checksum and manifest patterns are **ported — never imported** — from
  `/Users/nicolasmateoippoliti/dev/votus-plataforma-lla`
  (`etl/etl/{archive,manifest,http_client}.py`, `etl/etl/ingest/pba.py`). No dependency on
  that repository is created.
- **Data hand-off.** Committed JSON: `data/manifest.json` (one record per document, keyed
  on `doc_id`: nullable number, `doc_type`, `expediente`, year, title, source URL, sha256,
  fetched_at, `status: ok|error|no_text`, cross_references) plus per-document text bodies,
  a sync-status record (`last_run_at`, `last_run_status`, documents added), and an
  append-only `doc-id-aliases.json` so a published URL never dies. Flat JSON contract, no
  shared runtime between pipeline and site.
- **Site (Astro, static output).** 1,038 generated `/documento/{doc_id}` pages via
  `getStaticPaths`, plus one static redirect page per alias, zero client JS by default,
  reading the committed JSON at build time.
- **Search (Pagefind).** Static chunked index built by crawling the generated HTML;
  built-in Spanish stemming and diacritic handling; small per-query mobile payload.
- **Automation.** GitHub Actions cron (weekly) runs incremental sync, commits the data
  diff, and triggers the static rebuild/deploy on a free static host.

**Deviation flagged for user override at design time.** Astro deviates from the
workspace's Next.js house default. Justification: these are 1,038 mostly-static pages with
one small interactive widget, and Next.js App Router static export ships more client JS by
default, working against the mobile-usability acceptance criterion. This is a payload
argument, not a stack preference — the user may overrule it in `sdd-design`.

### How the approach satisfies each hard constraint

| Constraint | Satisfied by |
|---|---|
| Zero variable cost | Static hosting free tier + pre-built index; GitHub Actions free tier on a public repo; no per-request paid call anywhere |
| No backend/DB/accounts/personal data | Static output + committed JSON only; nothing collected, so Ley 25.326 obligations do not arise |
| Maintenance < 15 min/week | Cron-driven incremental sync; only new documents fetched; rebuild is automatic on data commit |
| Fail visibly | `last_run_status` in committed data drives the always-visible sync date and the threshold-based "archive out of date" notice; `halted` is a distinct recorded state |
| Strict neutrality | Official documents only, zero editorial layer; descriptive cross-reference linking only; discreet footer attribution |
| OCR out of scope | Non-text PDFs marked `no_text`, indexed by metadata, shown as having no indexed text |
| Polite crawling | Single concurrency, enforced delay, identifying UA with contact URL, local cache, bounded retries, `robots.txt` re-checked each run with HALT + escalate on 200 |

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `pipeline/` (Python) | New | Fetch, politeness, archive/manifest, PDF text extraction, cross-reference detection |
| `data/` | New | Committed `manifest.json`, per-document text JSON, sync status, `doc-id-aliases.json` |
| `site/` (Astro) | New | Listing, search UI, 1,038 detail pages plus alias redirects, provenance/disclaimer/footer |
| `.github/workflows/` | New | Weekly cron sync + build/deploy |
| `openspec/config.yaml` | Modified | Fill `test_command` / `build_command` once the toolchain lands |
| `/Users/nicolasmateoippoliti/dev/votus-plataforma-lla` | Read-only reference | Patterns ported, never imported; no dependency created |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Source reorganises its URLs | Med | Sync recovers by re-reading the listing; never assumes stable paths |
| `robots.txt` starts returning 200 | Low | Halt, record `last_run_status: halted`, escalate; do not continue crawling |
| Listing metadata inconsistent (~19% of corpus) | High | Documented fallback; never fabricate a title |
| Ordinance number is not unique (942 distinct numbers across 984 numbered files) | Confirmed | Identity is `doc_id`, not `number`; same-number records are kept as variants |
| A source filename change moves a public URL | Med | Append-only `doc-id-aliases.json` plus generated static redirects; an alias with a missing target fails the build |
| Cross-reference false positives | Med | Only render a link when the number resolves in the manifest; store matched excerpt for spot-check |
| Committed text bodies bloat the repo | Med | Measure real size before locking commit-to-git vs. fetch-at-build |
| Perceived political bias | Med | No editorial content whatsoever; discreet footer attribution only |
| Astro/Pagefind unverified against this corpus profile | Med | Small spike in `sdd-design` before locking the stack |
| Corpus grows over time | Low | Incremental sync; index rebuild stays cheap |

## Open Decisions — still needed, deliberately not invented here

1. **Commit text bodies to git vs. fetch at build time** — pending a real size measurement
   of the ~870 extracted text bodies.
2. **Sync via direct commit to `main` vs. PR-gated** — including token/secret handling for
   the Actions writer identity.
3. ~~**Concrete fallback rule for the ~19% of filenames without a usable descriptive
   title.**~~ Resolved in `design.md` D4: listing anchor text, then filename slug, then
   `null`. Never fabricated.
4. **Cross-reference precision strategy** — matched ordinance numbers MUST resolve against
   the known manifest; unresolvable numbers MUST never render as links. Exact pattern set
   and confidence handling to be fixed in spec/design.
5. **Transactional email provider for operator escalation to `hcd@fragua.dev`** — must be a
   free tier whose cost cannot scale with site traffic (alert volume is bounded by the
   weekly schedule, not by visitors). Includes SMTP/API credential storage as an Actions
   secret and confirmation that the `hcd@fragua.dev` mailbox exists and is monitored.

## Rollback Plan

- Site: revert the deploy to the previous static build; the archive is immutable content,
  so rollback is a redeploy with no data migration.
- Data: `data/` is committed to git — `git revert` the offending sync commit restores the
  prior manifest and text bodies exactly.
- Sync: disable the scheduled workflow. The site keeps serving the last good data and will
  surface the "archive out of date" notice once the threshold elapses — degraded, honest,
  and never silently stale.
- Whole change: greenfield repository, so full abandonment costs nothing beyond the repo.

## Dependencies

- Public availability of `hcdrosales.gob.ar` and its single listing page.
- A free static host with git-push-triggered builds.
- GitHub Actions free tier on a public repository.
- Read-only access to the votus reference repo for pattern porting (no runtime dependency).

## Success Criteria

- [ ] All 1,038 documents discoverable by number, year, `expediente`, title and type.
- [ ] Every document's type is visible in search results and on its detail page, so a
      convenio can never be read as an ordinance.
- [ ] Every previously published document URL still resolves after a `doc_id` change.
- [ ] A full-text query returns results from the text-bearing subset with a usable excerpt.
- [ ] Documents without a text layer appear in metadata results, explicitly marked.
- [ ] Every result links to the official PDF at `hcdrosales.gob.ar`.
- [ ] The last-synchronised date is visible on the page.
- [ ] After the configurable threshold (default 30 days) without a successful sync, an
      explicit "archive out of date" notice is shown; the last *attempt* status is not
      surfaced to end users.
- [ ] A re-run of the sync downloads only documents not already archived.
- [ ] The deployed site issues no per-user or per-request paid calls of any kind.
- [ ] The site is usable on a mobile phone.
- [ ] Attribution appears only as a discreet footer credit linking to Fragua; no header
      brand, no logo over the archive.
- [ ] Cross-references render as bidirectional links only for numbers resolvable in the
      manifest.
- [ ] User-facing copy is Spanish (neutral, professional); code, commits and docs English.
- [ ] A halted or persistently failing sync run escalates to the repository owner via
      GitHub workflow-failure email and via email to `hcd@fragua.dev`, with no
      visitor-facing messaging of any kind.
- [ ] WCAG 2.1 AA: keyboard navigable, visible focus, semantic HTML, adequate contrast.
