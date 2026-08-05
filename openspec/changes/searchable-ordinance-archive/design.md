# Design: Searchable Ordinance Archive

> Phase: `sdd-design` · Change: `searchable-ordinance-archive`
> Artifacts in English. Site copy is Spanish; Spanish strings below are quoted examples.

## Technical Approach

Two independent programs joined by a committed, versioned JSON contract.

1. **`pipeline/` (Python)** — polite incremental sync of `hcdrosales.gob.ar`, filename
   metadata extraction, PyMuPDF text extraction, cross-reference detection. Fetch /
   sha256 / manifest / drift / politeness patterns are **ported, never imported**, from
   `votus-plataforma-lla` (`etl/etl/{archive,manifest,http_client,storage}.py`,
   `etl/etl/ingest/pba.py`). No dependency on that repo is created.
2. **`data/` (committed JSON)** — `manifest.json`, `documents/{doc_id}.json`,
   `sync-status.json`, `doc-id-aliases.json`, `unresolved-references.json`,
   `unresolved-listing-entries.json`. This is the only interface.
3. **`site/` (Astro, static output)** — one `getStaticPaths` detail page per manifest
   record (1,038 — see Measured source facts) + Pagefind
   static index, reading `data/` from the filesystem at build time.
4. **`.github/workflows/sync-and-deploy.yml`** — one weekly workflow, two jobs: sync
   (commits `data/`) then build+deploy to Cloudflare Pages.

The pipeline never runs in the request path. The site never makes a network call the
visitor pays for. Nothing in the running system is metered.

---

## Measured source facts

One live fetch of the listing was performed on **2026-08-04**. Everything in this section
is measurement, not estimate, and it supersedes any assumption made earlier in this design.
Nothing here was re-fetched; the captured HTML is committed as an offline test fixture
(see `tasks.md` 2.0) so `listing.py` is developed and tested without touching the live
government host again.

| Fact | Measured value |
|---|---|
| Listing URL (previously unknown) | `https://hcdrosales.gob.ar/?lsvr_document_cat=ordenanzas` |
| `robots.txt` | HTTP 404 — no crawl restriction, so no HALT |
| Listing response | HTTP 200, 1,182,351 bytes, single page, no pagination |
| PDF links | exactly **1,038** |
| Distinct ordinance numbers | **942** across 984 numbered files |
| Entries with no leading number (filename) | **52** |
| Entries with no leading number (anchor text) | **54** |
| Anchor-text shape | 843 number+title · 141 number-only · 54 no leading number |
| Anchor texts carrying accents the filename slug lost | **193** |
| Corpus number range | **1999–4457** |

**Markup.** The site runs a WordPress `lsvr_document` post type. Each entry is:

```html
<li class="post-tree__item post-tree__item--file">
  <a class="post-tree__item-link post-tree__item-link--file"
     href="https://hcdrosales.gob.ar/wp-content/uploads/YYYY/MM/<filename>.pdf"
     target="_blank">4457 &#8211; Mesa de Gestión del Agua</a>
</li>
```

Entries are nested inside `<ul class="post-tree__children post-tree__children--level-N">`.
This is a **hierarchical tree**, not the flat list this design previously assumed. See D9.

**The anchor text carries the real title, with accents; the filename slug does not.**
Anchor `4457 – Mesa de Gestión del Agua` (en-dash U+2013, HTML-escaped `&#8211;`) versus
slug `4457-Mesa-de-Gestion-del-Agua.pdf`. WordPress strips accents when it builds the slug.

**`number` is not unique.** 44 numbers occur twice through WordPress re-upload collisions
(`3296.pdf` + `3296-1.pdf`; `3428-Registro-dadores-voluntarios-de-sangre.pdf` and the same
name with a `-1` suffix). Separately, all 1,038 hrefs are **distinct URLs**, but the
filename *stems* are not: `3298.pdf` and `3299.pdf` each appear under two different upload
months (`/uploads/2021/11/3298.pdf` and `/uploads/2021/12/3298.pdf`), so 1,038 URLs yield
only **1,036 distinct stems**. See D7 for how the two collisions are resolved.

**The `/uploads/YYYY/` path segment is upload date, not sanction date.** Histogram:
2021 = 631, 2022 = 148, 2023 = 56, 2024 = 126, 2025 = 56, 2026 = 21. 61% sits under 2021
because of the bulk historical upload. See D10.

**The `ordenanzas` category contains non-ordinance documents:** 24 Convenios, plus
Resoluciones, Decretos, Anexos, Preparatorias, and expediente-coded files. Real filenames:
`Convenio.pdf`, `Convenio-Ministerio-de-las-Mujeres.pdf`, `Calle-Irigoyen.pdf`, `RP0107.pdf`,
`Preparatoria.pdf`, `ANEXO-I-ESPECIES-EMBLEMATICAS-.pdf`,
`Resolucion-053-2021-Informes-escuela-18.pdf`,
`Dec.-377-Promulga-Ordenanza-3288-D-417-11.doc.pdf`,
`O62025-Exime-tasas-afectados-temporal-marzo.pdf`, `P112023-Tarifa-Taxis.pdf`,
`S292022-apertura-urquiza-y-colon.pdf`, `DOTACION-PLANTA-PERMANENTE-2026.pdf`. See D8.

### Where the measurements contradict BRIEF.md

`BRIEF.md` is the product owner's document. **It was not edited.** The discrepancies are
recorded here instead, and this design follows the measurements.

| BRIEF.md states | Measurement says | Consequence |
|---|---|---|
| Range "Ordinance 3263 (2011 budget) through 4457" | Range is **1999–4457**; `1999-Codigo-de-Faltas-ultima.pdf`, 2358, 2835 and 3059 all precede 3263 | Any numeric plausibility window keyed on 3263 would be wrong. D5 already rejects such a window; this measurement confirms that call rather than softening it |
| Filename split 839 (81%) / 144 (14%) / 55 (5%) | **Anchor-text** split 843 / 141 / 54; **filename** split has 52 with no leading number | The BRIEF's split is over filenames; the design now derives titles from anchor text, whose split differs slightly. Both are recorded; neither is a percentage the code depends on |
| Implies `number` identifies a document | 984 numbered files → only 942 distinct numbers | `number` cannot be the primary key. See D7 |
| Total 1,038 PDF links | Confirmed: exactly 1,038 links, all with **distinct URLs** — but only 1,036 distinct filename stems | Every one of the 1,038 is a record; two of them need a disambiguated `doc_id` (D7). Nothing may assume stem uniqueness |

---

## Architecture Decisions

### D1 — Site generator: Astro, not Next.js static export

**Verdict: uphold Astro. The exploration's call stands, but the payload argument alone
is not what settles it.**

| | Astro static | Next.js `output: 'export'` |
|---|---|---|
| Baseline JS on a detail page | 0 KB | React + App Router runtime, ~80–95 KB gz even for a fully static page |
| Pagefind pairing | `dist/` is clean HTML; `pagefind --site dist` is a documented one-liner | `out/` carries `.rsc`/`.txt` flight payloads and hashed chunks that the crawler must be told to skip |
| Features gained by choosing it | — | ISR, image optimization, middleware — **all disabled under static export** |
| Workspace familiarity | None — first non-Next.js frontend at Fragua | House default |

The payload delta (~90 KB gz) is real but on its own would be a weak argument. The
deciding factor is that Next.js static export costs App Router complexity while
disabling every feature that complexity exists to serve, and adds friction to the
Pagefind post-build crawl that is central to this product.

**What is lost, stated plainly:** this becomes the only non-Next.js frontend in the
Fragua workspace. A future maintainer context-switches. `.astro` components do not
transfer to client projects. There is no shared config, lint, or component reuse with
`03-proyectos/`. This is accepted as a documented, deliberate cost and MUST be recorded
in the repo `README.md` so it is never mistaken for drift. **Overrulable by the product
owner at zero design cost** — swapping to Next.js static export changes only `site/`;
the JSON contract, the pipeline, and the workflow are unaffected.

### D2 — Commit text bodies to git (default), with a measured escape hatch

**Choice: commit `data/documents/{doc_id}.json` to git.**

No corpus measurement exists and none is invented here. The estimate, with arithmetic:

- Typical municipal ordinance ≈ 1–3 pages ≈ 2–4 KB of plain text. Conservative mean:
  **6 KB** (absorbing long budget/tariff ordinances).
- 870 text-bearing documents × 6 KB = **5.2 MB** raw.
- JSON envelope + escaped newlines, UTF-8 with `ensure_ascii=False`: +10% → **~5.7 MB**
  working tree.
- Git zlib on prose ≈ 3–4× → **~1.5–1.9 MB** added to the packfile on initial import.
- Growth: 1,038 docs over ~15 years ≈ 69/year ≈ **1.3/week** ≈ 8 KB/week ≈ **~400 KB/year**
  raw, well under 150 KB/year packed.

**MEASURED TWICE. Decision locked: commit to git.**

A first pass over a 50-document limited sync projected 3.61 MB. The full 1,038-document
import then produced the real figure: **894 text bodies totalling 7.57 MB**, mean 8,465 B,
p95 13,051 B, max 708,254 B. The projection was **2.1x low**, exactly because `--limit 50`
takes listing order and the listing is reverse-chronological, so it sampled the 50 newest
documents. Recorded here rather than quietly replaced: a sampling bias that survives into a
decision is worth naming, and this one would have been invisible if the full import had not
been measured again.

The decision is unchanged and unthreatened — 7.57 MB is still **6.6x under** the 50 MB
threshold, and git packs prose several times over. Corpus growth is ~1.3 documents a week.

**The outliers are the fiscal ordinances, and they matter for the page budget.** Nine
documents carry more than 50 KB of extracted text — an earlier count of eleven measured the
committed JSON file size, envelope included, rather than the `text` field itself; the
largest,
`4270-D-138-2023-Fiscal-e-Impositiva-2024`, is **207 pages and 692 KB of text**, rendering to a 703 KB page that
gzips to 189 KB — measured, and close to the 180 KB predicted. The other four in
the top five are the same document from other years. That single page would ship ~180 KB
gzipped, more than the Next.js baseline D1 rejected. Truncation is not an option — the full
body is what `data-pagefind-body` indexes, and a resident looking up a tariff needs the
tariff. Slice 4a decides how those eleven pages are rendered so the other 1,027 do not pay
for them.

**Decision rule (thresholds):**

| Projected total | Decision |
|---|---|
| ≤ 50 MB | Commit to git — as designed |
| 50–250 MB | Still commit; drop `indent` from the per-document writer and stop committing `pages`/`extractor` per doc |
| > 250 MB, or any single file > 50 MB | Move `data/documents/` to a GitHub **Release asset** fetched at build time (release assets are unmetered on public repos). **Never git-lfs** — LFS bandwidth is metered, which would breach zero-variable-cost |

