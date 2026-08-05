# ordenanzas-hcd

A free, unofficial, static archive of the ordinances and related documents
published by the Honorable Concejo Deliberante (HCD) of Coronel Rosales,
Buenos Aires, Argentina. Not affiliated with the HCD; the authoritative
document is always the PDF hosted at `hcdrosales.gob.ar`.

See `BRIEF.md` for why this exists and
`openspec/changes/searchable-ordinance-archive/design.md` (decisions
D1–D13) for the full architecture and rationale. `AGENTS.md` records the
review rules this repository is held to.

## Layout

Two programs joined by committed JSON, no backend, no database, no user
accounts:

| Path | Holds |
| --- | --- |
| `pipeline/` | Python ingestion pipeline (`hcd-sync`): fetches the HCD listing, archives PDFs, extracts text, writes `data/**` |
| `site/` | Astro static site: one page per document, search, provenance and staleness notices |
| `data/` | Committed pipeline output (manifest, per-document text, sync status, aliases, unresolved entries) |
| `archive/` | Per-run scratch space for fetched PDFs — not committed |
| `.github/workflows/` | `sync-and-deploy.yml` (weekly sync + deploy) and `ci.yml` (test/build/actionlint on every PR) |
| `.github/scripts/` | `commit-and-push-data.sh` — the only thing allowed to commit `data/` |
| `openspec/` | Proposal, design, specs and tasks for this project's changes |

## Deliberate architectural deviation: Astro, not Next.js

**This is the only non-Next.js frontend in the Fragua workspace, and that
is a documented, deliberate choice, not drift.**

`site/` is built with Astro rather than Fragua's house default, Next.js
with static export (design.md D1). The deciding factor: Next.js static
export pays the cost of App Router complexity — routing, the client
runtime, hydration boundaries — while disabling every feature that
complexity exists to serve (ISR, image optimization, middleware all no-op
under `output: 'export'`). Astro ships 0 KB of baseline JavaScript on a
detail page against Next's ~80–95 KB gzipped runtime even for a fully
static page, and pairs cleanly with Pagefind's post-build crawl
(`dist/` is plain HTML; `out/` carries `.rsc`/hashed-chunk payloads a
crawler has to be told to skip), which is central to this product's
search feature.

What this costs, stated plainly: a future maintainer coming from
`03-proyectos/` context-switches frameworks. `.astro` components do not
transfer to client projects, and there is no shared config, lint, or
component reuse with the rest of the workspace. This is accepted. It is
**overrulable by the product owner at zero design cost** — the swap
touches only `site/`; the JSON contract in `data/`, the pipeline, and the
sync/deploy workflow are unaffected either way.

## Non-negotiables

Full detail in `AGENTS.md`, summarized:

- **Zero variable cost.** Nothing in the running system scales in price
  with traffic.
- **No fabrication.** Titles, numbers, years, `expediente` and document
  types are transcribed or marked absent — never inferred or guessed.
- **Strict political neutrality.** Documents only, no commentary or
  ranking; cross-references render undirected.
- **Fail visibly.** Stale or missing data is shown, never silently
  papered over.
- **Politeness toward the source.** Single concurrency, ≥4s between
  requests, an honest `User-Agent`, bounded retries, and a `robots.txt`
  check that halts the run if it ever returns 200.

## Development

```bash
# pipeline
uv run --directory pipeline pytest -q
uv run --directory pipeline ruff check src tests
uv run --directory pipeline mypy src

# site
pnpm --dir site run test
pnpm --dir site run check
pnpm --dir site run build
```

Both gates together, exactly as CI runs them:

```bash
uv run --directory pipeline pytest -q && pnpm --dir site run test
uv run --directory pipeline ruff check src tests && uv run --directory pipeline mypy src && pnpm --dir site run check && pnpm --dir site run build
```

## Operations

The sync runs weekly via `.github/workflows/sync-and-deploy.yml`
(`workflow_dispatch` also available for a manual run). On a halt
(`robots.txt` returned 200) or exhausted retries, the operator is
notified two ways: GitHub's built-in workflow-failure email (the
unconditional fail-safe) and, when `RESEND_API_KEY` is configured, an
email to `hcd@fragua.dev` via `pipeline/src/hcd_sync/notify.py`. Neither
notifier is ever visible to a site visitor.