**Exact one-line measurement `sdd-apply` MUST run first** (after slice 3 has archived a
sample of ≥50 PDFs into `archive/`, before locking the writer):

```bash
python -c "import fitz,glob,math,random,statistics as st; f=sorted(glob.glob('archive/*.pdf')); random.seed(0); f=random.sample(f,min(50,len(f))); a=[sum(len(pg.get_text().encode('utf-8')) for pg in fitz.open(p)) for p in f]; s=sorted(x for x in a if x>0); print('n',len(a),'n_text',len(s),'no_text',len(a)-len(s),'mean_bytes',round(st.mean(s)),'p95',s[math.ceil(.95*len(s))-1],'max',s[-1],'projected_total_MB',round(st.mean(s)*870/1e6,2))"
```

Four things in that command are deliberate, because the obvious version of it understates
the projection by ~19% — in a check whose entire job is to catch an *underestimate*:

- **`.encode('utf-8')`** — `page.get_text()` returns a `str`, so `len()` counts characters.
  Spanish legal prose runs ~3% larger in UTF-8 (`º` in `Artículo 1º` alone is structural).
- **`random.sample` with a fixed seed** — ordinance numbers are uniformly four digits, so
  lexicographic sort equals numeric sort and `sorted(...)[:50]` would deterministically
  take the 50 *oldest* documents: exactly the 2021 bulk-historical block that BRIEF.md says
  carries all of the non-extractable 16%. The seed keeps it reproducible.
- **`x > 0` filter plus a printed `no_text` count** — the mean must be taken over
  text-bearing documents only, because it is multiplied by 870, the count of text-bearing
  documents. Averaging in the zeros is a denominator mismatch worth ~11% on its own.
- **`math.ceil` and `max`** — true nearest-rank p95 (`int(.95*n)-1` lands on p94 at n=50),
  and `max` because the decision table's "any single file > 50 MB" clause otherwise has no
  measurement behind it at all.

**Why this default is safe under either outcome:** a 10× estimation error (57 MB) still
lands inside the "commit" band, and the escape hatch is a swap inside one module,
`site/src/lib/data.ts`, with **no change to the JSON contract**. The alternative default
(fetch-at-build) is actively worse: it puts a network dependency inside the build, so a
silent fetch failure could ship a site whose pages are missing their text — the exact
failure mode the "fail visibly" constraint forbids — and it destroys the public-audit
property of the sync commits.

### D3 — Sync commits directly to `main`, using `GITHUB_TOKEN`, with no stored secret

**Choice: direct commit to `main`. No PR, no PAT, no deploy key.**

| Option | Verdict |
|---|---|
| Direct commit, `GITHUB_TOKEN` | **Chosen.** Token is minted per run, scoped by `permissions:`, expires with the job. Nothing is stored, so nothing can leak from a public repo |
| PR-gated + auto-merge | Rejected: puts a human in the weekly loop, which is precisely the cost the <15 min/week constraint forbids. The review value is retrospective and already available from `git log` on a public repo |
| Personal Access Token / deploy key | Rejected: a long-lived credential stored for a job that a scoped ephemeral token already covers |

- Writer identity: `github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>`.
  Canonical bot identity; no personal email enters the public history.
- Job-level `permissions: { contents: write }`; the workflow's default token permission
  stays read-only.
- **Load-bearing gotcha #1:** commits pushed with `GITHUB_TOKEN` do **not** trigger
  downstream `push`-triggered workflows. The deploy therefore MUST be a second job in the
  same workflow (`needs: sync`), never a separate `push`-triggered workflow. Getting this
  wrong produces a site that silently never rebuilds.
- **Load-bearing gotcha #2, same root cause, opposite end.** Job 2 runs on a fresh runner
  and does its own checkout. For a `schedule` / `workflow_dispatch` event, `github.sha` is
  the default-branch head pinned at **workflow-run creation**, and it does not advance when
  job 1 pushes. `actions/checkout` with no `ref` sets both `ref` and `commit`, and the
  presence of `commit` makes the fetch refspec `+<pinned-sha>:refs/remotes/origin/main` —
  so the runner's `origin/main` is force-set to the **pre-sync** commit and a plain
  `git fetch` does not recover it. Job 2's checkout MUST therefore be explicit:

  ```yaml
  - uses: actions/checkout@v4
    with: { ref: main }
  ```

  Without it the deploy ships the previous run's `data/` — including a permanently
  one-week-stale `sync-status.json`, which is precisely the file the staleness notice
  depends on. The failure is silent and permanent, not self-correcting: every run commits
  (`if: always()`), so every deploy would be exactly one cycle behind, forever.
- `concurrency: { group: sync, cancel-in-progress: false }`; push uses an explicit
  refspec `git push origin HEAD:main` with a single `git pull --rebase` retry on
  non-fast-forward, then fail loudly.
- Only `git add data/` — never `git commit -a`. An empty index skips the commit and
  exits 0.

### D4 — Title source: listing anchor text first, filename second, `null` third

**Choice: `title` is `string | null`. It is never synthesized, under any circumstance.**

**Revised by measurement.** This decision previously read the title out of the filename
slug and claimed the slug preserved "original casing and accents". **That claim was
wrong.** WordPress strips accents when it generates the slug: the source publishes
`4457 – Mesa de Gestión del Agua` in the anchor and `4457-Mesa-de-Gestion-del-Agua.pdf`
as the file. There are no accents in the slug to preserve — 193 of 1,038 titles lose at
least one. **The listing anchor text is what actually carries the accented title**, and it
is now the primary source.

Priority, first hit wins:

1. **Listing anchor text**, HTML-entity-unescaped, with a leading ordinance number and its
   separator stripped (`4457 – Mesa de Gestión del Agua` → `Mesa de Gestión del Agua`).
   The separator is an en-dash U+2013 in the corpus, escaped as `&#8211;`; the stripper
   MUST accept `-`, `–`, `—` and `:` with surrounding whitespace, and MUST strip only when
   the leading token is the record's own number. `title_source: "listing"`.
2. **Filename slug** with `-` → space, taken verbatim otherwise: original casing preserved,
   no title-casing, no expansion, no translation, and **no accent restoration** — the
   accents are simply not there, and inventing them would be fabrication.
   `title_source: "filename"`.
3. `title: null`, `title_source: "none"`.

A candidate at steps 1 or 2 qualifies only if, after stripping the leading number, it
contains ≥1 alphabetic token of ≥3 characters. This rejects `4390-I232025.pdf` and
number-only entries (141 by anchor text). `title_source` is therefore
`"listing" | "filename" | "none"`.

**The no-fabrication rule is unchanged and still absolute.** Never synthesize a title,
never derive one from body text. **Explicitly rejected: deriving a title from the first
line of the extracted body.** The body's opening (`Artículo 1º: MESA DEL AGUA: Créase…`)
looks tempting and is fabrication by heuristic — choosing which fragment is "the title" is
an editorial act the source did not perform. It stays rejected even though it would raise
coverage. Reading the anchor text is not the same act: the anchor is a title the HCD itself
published next to the link, transcribed verbatim.

**Exact UI behaviour when `title` is null** (Spanish copy, neutral register):

| Surface | With title | Without title |
|---|---|---|
| Detail `<h1>` | `Ordenanza 4457 — Mesa de Gestión del Agua` | `Ordenanza 4457` |
| Below the `<h1>` | — | muted line: `Sin título descriptivo en el archivo de origen.` |
| Search result / list card | `Ordenanza 4457 — …` | `Ordenanza 4457` + the same muted line |
| `<title>` / OG | same as `<h1>` | `Ordenanza 4457` |

`Ordenanza {number}` is an identifier occupying the title slot, not a substitute title.
The words `Sin título` never appear as if they were the document's name. For a record whose
`doc_type` is not `ordenanza`, the identifier in that slot is the type label instead — see
D8 — so a convenio never renders as `Ordenanza …`.

### D5 — Cross-reference pattern set and manifest-gated rendering

Number token:

```
NUM  = (?:N[°ºo]?\.?\s*)?(\d{1,2}\.\d{3}|\d{3,4})(?!\d)
NOUN = \bordenanzas?\b\s*(?!(?:general|generales|provincial|nacional)\b)(?:municipal\s*)?
```

Matching is case-insensitive and accent-tolerant. The captured number is normalised by
stripping `.` before manifest resolution.

Three properties of `NUM` are load-bearing and each has a test:

- **Trailing-digit guard `(?!\d)`.** Without it, `\d{3,4}` matches greedily and truncates
  a longer digit run to its first four: `Ordenanza 44571` would capture `4457`, which
  *does* resolve against the manifest and would render a link the document never made.
  With the guard, a 5+ digit run matches nothing at all.
- **Thousands separator.** The corpus writes numbers with a dot (`Punta Alta, 27 de enero
  de 2.026` in the BRIEF's own extract), so `Ordenanza Nº 3.351` must match. `\d{3,4}`
  alone cannot span the separator and would silently miss it.
- **No plausibility window.** See the manifest-resolution rule below.

| ID | Pattern | Source |
|---|---|---|
| P1 | `\b(?:modifica|modifícase|deroga|derógase|incorpora|incorpórase|sustituye|sustitúyese|complementa|amplía|prorroga|prorrógase|ratifica|deja sin efecto)\b[^.\n]{0,120}?NOUN NUM` | title + body |
| P2 | `NOUN NUM` | title + body |
| P3 | enumeration tail immediately following a P1/P2 hit, scanned with `finditer` over `(?:,|y)\s*(?:N[°ºo]?\.?\s*)?(\d{1,2}\.\d{3}|\d{3,4})(?!\d)` — catches `Ordenanzas 3351, 3402 y 3500` | title + body |

**P3 must be scanned, not repeated.** A single repeated group — `(?:…(\d{3,4}))+` — keeps
only the **last** repetition in Python's `re`, so `Ordenanzas 3351, 3402 y 3500` would
yield `3500` and silently drop `3402`. The tail region is therefore isolated first and
then iterated with `finditer`. This is a required test case.

**Hard negatives (each is a required test case):**

- `Incorpora artículo 169 bis a la Ordenanza 1999` → captures **1999 only**. P1's
  non-greedy gap is anchored on the literal `ordenanza`, so the article number can never
  enter the capture group. This is the BRIEF's own example and is the regression test.
- `Ordenanza General 267`, `Ordenanza Provincial …` → excluded by the negative lookahead
  carried in `NOUN`. These are provincial norms, not HCD ordinances. The lookahead is
  written explicitly rather than relied on implicitly: `NOUN` requires digits immediately
  after the noun, which already excludes them today, but that is incidental and would
  break the moment the noun pattern is widened.
- `Ordenanza 44571`, `Ordenanza 44572026` (an OCR-joined `NNNN/YYYY`) → no match, via the
  trailing-digit guard.
- Self-reference (including the sanction header `O R D E N A N Z A 4457` after whitespace
  normalisation) → dropped by discarding any candidate equal to the document's own number.

**Measured on the full corpus, 2026-08-05.** 751 references were detected: **421 resolved
and became links, 330 did not**. Zero of the 330 point to a number that exists in the
manifest, so the gate is behaving exactly as specified — the unresolved half is not a
detection defect, it is the source's own incompleteness. The HCD publishes 943 distinct
ordinance numbers across a range spanning 2,459 (1999–4457), i.e. **38% of the number
space**. An ordinance can and does cite an ordinance the HCD never put online.

That is why the rule below is stated as resolve-or-do-not-link rather than as a coverage
target. A visitor will see reference numbers in the body text that are not links; that is
the truth, and inventing a link to a document this archive does not hold would be worse
than the gap it papers over.

**Manifest-resolution rule — the single highest-leverage precision control:** a candidate
renders as a link **only** if its number resolves to **at least one** manifest entry whose
status is `ok` or `no_text`. Unresolvable numbers are written to
`data/unresolved-references.json` for operator spot-check and are **never rendered as
links**, never fuzzy-matched, never guessed. They remain visible as prose wherever they
occur inside the extracted text — the document's own words are never altered — they simply
never become a link and never enter the `Ordenanzas relacionadas` list.
A numeric plausibility window is deliberately **not** applied: manifest resolution already
subsumes it, and a hardcoded window would silently become wrong as the corpus grows. The
measurement makes this concrete — a window keyed on BRIEF.md's stated floor of 3263 would
have discarded every real reference to `Ordenanza 1999`, which is both in the corpus and
the design's own worked example.

**A resolved reference may target more than one record.** D7 makes `number` a non-unique
attribute: 44 numbers carry two records each. Resolution is therefore
`number → set of doc_id`, never `number → doc_id`, and the target set is **never**
narrowed by picking a "best" record — choosing between two documents the HCD published
under the same number is an editorial act. See D7 for what renders.

**Rendering is undirected — settled, not reopened.** The pipeline stores directed
evidence; the site collapses it. At build time, over `doc_id`:
`related(d) = { e : e ∈ refs(d) } ∪ { e : d ∈ refs(e) }`, deduplicated, sorted by
`(number, doc_id)` with `number: null` records last.
Rendered under one heading, `Ordenanzas relacionadas`, as plain links with no verb, no
arrow, no direction, and no `signal` label shown. The stored `excerpt` and `signal` exist
for operator spot-checking only and are never displayed.

### D6 — Operator escalation email: Resend on a dedicated subdomain

**Choice: Resend HTTP API, sending from `bot@fragua.dev` to `hcd@fragua.dev`.**

**CORRECTED 2026-08-05 against the real zone.** This decision originally specified a
dedicated `alerts.fragua.dev` sending subdomain, to avoid disturbing the apex SPF that
Cloudflare Email Routing already uses. Measured, that concern does not exist: Resend
isolates its return-path in `send.fragua.dev`, with its own MX
(`feedback-smtp.sa-east-1.amazonses.com`) and its own SPF (`include:amazonses.com`), and
never touches the apex TXT. The apex still reads `v=spf1 include:_spf.mx.cloudflare.net
~all` with Resend fully verified alongside it, and the apex MX still points at Cloudflare
Email Routing for receiving. One verified domain instead of two, which is also what the
owner already runs for everything else.

The subdomain would not merely have been redundant: `bot@alerts.fragua.dev` is not a
domain Resend has verified, so every send would have failed with a 403 — and only on the
day an alert was actually needed.

| Option | Verdict |
|---|---|
| **Resend** free tier (3,000/mo, 100/day), one API key | **Chosen.** Single secret, plain HTTPS POST, no SMTP client in the pipeline. Volume is bounded by a weekly cron (≤5 alerts/mo), so the free tier can never be approached and cost is structurally traffic-independent |
| Brevo / SMTP free tier | Rejected: three secrets (host, user, pass) instead of one, and an SMTP client to maintain |
| Amazon SES | Rejected: metered against a billing account. Even at a volume that rounds to zero, it muddies the zero-variable-cost audit trail |
| GitHub failure email only | Insufficient alone (see below) — but retained as the fail-safe layer |

**DNS, given the verified state of `fragua.dev`:** the apex already carries Cloudflare
Email Routing MX records and an SPF record. Resend requires its own SPF/DKIM. **Do not
touch the apex records** — verify the sending domain as the subdomain
`alerts.fragua.dev` (its own MX/SPF/DKIM TXT under `alerts.`), leaving apex inbound
routing to `hcd@fragua.dev` untouched. Both DNS zones are already at Cloudflare.

**Credential handling:** `RESEND_API_KEY` lives only as a repository Actions secret,
injected as an env var into the notify step. It is never written to a file, never
interpolated into a `run:` string, never echoed. `pipeline/src/hcd_sync/notify.py` reads
`os.environ` and, on provider error, logs the HTTP status only — never the request
headers or body.

**Unconfirmed mailbox — handled, not assumed.** `hcd@fragua.dev` has verified MX and SPF
at the domain level, but the address itself is **not confirmed to exist and route**.
`sdd-apply` MUST, as an explicit task: (a) confirm/create the Cloudflare Email Routing
rule for `hcd@` to a monitored mailbox, and (b) send one live test alert and confirm
receipt, before the escalation path is marked done. Until confirmed, escalation is
recorded as degraded to GitHub's built-in notification.

**Fail-safe, unconditional:** on `halted` or exhausted retries the job **always** exits
non-zero, so GitHub's built-in workflow-failure email to the repository owner fires
regardless of whether Resend, the DNS, or the mailbox is working. Email delivery failure
is logged and never masks the halt.

### D7 — Document identity is `doc_id`, not `number`

**Choice: the primary key is `doc_id`, the URL's final path segment without `.pdf`.
`number` becomes a nullable attribute (`int | null`).**

The measurement removed `number` as a candidate key: 984 numbered files carry only 942
distinct numbers, because WordPress re-uploads collide and are saved with a `-1` suffix
(`3296.pdf` + `3296-1.pdf`). The filename stem is the closest thing the source offers to a
stable identifier, and it is unique for 1,036 of the 1,038 links.

```
doc_id = final path segment of source_url, with the trailing ".pdf" removed
         e.g. "4457-Mesa-de-Gestion-del-Agua", "3296-1", "Convenio"
```

**Consequences, all of which are load-bearing:**

- `data/documents/{doc_id}.json` replaces `data/documents/{number}.json`.
- `archive/{doc_id}.pdf` replaces `archive/{number}.pdf`.
- Detail page routes key on `doc_id`.
- **`doc_id` is a remote-controlled string, and the path-safety rule now validates it
  instead of an int.** This is the security-critical consequence. The old rule was safe by
  construction — paths derived from an int validated `^\d{3,4}$` cannot traverse. Replacing
  that with a string supplied by a third-party listing reintroduces the entire class.

  **The rule is a denylist plus normalization, not an ASCII allowlist.** An earlier draft
  of this design used `^[A-Za-z0-9._-]{1,120}$`; that was **validated against all 1,038
  real stems and rejected exactly one legitimate document**:

  ```
  4298-O252023-Ley-Provincial-N°-15430.-Carga-administrativa
  ```

  The `°` (U+00B0) is ordinary Spanish legal typography, not an attack. Under the allowlist
  that real ordinance would be pushed to `unresolved-listing-entries.json`, never fetched,
  and the run would sit at `partial` forever — the condition never clears, so the
  "every published document is discoverable" acceptance criterion would break on day one
  and stay broken. The security requirement is preventing **path traversal**, not
  restricting the alphabet.

  Validation order, on each candidate:

  1. **Percent-decode**, then **NFC-normalize**. If normalization *changes* the value,
     **reject** — this kills homoglyph and encoding round-trip tricks without needing to
     enumerate them.
  2. Reject if it contains `/`, `\`, a null byte, any C0 or C1 control character, or `..`
     as a substring.
  3. Reject if it equals `.` or `..`, begins with `.` or `-`, or ends with a space.

     **A trailing `.` is explicitly ALLOWED**, because rejecting it fails three real
     ordinances — `3909-…-en-los-cajeros.`, `3913-Acepta-donacion.`,
     `3915-Colillas-de-cigarrillos.` — whose published filename carries a stray dot before
     the extension. It is also harmless here: every on-disk name is written as
     `{doc_id}.json` or `{doc_id}.pdf`, so a trailing dot in the id can never produce a
     bare trailing-dot filename. This is the same failure mode as the rejected ASCII
     allowlist — a portability rule copied in reflexively, excluding real documents to
     defend against a hazard this design does not have.
  4. Reject a reserved device name on any target filesystem — `CON`, `PRN`, `AUX`, `NUL`,
     `COM1`–`COM9`, `LPT1`–`LPT9` — case-insensitive.
  5. Reject if longer than 120 characters. The corpus maximum is **102**, so this has real
     headroom and is a backstop, not a working limit.
  6. Otherwise **accept**, including non-ASCII letters and marks.

  A non-conforming entry is **rejected**, never repaired, never truncated, never slugified:
  it is appended to `data/unresolved-listing-entries.json` with its URL and raw filename,
  is not fetched, nothing is written to disk for it, and the run ends `partial` with
  operator escalation. Rejection is the only outcome; there is no sanitising branch whose
  output could round-trip back into a path. Every write additionally resolves its final
  path and asserts containment within the intended directory, as an independent second
  barrier that does not depend on this rule being complete.
- **Two listing entries sharing a `number` are two separate records.** Neither is dropped,
  merged, or preferred. Each keeps its own `doc_id`, its own page, its own text. They are
  exposed to each other as variants of the same ordinance number: the manifest carries
  `number_variants: [doc_id, …]` (all `doc_id`s sharing this record's non-null number,
  including its own), and each detail page renders a neutral Spanish notice —
  `El HCD publicó más de un archivo con este número.` — followed by links to the sibling
  records. No wording asserts which one is current, superseding, or correct; the archive
  reports what was published.
- **An identical URL appearing twice collapses to ONE record — a defensive no-op.**
  Deduplication is by exact `source_url` string, in the listing parser, before any fetch.
  It is **not** an error, not a `partial` run, and not an unresolved entry. **The current
  corpus does not exercise it:** all 1,038 hrefs are distinct. It stays because a listing
  that renders one document twice is a plausible WordPress outcome and the alternative is
  fetching the same PDF twice.
- **A `doc_id` collision is RESOLVED deterministically, never escalated.** Two entries can
  share a filename stem under different upload months. The corpus contains exactly two such
  pairs, `3298` and `3299`:

  ```
  https://hcdrosales.gob.ar/wp-content/uploads/2021/11/3298.pdf
  https://hcdrosales.gob.ar/wp-content/uploads/2021/12/3298.pdf
  ```

  1,038 distinct URLs therefore yield only 1,036 distinct stems. Treating that as a hard
  error would halt run one on real data. Instead, **only the colliding records are
  disambiguated** by appending the upload path's year and month:

  ```
  3298--2021-11   3298--2021-12
  ```

  The other 1,036 records keep their clean stem untouched — disambiguation is never applied
  pre-emptively, so a future collision cannot silently rename an existing page.

  **Stated tradeoff:** this couples those two `doc_id`s, and therefore their page URLs, to
  the upload path — the one thing D10 otherwise refuses to read meaning from. If the source
  re-uploads either file under a different month, its id and its URL change. That is
  accepted for 2 of 1,038 records, because both alternatives are worse: dropping a document
  the HCD published, or failing the run. The upload path is used here purely as a
  disambiguating token, never as a date; D10's prohibition on it as a *year source* is
  unaffected.

  If a collision were ever to survive even that (same stem, same upload month, different
  URL), a numeric suffix `--2` is appended in listing order, and the operator is notified —
  but the run continues and no document is dropped.
- **1,038 links = 1,038 records, but only 1,036 clean stems.** `getStaticPaths` generates
  one page per manifest record — derived from the manifest, never from a hardcoded count —
  and no test asserts a literal corpus size.

`number` remains indexed, filterable, searchable and displayed — it is how residents refer
to ordinances. It simply stops being the key.

### D8 — Non-ordinance documents are indexed and labelled by type

**Product owner's decision: index them, and label them.** The `ordenanzas` category as
published contains 24 Convenios plus Resoluciones, Decretos, Anexos, Preparatorias and
expediente-coded files. The archive reflects exactly what the HCD published; Fragua does
not decide which public document deserves to exist. Filtering them out would be an
editorial layer, which the neutrality constraint forbids just as firmly as inventing
content would.

A `doc_type` field is added. **It is derived from explicit evidence only, never from
subject matter.** Priority, first hit wins:

1. The record carries its **own** non-null ordinance `number` → `ordenanza`.
2. Otherwise, an explicit type marker in the **anchor text** or the **filename** —
   `Convenio`, `Resolución`/`Resolucion`, `Decreto`/`Dec.`, `Anexo`, `Preparatoria`
   (case-insensitive, accent-tolerant, matched as a whole word at a token boundary).
   → that type.
3. Otherwise → `sin clasificar`.

**This priority was inverted in the first version of D8, and the corpus proved it wrong.**
Markers were checked first, which misclassified **67 real ordinances**: `Ordenanza 4344 —
Convenio Fundación Saber` became a `convenio`, `Ordenanza 4267 — Adhiere decreto 786`
became a `decreto`. Those are ordinances *about* a convenio or a decree. Letting a marker
in the title win is precisely "deriving the type from subject matter", which the very next
paragraph forbids — the original rule contradicted its own principle. Verified after the
fix: every one of the 1,038 records carrying a number is now `ordenanza`, and every
genuinely non-ordinance document in the corpus carries no number, so nothing regressed.

```
doc_type ∈ "ordenanza" | "convenio" | "resolucion" | "decreto" | "anexo"
         | "preparatoria" | "sin clasificar"
```

**Never guess a type from what the document is about.** A file named `Calle-Irigoyen.pdf`
is `sin clasificar`, not "ordenanza de nomenclatura" — reading the subject and assigning a
class is exactly the editorial act D4 rejects for titles. Rule 2 is not a guess: a leading
ordinance number is an explicit marker the source printed.

`Dec.-377-Promulga-Ordenanza-3288-D-417-11.doc.pdf` is classified `decreto` by rule 2, and
it is the case that made the original inverted priority look reasonable. It does not
actually need rule 2 to outrank rule 1: the `3288` in its title is the ordinance it
promulgates — a reference, not its own identity — and the number extractor correctly
returns `null` for it. Every genuinely non-ordinance document in the corpus behaves the
same way, which is why rule 1 can safely come first.

**The label is visible wherever the record is, so a convenio can never be mistaken for an
ordinance.** Spanish UI labels, neutral register, singular:
`Ordenanza` · `Convenio` · `Resolución` · `Decreto` · `Anexo` · `Preparatoria` ·
`Documento sin clasificar`.

| Surface | Rendering |
|---|---|
| Detail `<h1>` | `{Etiqueta} {number} — {title}`, e.g. `Convenio — Ministerio de las Mujeres`; the number is omitted when null |
| Detail metadata block | `Tipo de documento: Convenio` as a labelled field |
| Search result / list card | the type label precedes the identifier, always shown, never colour-only |
| Search filter | `data-pagefind-filter="tipo"` — same index, no second index built |
| `sin clasificar` detail page | muted line: `El origen no indica el tipo de este documento.` |

Site copy, page titles and the `acerca` page therefore say "documentos" where they
previously said "ordenanzas" as a count. The product name is unchanged.

### D9 — Listing parser shape: anchor class inside a nested tree

The listing is a WordPress `lsvr_document` post tree, not a flat list.

- Select **anchors by class**: `a.post-tree__item-link--file`, wherever they occur inside
  the `ul.post-tree__children--level-N` nesting. Do **not** select by position, by parent
  index, or by walking a fixed depth.
- **Nesting depth carries no meaning here — it is presentational.** Nothing may be derived
  from `level-N`: not year, not category, not ordering. A parser that reads meaning out of
  depth would break the first time the HCD reorganises the tree, and would break silently.
- **HTML entities must be unescaped** to recover the anchor text. The separator in
  `4457 &#8211; Mesa de Gestión del Agua` is an en-dash; accented characters arrive as
  entities too. Unescape first, then strip the leading number, then take the title (D4).
- Extract per anchor: `href` (absolute, must be same-host `https` and end `.pdf`),
  the unescaped anchor text, the filename, and the derived `doc_id`.
- The parser emits `{doc_id, number, url, filename, anchor_text}[]`; the URL-level
  deduplication of D7 happens here, before anything is fetched.
- Zero anchors parsed remains the run-level error condition already specified: record
  `last_run_status: "error"`, escalate, rewrite nothing.

### D10 — The upload-path year MUST NOT be used as the ordinance year

Year derivation priority was REVERSED after measurement — see the D10 note below:
(1) the `Punta Alta, … de {yyyy}` header, (2) the `expediente` year token, (3) absent.
The superseded ordering read: (1) the `expediente` year token, (2) the
`Punta Alta, … de {yyyy}` header transcribed from the document itself, (3) `null` with an
`Año no determinado` filter bucket.

**Added prohibition:** the `/wp-content/uploads/YYYY/MM/` path segment MUST NOT be used as
the ordinance year, and MUST NOT be used as a tiebreak or a "better than null" fallback.
It is the WordPress upload date. The measurement is the reason: 631 of 1,038 documents —
**61%** — sit under `/uploads/2021/` because of a single bulk historical upload of the
back catalogue. Using it would date `1999-Codigo-de-Faltas-ultima.pdf` to 2021 and present
that as fact. `null` plus an honest `Año no determinado` bucket is correct; a confidently
wrong year is not.

### D11 — Published URLs never die: a versioned `doc_id` alias map

**Choice: `data/doc-id-aliases.json`, append-only, with one generated static redirect page
per alias.**

D7 buys a stable identity at the cost of one exposure: `doc_id` derives from the source
filename, and a source filename can change. Four records already carry a
collision-disambiguated id, and any future collision, re-upload or rename moves an id
again. Because these ids are page URLs, a moved id silently 404s a URL that a resident, a
councillor, a journalist or another municipality may have cited. A public archive whose
links rot is a reputational failure, which the project's primary asset does not tolerate.

**The rule is general, not a patch for the four collision cases.** Whenever a record's
`doc_id` changes, for any reason whatsoever, the previous id is written to the alias map
and keeps resolving to that record. The map is **append-only**: an alias is never deleted,
never repointed at a different document, and never reused for a new record. Those three
prohibitions are the whole guarantee — a repointed alias would silently serve the wrong
ordinance to someone who cited the right one, which is worse than a 404.

```jsonc
// data/doc-id-aliases.json
{ "schema_version": 1,
  "generated_at": "2026-08-05T03:12:07Z",
  "aliases": [
    { "alias": "3298", "target": "3298--2021-11",
      "created_at": "2026-08-05T03:12:07Z", "reason": "doc_id_collision" }
  ] }
```

`reason` is operator-facing provenance only and is never rendered.

**Mechanism, stated concretely because Astro's static output has no server.** There is no
runtime to answer a request, so the redirect must be a build artifact:
`site/src/pages/d/[alias].astro` runs `getStaticPaths` over the alias map and emits **one
static HTML page per alias**, each carrying `<meta http-equiv="refresh" content="0; url=…">`,
a `<link rel="canonical">` to the current document, and a visible fallback link with the
Spanish line `Este documento ahora está en otra dirección.` for a visitor whose client
ignores the refresh. Cloudflare Pages `_redirects` is the tempting alternative and is
rejected: it is host-specific configuration, so the archive would stop being portable and
the redirects would not survive a local `astro preview` or a move to another static host.
The generated pages cost roughly 1 KB each and are excluded from the search index with
`data-pagefind-ignore`.

**An alias whose target no longer exists is a hard build error, never a silent 404.**
`aliases.ts` resolves every alias against the manifest during `astro build` and throws on
the first miss. The alternative — emitting a redirect to a page that was never generated —
converts a loud, fixable data problem into a broken public link, which is exactly the
failure this decision exists to prevent.

**Alias ids are path components, so they are validated exactly like a live `doc_id`** under
the D7 rule before any page is emitted. The map is committed data, but it is data that
originated remotely.

### D12 — Public route and copy are document-neutral; headings stay specific

**Product owner's decision.** D8 established that the archive holds documents the HCD
published under its `Ordenanzas` listing, not all of which are ordinances. The public
surface follows:

- **Route: `/documento/{doc_id}` for every record.** There is no `/ordenanza/` route.
  A single neutral route is the only honest option — routing by type would force the site
  to commit a `sin clasificar` document to a category the source never assigned, and would
  break every URL if a record's type were later corrected.
- **Copy counts "documentos", never "ordenanzas":** `1.038 documentos del HCD`,
  `Buscar en 1.038 documentos`. Spanish thousands separator, per local convention.
- **The heading stays specific.** The route is neutral; the `<h1>` is not. A record with an
  ordinance number reads `Ordenanza 4457 — Mesa de Gestión del Agua`; a convenio reads
  `Convenio — Ministerio de las Mujeres`. Neutrality is about not *inventing* a
  classification, not about withholding one the source stated.
- **The type filter on `/buscar` exposes exactly:** `Ordenanza`, `Convenio`, `Decreto`,
  `Resolución`, `Anexo`, `Preparatoria`, `Sin clasificar`.
- **The `acerca` page must state the situation plainly**, in neutral Spanish, with no
  editorial framing beyond the factual statement:

  > Este archivo reproduce el listado «Ordenanzas» del HCD de Coronel Rosales tal como
  > está publicado. Ese listado incluye documentos que no son ordenanzas —convenios,
  > decretos, resoluciones, anexos y actas preparatorias—, por eso este sitio habla de
  > «documentos». No se agrega, quita ni reclasifica nada.

  Nothing may be added characterising why the HCD publishes them that way, whether it is
  correct, or what it implies. The archive reports; it does not comment.

---

## Data Flow

```
                       weekly cron / workflow_dispatch
                                    │
   ┌────────────────────────────────▼──────────────────────────────────┐
   │ JOB 1: sync   (python, ubuntu-latest, permissions: contents:write) │
   └────────────────────────────────┬──────────────────────────────────┘
                                    │
   robots.txt check ──200?──► HALT ─┼──► sync-status.halted ──► notify ──► exit 1
        │ 404/other                 │            │
        ▼                           │            └──► (still committed, see below)
   GET listing (1 request, 1.18 MB) │
        │ parse anchors (a.post-tree__item-link--file), unescape entities
        │ → {doc_id, number, url, filename, anchor_text}[]
        │ collapse identical URLs; reject unsafe doc_id ──► unresolved-listing-entries.json
        ▼
   diff vs manifest.json  ── already status ok/no_text? ──► skip (never re-fetch)
        │ new only  (keyed on doc_id)
        ▼
   for each new doc:  PolicedHostFetcher(concurrency=1, delay>=4s, identifying UA)
        │  → bytes → sha256 → archive/{doc_id}.pdf (scratch, gitignored)
        │  → PyMuPDF extract → text  |  empty ⇒ status="no_text"
        │  → doc_meta → number/expediente/year/title/title_source/doc_type
        │  → crossrefs → candidates
        ▼
   resolve candidates against manifest numbers ──unresolved──► unresolved-references.json
        │ (a number may resolve to >1 doc_id — all of them are kept)
        ▼
   record any changed doc_id ──► data/doc-id-aliases.json  (append-only, never repointed)
        ▼
   write data/manifest.json + data/documents/{doc_id}.json + data/sync-status.json
         + data/doc-id-aliases.json
        ▼
   git add data/ ; commit as github-actions[bot] ; push HEAD:main   (if: always())
                                    │
   ┌────────────────────────────────▼──────────────────────────────────┐
   │ JOB 2: build-deploy  (needs: sync, if: always(), checkout ref:main)│
   └────────────────────────────────┬──────────────────────────────────┘
        astro check → astro build (one /documento/{doc_id} page per record,
                 plus one /d/{alias} static redirect per alias; missing
                 alias target ⇒ hard build error) → pagefind --site dist
        → wrangler pages deploy dist   (Cloudflare Pages, free, unmetered)
```

`sync-status.json` is written and committed on **every** run including `halted` and
`error` (`if: always()`), which is what guarantees a weekly rebuild and therefore a
weekly recomputation of the staleness state even when zero documents change.

---

## Interfaces / Contracts

### `data/manifest.json`

```jsonc
{
  "schema_version": 1,
  "generated_at": "2026-08-04T03:12:07Z",
  "source_host": "hcdrosales.gob.ar",
  "documents": [
    {
      "doc_id": "4457-Mesa-de-Gestion-del-Agua",       // PRIMARY KEY — D7 validation, ≤120 chars
      "number": 4457,                                  // int | null — attribute, NOT unique
      "number_variants": [],                           // other doc_ids sharing this number
      "doc_type": "ordenanza",                         // see D8; never guessed from subject
      "expediente": "O-02-2026",                       // string | null
      "year": 2026,                                    // int | null — never from /uploads/YYYY/
      "title": "Mesa de Gestión del Agua",             // string | null — NEVER synthesized
      "title_source": "listing",                       // "listing" | "filename" | "none"
      "anchor_text": "4457 – Mesa de Gestión del Agua",// verbatim, entity-unescaped
      "source_url": "https://hcdrosales.gob.ar/…/4457-….pdf",
      "source_filename": "4457-Mesa-de-Gestion-del-Agua.pdf",
      "sha256": "…",                                   // null only when status="error"
      "bytes": 118234,
      "fetched_at": "2026-08-04T03:11:02Z",
      "status": "ok",                                  // "pending" | "ok" | "no_text" | "error"
      "text_path": "data/documents/4457-Mesa-de-Gestion-del-Agua.json",  // null unless "ok"
      "cross_references": [
        { "number": 3351, "signal": "title", "excerpt": "Modifica Ordenanza 3351" }
      ],
      "notes": "",
      "last_error": null, "last_error_at": null        // additive, see drift rules
    }
  ]
}
```

### D10 correction — the sanction date outranks the expediente year

**Two bugs, found by reading the built search filter rather than the code.** The year
filter offered `1919`, `1920`, `2072`, `2082` and `2092` as choices — impossible years for
this corpus.

1. **The year is the TAIL of an expediente, not the first four-digit run inside it.**
   `T192024` is file T-19 of 2024; a leftmost `(19|20)\d{2}` search reads `1920` out of its
   middle. A two-digit tail (`COR03-17`, `D31919`) expands into the 2000s. The one
   plausibility bound in the pipeline lives here: a four-digit tail below 2000 is a misread
   token, because the HCD has digitised nothing older, and `D31919` is genuinely ambiguous
   between "D-3 of 1919" and "D-319 of 19".

2. **The header outranks the expediente.** They answer different questions: the expediente
   year is when the FILE WAS OPENED; the `Punta Alta, … de {yyyy}` line is the date the HCD
   printed when it SANCTIONED the ordinance. Measured over the corpus, **67 of the 394
   records carrying both disagree**, always in that direction — ordinance 4393 was filed
   under expediente `O812022` and sanctioned in 2025. Under the old priority a resident
   filtering by 2025 did not find it.

Verified after the fix, in a browser against the built index: the year filter spans
2002–2026 with no implausible value, and `Ordenanza 4393 — Emergencia Ambiental` now
answers a 2025 filter. 67 records changed year; coverage stayed at 815 of 1,038.

The upload path remains banned as a third, unrelated date.

### D13 — `expediente` extraction: three measured families, absent by default

The first version of this design specified `expediente` as a field but **no rule for
deriving it**. PR2a therefore shipped a best-effort guess. Measured against the corpus, that
guess truncates the modern format: `4448-EX-2025-00106406-MUNICRO-DCSE-Presupuesto-2026`
yields `EX-2025` instead of `EX-2025-00106406-MUNICRO-DCSE`. A truncated expediente is worse
than an absent one, because it looks authoritative and cites a file number that does not
exist.

The `expediente`, when present, is the token immediately following the leading ordinance
number. Three families occur in the corpus; match them **longest-first**, anchored, and take
nothing else:

| Family | Pattern | Real example | Count |
|---|---|---|---|
| GDE | `(?:EX|IF|ME|NO|PV)-\d{4}-\d{6,9}-[A-Z]+(?:-[A-Z]+)?` | `EX-2025-00106406-MUNICRO-DCSE` | 4 |
| Compact | `[A-Za-z]{1,4}\d{1,3}(?:19|20)\d{2}` | `O822024`, `S2262025`, `Pres012025` | 340 |
| Dashed | `[A-Za-z]{1,4}-?\d{1,3}-\d{2,4}` | `O-02-2026`, `COR03-17`, `O16-22` | 50 |

**Everything else is `null`.** 593 of the 987 numbered records carry no expediente at all —
the token after the number is simply the start of the title. Absence is the common case, not
an extraction failure, and it must never be reported as one.

**Short letter+digit tokens are deliberately NOT matched.** `4372-O89-Lugar-Historico-…`,
`4262-O1`, `3866-IVR62-Calle-Scout-…` look expediente-shaped but carry no year, and nothing
in the source distinguishes a year-less expediente from an abbreviation that begins the
title. Capturing them would be guessing — the same failure D4 rejects for titles. They stay
`null`. Roughly 100 records are affected; recovering them would need a rule the source does
not support.

Measured coverage under this rule: **394 of 987** numbered records. (A first pass put this
at 373 because the dashed pattern was written requiring a dash after the letters, which
rejects `COR03-17` — the BRIEF's own example. The whole-corpus test caught the discrepancy.) Record that number in
the whole-corpus test as an observed fact, and assert the anti-truncation property directly:
no captured expediente may be a strict prefix of a longer expediente-shaped token in the same
filename.

**Deviation from the votus manifest, stated:** votus persists a bare array. Here it is an
object so `schema_version` and run-level provenance have a home. `upsert_record` semantics
(immutable prior captures, `{id}@{date}` drift preservation, failed-refetch preservation
via `last_error`/`last_error_at`) are ported **unmodified** and operate on
`manifest["documents"]`.

`status: "no_text"` is a known, expected outcome for the ~16% scanned subset — it is
**never** recorded as `"error"`.

**`status: "pending"` — a record that has never been fetched.** PR2a builds the manifest
from the listing alone and opens no sockets, so every record it writes is `pending`: the
document is known and described, but no bytes have been retrieved and `sha256`, `bytes`,
`fetched_at` and `text_path` are all `null`. It is a distinct state from `error`, which
means a fetch was attempted and failed.

The rules that follow from it, which PR2b's upsert must honour:

- `pending` is **not** a terminal state and **never** satisfies the "already archived" skip.
  The incremental-skip rule keys on `ok`/`no_text` only, so a `pending` record is fetched on
  the next run that has a network layer.
- `pending` is **not** a failure: it never sets `last_run_status` to `error` or `partial`,
  and never escalates.
- A `pending` record is still fully discoverable by metadata — number, title, type, year —
  because none of that came from the PDF.
- `pending` → `ok` / `no_text` / `error` on first fetch. Nothing ever transitions back to
  `pending`; a record that has been fetched has been fetched.

**`ok` with `text_path: null` is a transitional state and does NOT satisfy the skip.**
PR2b fetches and checksums but does not extract — extraction is Phase 3 — so a run made
between those two slices writes records that are `ok` with no text body. That combination
must be treated as "archived but not yet extracted": it is re-fetched once so extraction
has bytes to work with. Without this rule the record is skipped forever, because `archive/`
is per-run scratch and gitignored, so the PDF is simply gone by the time Phase 3 lands, and
the document would sit in the index permanently without its text. A record is only fully
settled when its status is `no_text`, or `ok` **with** a `text_path`.

This value was introduced by the PR2a implementation because the manifest had to represent
"described but never fetched", and the original three-value enum had no way to say it. The
contract records it rather than leaving the implementation and the design disagreeing.

`cross_references[].number` stays a **number**, not a `doc_id`: it is what the document's
own text says. Resolution from that number to one or more target records happens at build
time (D5/D7), so the stored evidence never silently commits to a choice between two records
sharing a number.

### `data/documents/{doc_id}.json`

```jsonc
{ "schema_version": 1, "doc_id": "4457-Mesa-de-Gestion-del-Agua", "number": 4457,
  "sha256": "…",
  "extracted_at": "2026-08-04T03:11:04Z", "extractor": "pymupdf/1.24.x",
  "pages": 3, "text": "Punta Alta, 27 de enero de 2.026\n…" }
```

The filename is `{doc_id}.json` and `doc_id` MUST have passed the D7 path-safety check
before this file is written. The writer takes `doc_id` from the validated record, never
re-derives it from a URL at write time.

### `data/sync-status.json`

```jsonc
{ "schema_version": 1,
  "last_run_at": "2026-08-04T03:12:07Z",
  "last_run_status": "ok",            // "ok" | "partial" | "error" | "halted"
  "last_success_at": "2026-08-04T03:12:07Z",   // only advances on a full "ok" run
  "documents_total": 1038,
  "documents_added_last_run": 2,
  "staleness_threshold_days": 30,
  "halt_reason": null }
```

`last_run_status` is **operator-facing only** and is never rendered to visitors — a
settled product decision. `halted` is a distinct recorded state that drives escalation
and the non-zero exit; visitors see only `last_success_at` and, past the threshold, the
out-of-date notice.

### `data/doc-id-aliases.json`

```jsonc
{ "schema_version": 1,
  "generated_at": "2026-08-05T03:12:07Z",
  "aliases": [
    { "alias": "3298",                    // a doc_id that was published at some point
      "target": "3298--2021-11",          // the doc_id it resolves to now
      "created_at": "2026-08-05T03:12:07Z",
      "reason": "doc_id_collision" }      // operator-facing provenance; never rendered
  ] }
```

Invariants, all three enforced by the writer and re-asserted at build time (D11):
**append-only** — an existing entry is never removed; **never repointed** — an entry's
`target` is never changed to a different document; **never reused** — an `alias` string is
never issued for a new record. `alias` is validated by the same D7 path-safety rule as a
live `doc_id`, because it becomes a URL path component.

### TypeScript mirror

`site/src/lib/contract.ts` declares the four types verbatim and exports
`assertManifest(u: unknown): Manifest` and `assertAliases(u: unknown): AliasMap`, called
once each in `site/src/lib/data.ts` and `site/src/lib/aliases.ts`. A contract
violation **fails the build**, never degrades at runtime.

`site/src/lib/data.ts` is the single filesystem read point and therefore the single swap
point for D2's escape hatch.

---

## Sync mechanics

**"Already archived" detection.** A listing entry whose `doc_id` has a manifest record
with status `ok` or `no_text` is skipped without any HTTP request. Keying this on `doc_id`
rather than `number` is what makes `3296.pdf` and `3296-1.pdf` both get archived instead of
the second being mistaken for the first and skipped forever. This is the ported
`latest_ok_record` / archive-first-caching rule. The committed manifest **is** the cache —
`archive/` is per-run scratch and gitignored, so no CI cache restore is needed and CI can
never re-download an already-archived PDF.

**Checksum / drift.** Because archived URLs are never re-fetched, drift is only detected
when the listing publishes a *different* URL for a known number, or on a deliberate
operator run `hcd-sync run --recheck` (quarterly, outside the weekly budget). When
detected, `upsert_record`'s ported drift branch preserves the prior capture under
`{doc_id}@{YYYY-MM-DD}` and annotates both records. Nothing is silently overwritten.

**`doc_id` is the hard invariant — `number` is not.** Every document record, every local
archive path and every `documents/{doc_id}.json` filename derives from `doc_id`, a
non-null string that has passed the D7 safe-charset check. There is therefore no
representable state for a document whose identity could not be derived. Because `doc_id`
comes from the URL, an entry that has a URL always has a candidate identity; the only way
to fail is to fail validation.

A listing entry whose `doc_id` does not conform is **not** a document: it is appended to
`data/unresolved-listing-entries.json` with its URL and raw filename, is not fetched,
nothing is written for it, and it sets `last_run_status: "partial"` with operator
escalation. This is the per-entry counterpart to the run-level zero-links-parsed rule
below; neither a crash nor a silent drop is an acceptable outcome.

**A missing `number` is no longer an unresolved entry.** This is the substantive change
from the previous design, which assumed every filename leads with its ordinance number.
The measurement disproved that: 52 filenames (54 anchor texts) carry no leading number —
`Convenio.pdf`, `Calle-Irigoyen.pdf`, `RP0107.pdf`, `DOTACION-PLANTA-PERMANENTE-2026.pdf`.
These are real published documents and are indexed as records with `number: null` and a
`doc_type` per D8. They are an expected weekly occurrence, not an operator escalation.
BRIEF.md's "Other — 55 (5%)" bucket is a partition over *title* shape and does not answer
number derivability either way.

**Source URL reorganisation.** The listing page is the only source of truth for URLs. The
one thing now derived from a URL is `doc_id` — its final path segment — and this is the
cost of D7, stated plainly. Nothing is derived from or assumed about the directory portion
(`/uploads/YYYY/MM/`), which may be reorganised freely with no effect: a document whose
upload path moves but whose filename is unchanged keeps its `doc_id` and its page URL, and
the sync is a no-op. A document whose **filename** changes presents as a new record while
the old one is retained, since deleting a previously archived record is never automatic.
That is loud, inspectable drift rather than silent loss, and it is the accepted trade for
having any stable identity at all — `number` cannot provide one. If the listing itself moves or
its markup changes such that zero links parse, the run records
`last_run_status: "error"`, escalates, and **does not** rewrite `data/` — the site keeps
serving the last good archive and goes stale visibly.

**Bounded surface.** votus forbids path *prefixes* in its allowlist. Here the URL set is
enumerated exactly once from the official listing and never discovered by following
links, which is a strictly tighter bound than a prefix allowlist. The enforced rules are:
same host, scheme `https`, path ends `.pdf`, and the URL appeared in this run's listing
parse. A remote filename is **never** used as a local path (see Threat Matrix).

**Staleness rendering — the subtle part.** A statically built site cannot age by itself.
Two layers:

1. Build-time: the age of `last_success_at` is computed during `astro build` and the
   notice is rendered server-side. The weekly `if: always()` commit of
   `sync-status.json` guarantees at least one rebuild per week.
2. Runtime (~300 bytes of inline JS, the only script outside `/buscar`): recomputes days
   elapsed from the embedded `<time datetime>` against `Date.now()` and **may only add**
   the notice, never remove one already rendered. So a site that has not rebuilt for
   months still tells the truth, and a visitor with JS disabled sees the build-time
   answer, which is never more optimistic than reality.

Notice copy (Spanish, `role="status"`):
`Este archivo no se sincroniza desde hace más de 30 días. Consulte el PDF oficial del HCD.`

---

## File Changes

| Path | Action | Description |
|---|---|---|
| `pipeline/pyproject.toml` | Create | uv project; deps `requests`, `pymupdf`; dev `pytest`, `pytest-cov`, `ruff`, `mypy` |
| `pipeline/src/hcd_sync/http_client.py` | Create | **Ported**: identifying UA, `HostPolicy`, `PolicedHostFetcher` (injectable `sleep`/`clock`), `check_robots_txt_still_absent` |
| `pipeline/src/hcd_sync/archive.py` | Create | **Ported**: fetch → sha256 → record; `Fetcher` Protocol for fakes |
| `pipeline/src/hcd_sync/manifest.py` | Create | **Ported**: load/save/`upsert_record`, drift + failed-refetch semantics, adapted to the object-shaped manifest |
| `pipeline/src/hcd_sync/storage.py` | Create | **Ported**: `LocalArchiveStore`, `sha256_of` |
| `pipeline/src/hcd_sync/listing.py` | Create | D9: parse `a.post-tree__item-link--file` in the nested tree, unescape entities → `{doc_id, number, url, filename, anchor_text}[]`; collapse identical URLs; validate `doc_id` per D7 |
| `pipeline/tests/fixtures/listing-2026-08-04.html` | Create | The captured 2026-08-04 listing HTML, committed verbatim as the offline parser fixture |
| `pipeline/src/hcd_sync/doc_meta.py` | Create | D4/D7/D8/D10 rules: `doc_id`, number, expediente, year, title, `title_source`, `doc_type` (replaces the planned `filename_meta.py`, which is no longer filename-only) |
| `pipeline/src/hcd_sync/extract.py` | Create | PyMuPDF text extraction; empty ⇒ `no_text` |
| `pipeline/src/hcd_sync/crossrefs.py` | Create | D5 pattern set, negatives, manifest resolution |
| `pipeline/src/hcd_sync/sync_status.py` | Create | Status record incl. `halted` |
| `pipeline/src/hcd_sync/notify.py` | Create | D6 Resend escalation; secret never logged |
| `pipeline/src/hcd_sync/cli.py` | Create | `hcd-sync run [--recheck] [--limit N] [--dry-run]` |
| `pipeline/tests/**` | Create | Unit + integration; `conftest.py` network guard |
| `site/package.json`, `astro.config.mjs`, `tsconfig.json` | Create | Astro static, `site: <prod url>`, sitemap |
| `site/src/lib/{contract,data,related,staleness,excerpt,aliases}.ts` | Create | Contract types + build-time loaders; `aliases.ts` loads and validates the alias map |
| `site/src/pages/index.astro` | Create | Recent ordinances, provenance block, link to `/buscar` |
| `site/src/pages/buscar.astro` | Create | Pagefind UI, year + `tipo` + `texto indexado` filters |
| `site/src/pages/documento/[doc_id].astro` | Create | `getStaticPaths` over every manifest record; type label in the `<h1>`, metadata, text, official PDF link, `Ordenanzas relacionadas`, same-number variant notice |
| `site/src/pages/d/[alias].astro` | Create | D11: `getStaticPaths` over `doc-id-aliases.json`; emits one static redirect page per retired `doc_id` so no published URL ever dies |
| `site/src/pages/acerca.astro` | Create | Unofficial-tool statement, official-PDF-prevails clause, and the D12 statement that the HCD listing includes non-ordinance documents |
| `site/src/components/{Layout,DocCard,Provenance,StalenessNotice,Footer}.astro` | Create | Footer = discreet `herramienta no oficial publicada por Fragua` only |
| `site/tests/**` | Create | vitest: contract fixture, related-set union, staleness boundaries, a11y smoke |
| `data/.gitkeep`, `.gitignore` | Create | Ignore `archive/`, `dist/`, `.venv/`, `node_modules/` |
| `.github/workflows/sync-and-deploy.yml` | Create | Weekly cron, two jobs, concurrency group |
| `.github/workflows/ci.yml` | Create | PR gate: `test_command` + `build_command` + `actionlint` |
| `openspec/config.yaml` | Modify | Fill `test_command` / `build_command` / `coverage_threshold` (below) |
| `README.md` | Create | Records the Astro deviation as deliberate (D1) |

---

## Toolchain — resolves the empty `openspec/config.yaml` gate

`site/package.json` scripts: `"test": "vitest run"`, `"check": "astro check && tsc --noEmit"`,
`"build": "astro build && pagefind --site dist"`.

**Slice-ordering correction, found while applying slice 1.** Two of these pieces cannot run
on a site that has no pages yet, and both fail hard rather than degrading:

- `@astrojs/sitemap` 3.7.3 crashes in `astro:build:done` against Astro 4.16. The original
  diagnosis here — "it crashes on a zero-route build" — was **wrong**: it crashes with 1,038
  routes too, because 3.7.3 depends on an `astro:routes:resolved` hook that Astro 4.16 does
  not implement. The zero-route build merely made it visible first. Pinning `3.2.1` fixes it
  at any route count.
- `pagefind` exits 1 with "not able to build an index" when `dist/` contains no HTML.

Neither is worked around. The `build` script ships as `astro build` alone from slice 1, with
`pagefind` kept as a separate `build:search` script, and the sitemap integration left out of
`astro.config.mjs`. They are enabled in the slice that first produces the pages they need —
sitemap in 4a, pagefind folded back into `build` in 4b. `openspec/config.yaml` is unaffected,
since it invokes `pnpm --dir site run build` rather than naming the tools. The final shape of
the `build` script is the one written above.

```yaml
apply:
  test_command: "uv run --directory pipeline pytest -q && pnpm --dir site run test"
verify:
  test_command: "uv run --directory pipeline pytest -q && pnpm --dir site run test"
  build_command: "uv run --directory pipeline ruff check src tests && uv run --directory pipeline mypy src && pnpm --dir site run check && pnpm --dir site run build"
  coverage_threshold: 80   # measured on pipeline/src/hcd_sync only
```

`strict_tdd` moves from `false` to `true` from slice 2a onward — a test runner exists once
slice 1 lands, which is the condition `config.yaml` itself records for revisiting.

---

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Guard | No test may touch the network | Autouse `conftest.py` fixture monkeypatching `socket.socket` to raise. Makes "we never hit the live host" enforced rather than aspirational |
| Unit | Politeness delay | `PolicedHostFetcher` with injected `sleep`/`clock` fakes; assert ≥4.0 s requested between sequential gets. Zero wall-clock cost |
| Unit | Concurrency cap | Two threads through the semaphore; assert never >1 in flight |
| Unit | **robots.txt HALT** | `FakeFetcher` returns 200 for `/robots.txt` ⇒ `RobotsTxtAppearedError`; assert `sync-status.last_run_status == "halted"`, `halt_reason` set, **zero** subsequent `get` calls, notifier called once, exit code 1 |
| Unit | Bounded retries | Fake returns 429/5xx ×3 ⇒ exhausted error, `status: "error"` record, prior `ok` record preserved with `last_error` |
| Unit | Listing parser (D9) | Against the committed `listing-2026-08-04.html` fixture: exactly 1,038 anchors selected by class; `&#8211;` unescaped; all 1,038 hrefs distinct; the `3298`/`3299` stem collisions resolve to `3298--2021-11`/`3298--2021-12` rather than erroring; assert nothing is derived from `level-N` depth |
| Unit | Title source (D4) | Table-driven: anchor `4457 – Mesa de Gestión del Agua` ⇒ `title == "Mesa de Gestión del Agua"`, `title_source == "listing"`, accents intact; anchor absent ⇒ falls back to slug with `title_source == "filename"` and **no** accent restoration; number-only and non-qualifying ⇒ `title is None` and `title_source == "none"`, never a string |
| Unit | `doc_id` path safety (D7) | Table-driven rejections: `../../etc/passwd`, `a/b`, `a\b`, `..`, `.`, leading `.`/`-`, trailing space, NUL and C0/C1 controls, a value NFC normalization changes, `CON`/`NUL`/`COM1`, `%2f`-decoded traversal, >120 chars ⇒ rejected to `unresolved-listing-entries.json`, **no filesystem write anywhere**, run `partial`. Accepts `4457-Mesa-de-Gestion-del-Agua`, `3296-1`, `Convenio`, `Dec.-377-Promulga-Ordenanza-3288-D-417-11.doc`, and the trailing-dot stems `3913-Acepta-donacion.` and `3915-Colillas-de-cigarrillos.` |
| Unit | **Whole-corpus id validation** | Run the D7 validator over all 1,038 stems in the committed fixture ⇒ **zero rejections**, 1,038 unique ids after collision resolution, exactly four suffixed ids (`3298--2021-11/12`, `3299--2021-11/12`), max stem length 102. This is the test that catches an over-strict hardening rule before it silently drops real documents |
| Unit | **`N°` stem is accepted, not rejected** (D7) | `4298-O252023-Ley-Provincial-N°-15430.-Carga-administrativa` ⇒ **valid**, archived, `last_run_status == "ok"`. This is the regression test for the discarded ASCII allowlist, which rejected this one real ordinance out of 1,038 and would have broken the discoverability criterion permanently |
| Unit | **`doc_id` collision resolution** (D7) | The real `3298` pair — `/uploads/2021/11/3298.pdf` and `/uploads/2021/12/3298.pdf` — ⇒ two records with `doc_id` `3298--2021-11` and `3298--2021-12`, run `ok` **not** an error, neither document dropped; and assert every non-colliding record in the same fixture keeps its clean stem unsuffixed |
| Unit | `doc_type` (D8) | `Convenio-Ministerio-de-las-Mujeres` ⇒ `convenio`; `Resolucion-053-2021-…` ⇒ `resolucion`; `Dec.-377-Promulga-Ordenanza-3288-…` ⇒ `decreto` (marker beats number); `ANEXO-I-…` ⇒ `anexo`; `4457-…` ⇒ `ordenanza`; `Calle-Irigoyen` ⇒ `sin clasificar` — asserts subject matter is never read |
| Unit | Duplicate numbers (D7) | Fixture with `3296` and `3296-1` ⇒ two records, two `doc_id`s, neither dropped, each `number_variants` naming the other; assert no "preferred" record is selected |
| Unit | Identical-URL collapse (D7) | Synthetic fixture listing the same URL twice ⇒ exactly one record, one fetch, run status `ok`, **not** `partial`, nothing in `unresolved-listing-entries.json`. Marked as a defensive path the real corpus does not exercise |
| Unit | Cross-references (D5) | Table-driven positives per P1/P2/P3 **and** the hard negatives: `artículo 169 bis a la Ordenanza 1999` ⇒ `{1999}`; `Ordenanza General 267` ⇒ `{}`; self-reference ⇒ `{}`; `Ordenanza 44571` ⇒ `{}` and `Ordenanza 44572026` ⇒ `{}` (trailing-digit guard); `Ordenanza Nº 3.351` ⇒ `{3351}` (thousands separator); `Ordenanzas 3351, 3402 y 3500` ⇒ `{3351, 3402, 3500}` — asserts P3 keeps the **middle** element, which a repeated capture group would drop |
| Unit | Entry with no derivable number | Fixture entry `Convenio.pdf` ⇒ **present** in `manifest.json` with `number: null` and `doc_type: "convenio"`, fetched normally, `last_run_status == "ok"` — a missing number is not an error |
| Unit | Entry with an unsafe `doc_id` | Fixture listing containing one non-conforming entry ⇒ absent from `manifest.json`, present in `unresolved-listing-entries.json`, not fetched, `last_run_status == "partial"`, notifier called once |
| Workflow | Job 2 checks out post-sync `main` | `actionlint` plus an assertion that the deploy job's `actions/checkout` step declares `ref: main` — the stale-deploy failure is silent, so it needs a static gate |
| Unit | Manifest gating | Candidate not in manifest ⇒ absent from `cross_references`, present in `unresolved-references.json` |
| Unit | Alias emission (D11) | A record whose `doc_id` changes between two runs ⇒ the previous id appears in `doc-id-aliases.json` with the new id as `target`; assert the manifest record itself keeps only the current id |
| Unit | Alias append-only (D11) | Run the loop twice; assert every alias from run 1 is still present after run 2, byte-identical, with an unchanged `target` and `created_at`; assert a rewrite that would drop or repoint an entry raises instead of writing |
| Unit | Alias id is path-validated (D11) | An alias string failing the D7 rule ⇒ rejected before it is written; no page is ever emitted for it |
| Unit (TS) | Alias target must exist (D11) | An alias pointing at a `doc_id` absent from the manifest ⇒ **`astro build` fails** with a message naming the alias and its missing target; assert it does not emit a redirect page and does not silently skip |
| Unit (TS) | Alias route resolves (D11) | For alias `3298` → `3298--2021-11`, assert `/d/3298` is emitted, carries a `<meta http-equiv="refresh">` and a canonical link to `/documento/3298--2021-11`, and includes a visible fallback link |
| Unit (TS) | Multi-target reference | A reference to a number held by two records ⇒ `related` contains **both** `doc_id`s, each rendered and labelled; assert neither is dropped and no "best match" is chosen |
| Unit | Drift / failed-refetch | Ported votus cases re-asserted against the object-shaped manifest |
| Integration | Full sync loop, offline | Hand-built fixture listing HTML in real `post-tree` markup (20 links: text PDF, no-text PDF, number-only name, accented anchor title, a convenio with no number, a `-1` duplicate-number pair, one repeated identical URL, `Modifica Ordenanza 3351`) + PDFs **generated by PyMuPDF at test time** (no committed binaries). Assert emitted `data/` byte-for-byte against a golden. The full 2026-08-04 capture is used only by the parser test, not by the loop golden |
| Integration | Incrementality | Run the loop twice on the same fixture; assert the second run issues **zero** PDF `get` calls and produces a clean `git status` on `data/` |
| Contract | Two-language contract | pytest validates pipeline output against a JSON Schema; vitest validates the same committed fixture against `contract.ts` via `assertManifest`. Both sides must agree or CI fails |
| Unit (TS) | Staleness boundaries | 29 / 30 / 31 days vs `last_success_at`; assert the runtime script can only add, never remove, the notice |
| Unit (TS) | Undirected union | `refs(A)={B}` ⇒ `related(A)∋B` and `related(B)∋A`; assert no direction/verb string reaches the rendered output |
| A11y | WCAG 2.1 AA | `axe-core` + `happy-dom` over 3 rendered pages (index, detail-with-title, detail-null-title) in vitest; one manual Lighthouse pass per slice close |
| Workflow | Lint | `actionlint` in CI |

---

## Accessibility and Mobile Payload

- `<html lang="es">` — required by WCAG **and** functionally required: Pagefind selects
  its Spanish stemmer from this attribute.
- Semantic landmarks (`header`/`nav`/`main`/`footer`), one `<h1>` per page, skip-to-content
  link, `:focus-visible` outlines never removed.
- Search is a real `<form>` with a labelled `<input type="search">`; results container is
  `aria-live="polite"`. Pagefind's UI is keyboard-operable.
- No colour-only signalling: the `no_text` marker (`Sin texto indexado`) and the staleness
  notice (`role="status"`) are text. Contrast ≥ 4.5:1 throughout.
- Extracted text renders in a `<div>` with `white-space: pre-wrap`, preserving article
  breaks without abusing `<pre>` semantics.
- **Payload budget:** ≤ 20 KB uncompressed page *chrome* (HTML shell, inline CSS, metadata
  block, provenance, related links — **excluding** the extracted document text) per detail
  page; **0 KB JS** on index and detail except the ~300-byte staleness script; the Pagefind
  runtime (~30 KB) loads only on `/buscar` and only on interaction. System font stack, no
  webfont, no images.
- **Whole-page size is chrome + text, and is therefore bounded by the corpus, not by us.**
  Target ≤ 50 KB uncompressed at p95 and record the observed max from D2's measurement,
  which already prints both. Roughly 3% of documents — the annual budget, fiscal and
  zoning ordinances — will exceed 50 KB uncompressed; at ~4× compression on the wire that
  is ~25 KB, still well under D1's rejected Next.js JS baseline. Those pages are accepted
  **un-truncated**: the full body is exactly what `data-pagefind-body` indexes, so
  truncating to hit a budget would delete text from the search index.

## Build cost at 1,038 pages, and keeping it cheap

Astro's static build is O(n) with trivial per-page work (no MDX, no image pipeline, no
remote data). Pagefind's post-build crawl adds seconds. Indexing is scoped so growth stays
cheap:

- `data-pagefind-body` on the ordinance article region only; `data-pagefind-ignore` on
  nav/footer/related-links, so chrome is not re-indexed once per page.
- `data-pagefind-filter="anio"` and `data-pagefind-filter="texto"` provide the year filter
  and the metadata-only marker from the same index — no second index is built.
- **Load-bearing detail:** Pagefind skips a page whose `data-pagefind-body` region is
  empty. For `no_text` documents the indexed region MUST therefore contain the number,
  title and expediente, or the ~16% scanned subset would silently vanish from search —
  breaching an explicit acceptance criterion.
- The **initial 1,038-document import runs on the operator's machine**, not in CI
  (1,038 × 4 s ≈ 70 min), and is committed once. CI thereafter only ever performs
  incremental syncs of ~1–3 documents (<1 min).
- Escape hatch if a full rebuild ever exceeds ~10 minutes: Cloudflare Pages direct upload
  of changed pages only. Noted, not built.

---

## Threat Matrix

| Boundary | Applicability | Design response | Planned RED tests |
|---|---|---|---|
| Documentation-like paths / remote-controlled filenames | **Applicable, and materially widened by D7**: local paths now derive from `doc_id`, a **remote-supplied string**, where they previously derived from an int validated `^\d{3,4}$`. The old rule was safe by construction; this one has to be enforced | `doc_id` is percent-decoded, then NFC-normalized — a value normalization *changes* is rejected outright, which closes homoglyph and encoding round-trip tricks without enumerating them. It is then rejected on an explicit **denylist**: any `/`, `\`, null byte, C0/C1 control, or `..` substring; equal to `.` or `..`; leading `.` or `-`; a **trailing space** (a trailing `.` is **allowed** — three real ordinances carry one, and every on-disk name is `{doc_id}.json`/`{doc_id}.pdf` so a bare trailing-dot filename is unreachable); a reserved device name (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`); longer than 120 chars. Non-ASCII letters and marks are **accepted** — an ASCII allowlist was tried and rejected one real ordinance (`…Ley-Provincial-N°-15430…`), and a trailing-dot ban was tried and rejected three more. The requirement is stopping traversal, not enforcing filename portability or restricting the alphabet — **every hardening rule added here must first be replayed over all 1,038 real stems**. A non-conforming entry is **rejected** — never sanitised, truncated, or slugified, because a repair path's output could round-trip back into a path — and is written to `unresolved-listing-entries.json` instead of to disk. Every write additionally resolves its final path and asserts it is contained within the intended directory (`archive/`, `data/documents/`) as a second, independent barrier. The remote filename itself is still stored as data only. Fetched PDFs are parsed as data by PyMuPDF; never executed, never passed to a shell, never interpolated into a `run:` step | Listing entries yielding `doc_id` of `../../etc/passwd`, `4457; rm -rf /`, `4457%2f..%2f`, `..`, `.hidden`, `-rf`, `trailing␠`, `NUL`, a NFC-unstable homoglyph stem, a 121-char stem, and an absolute `/etc/passwd` ⇒ each rejected; `4298-O252023-Ley-Provincial-N°-15430.-Carga-administrativa` and `3913-Acepta-donacion.` ⇒ **accepted**; assert **zero** filesystem writes outside `archive/` and `data/documents/` for the whole run |
| Git repository selection | **Applicable** | All git runs in `${{ github.workspace }}`; no `git -C`, no path interpolated from fetched data | `actionlint` + assert no `${{ }}` interpolation of pipeline output in any `run:` |
| Commit state | **Applicable** | Explicit `git add data/` only; never `commit -a`; empty index ⇒ skip commit, exit 0 | Two consecutive no-change syncs create zero commits and exit 0 |
| Push state | **Applicable** | Explicit refspec `git push origin HEAD:main`; `concurrency` group; one `pull --rebase` retry on non-fast-forward, then fail loudly | Simulated non-ff ⇒ exactly one rebase retry, then non-zero exit |
| PR commands | **N/A** — D3 chose direct commit; no PR automation exists in this change | — | — |
| Secret handling (added row) | **Applicable** — public repo | `RESEND_API_KEY` only as an Actions secret in `env:`; never written to disk, never in a `run:` string, never echoed. `notify.py` logs HTTP status only. `GITHUB_TOKEN` is ephemeral and job-scoped | Assert notifier error paths contain no `RESEND_API_KEY` substring; assert `data/**` matches no secret-shaped pattern before commit |

---

## Review Workload

- `Decision needed before apply: Yes`
- `Chained PRs recommended: Yes`
- `800-line budget risk: High`

This is a greenfield build of a Python pipeline plus a 1,038-page site. Honest forecast:
**~3,000–3,750 authored lines** including tests — roughly 4× the 800-line session
budget. Delivery strategy is `ask-on-risk`, so this MUST be resolved before apply.

Natural slice boundaries (each has autonomous scope, its own verification, and a clean
`git revert` rollback):

| # | Slice | Est. authored lines | Done when |
|---|---|---|---|
| 1 | Repo scaffolding + toolchain | ~250 | `test_command` and `build_command` run green; `config.yaml` filled; network-guard fixture in place |
| 2a | **Listing → manifest, fully offline** (fixture, `listing.py`, `doc_id` + path safety + collisions, `doc_meta.py`, manifest/status/unresolved/alias writers) | ~450 | Running the pipeline against the committed `listing-2026-08-04.html` emits a complete `manifest.json` of 1,038 records — every title, number, type and year populated per spec — having issued **zero** HTTP requests. A reviewer can diff the emitted manifest against the real listing |
| 2b | **Polite fetching + archive** (ported `http_client`/`archive`/`storage`/`manifest` drift, politeness, HALT, retries, incremental skip) | ~400 | The offline integration test runs the full loop twice against fake fetchers; the second run issues **zero** PDF `get` calls and leaves a clean `git status` on `data/` |
| 3 | Text extraction + cross-references | ~450 | D2 measurement executed and recorded; `documents/*.json` + `unresolved-references.json` emitted; all D5 negatives green |
| 4a | Site: layout, listing, detail, provenance, staleness, a11y | ~450 | One page per manifest record builds; axe smoke green; zero JS beyond the staleness script |
| 4b | Site: search, Pagefind, year filter, `no_text` marker | ~350 | Query returns excerpts; `no_text` docs are findable and marked |
| 5 | Workflow + escalation + deploy | ~250 | Halt path exits 1, escalates, and commits `sync-status.json`; `hcd@fragua.dev` receipt confirmed |

**Slice 2 was split, deliberately not along the obvious seam.** At ~800 lines it sat
exactly on the session budget, and D11's alias map pushed it over. The tempting split —
"ports" in one PR, "parsing" in the other — was rejected because the ports PR would have
had no observable output and a reviewer would have to take it on faith. Splitting instead
at *offline vs. network* gives 2a a reviewable artifact (a real manifest built from the
committed fixture, with no network code exercised at all) and lets 2b introduce the risky
fetching code against an identity model that is already settled and verified. It also
lands the `robots.txt` HALT path in a PR small enough to actually review.

**Feature Branch Chain:** PR #1 targets the tracker branch; PR2a targets PR1's branch,
PR2b targets PR2a's branch, and #3…#5 each target the immediately previous branch. **The first full `data/` import must land as its own commit,
produced by a real pipeline run, never mixed into a code PR** — otherwise a reviewer faces
1,038 generated JSON files alongside authored code.

---

## Migration / Rollout

No migration — greenfield. Rollout is the slice chain above. The site is publicly
announced only after slice 4b, so an incomplete archive is never presented as complete.
Rollback per the proposal: `git revert` the sync commit for data, redeploy the previous
static build for the site, disable the scheduled workflow for sync — after which the
30-day notice appears on schedule, degraded but honest.

## Open Questions

- [ ] **`hcd@fragua.dev` routing is unconfirmed.** Blocks slice 5 acceptance only; the
      GitHub failure-email fail-safe means it blocks nothing else.
- [x] ~~**Listing page markup is unread.**~~ **RESOLVED** by the 2026-08-04 fetch. The
      listing is `https://hcdrosales.gob.ar/?lsvr_document_cat=ordenanzas`, a WordPress
      `lsvr_document` post tree. Parser shape is settled in **D9**: select
      `a.post-tree__item-link--file` by class inside the nested
      `ul.post-tree__children--level-N`, unescape HTML entities, ignore nesting depth.
      The listing does **not** expose a year — only an upload path, which D10 forbids using
      — so the body-header year fallback is still required. The captured HTML is committed
      as an offline fixture, so `listing.py` no longer blocks on live access.
- [x] ~~**`year` derivation for filenames without an expediente year token.**~~
      **RESOLVED** in **D10**, then CORRECTED 2026-08-05. Priority is (1) the
      `Punta Alta, … de {yyyy}` header, (2) expediente
      header line transcribed from the document, (3) `null` + an `Año no determinado`
      filter bucket. The "listing structure if present" step is **removed**: the listing
      carries no sanction year, and its `/uploads/YYYY/` path is upload date — 61% of the
      corpus sits under 2021 from one bulk upload — so it is explicitly prohibited as a
      year source. Step (2) transcribes a date printed on the document rather than
      inferring one, so it does not breach no-fabrication.
- [ ] **Cloudflare Pages project + API token** must exist before slice 5.
