# Code review rules — searchable ordinance archive

Rules for reviewing changes to this repository. They are not style preferences: each one
exists because a specific defect got through, or would have.

Authoritative context lives in `openspec/changes/searchable-ordinance-archive/design.md`
(decisions D1–D13) and the capability specs beside it. When this file and the design
disagree, the design wins and this file is wrong — say so in the review.

## What this project is

A free, unofficial, static archive of the ~1,038 documents the Honorable Concejo
Deliberante of Coronel Rosales publishes. Two programs joined by committed JSON: a Python
ingestion pipeline (`pipeline/`) and an Astro static site (`site/`). No backend, no
database, no user accounts, no personal data.

## Non-negotiables — flag any change that breaks one

**Zero variable cost.** Nothing in the running system may scale in price with traffic. A
per-request paid call, a metered CDN feature, or git-lfs (its bandwidth is metered) all
breach this.

**No fabrication.** Titles, ordinance numbers, years, `expediente` values and document
types are transcribed from the source or marked absent. Never inferred, never guessed,
never derived from subject matter or body text. `Ordenanza {n}` in a heading is an
identifier occupying the title slot, not a substitute title.

**Strict political neutrality.** The site presents official documents and nothing else. No
commentary, ranking, summarising, or highlighting. Cross-references render undirected, with
no verb and no relationship label — claiming "this ordinance modifies X" would assert a
legal relationship derived from a regex over a title.

**Fail visibly.** Stale or missing data must be visible to the user. A silent fallback that
ships an incomplete page is worse than a loud failure.

**Politeness toward the source.** Single concurrency, ≥4s between requests, an honestly
identifying `User-Agent` carrying a contact URL and `hcd@fragua.dev`, bounded retries. The
`robots.txt` check runs every run and HALTs if it ever returns 200. This is a government
server in a town of ~65k people; reputation is the product's primary asset.

**OCR is out of scope.** Documents with no text layer are indexed by metadata and marked
`no_text`. That is an expected outcome, never an `error`.

## Rules with teeth

**Any hardening rule must be replayed over all 1,038 real stems before it lands.** This
project has shipped four rules that looked correct and rejected real documents: an ASCII
allowlist rejected one ordinance carrying `N°`; a trailing-dot ban rejected three more;
treating a `doc_id` collision as fatal would have halted the first run; and a
marker-first type priority misclassified 67 ordinances. Every one passed reading and failed
data. The whole-corpus tests exist for this — a new validation rule without one is a
blocking finding.

**`doc_id` is the identity; `number` is a nullable attribute.** Measured against the
shipped manifest: 987 numbered records carry only 943 distinct numbers, and 51 records
carry no number at all. Any code keying on
`number` for identity, uniqueness, or a filesystem path is a bug.

**Path safety is reject-only.** `doc_id` is a remote-controlled string that becomes a
filesystem path. Validate the percent-decoded, NFC-normalized value; reject anything
outside the rules in D7. There must be no sanitising, truncating or slugifying branch —
its output could round-trip back into a path. Every write additionally resolves its final
path and asserts containment.

**Cross-reference links are manifest-gated.** A number renders as a link only if it
resolves to a known record. Unresolvable numbers are logged, never linked, never
fuzzy-matched. A number may resolve to more than one record; keep them all.

**Tests are the specification, and they are reviewed.** `strict_tdd` is on: a failing test
comes before the code it pins. Review whether the test actually fails first for the stated
reason — a test written alongside its implementation proves less than it appears to.

Test files are deliberately not excluded from review. They encode the measured corpus facts
— 1,038 records, exactly four suffixed ids, the D5 hard negatives, the 394 expediente
coverage — so a wrong assertion is as damaging as wrong code, and it fails silently by
passing. Two assertions in this project were already wrong in ways only a corpus replay
caught: one recorded a coverage number derived from a regex that rejected the BRIEF's own
example, and one flagged any digit following a captured value as truncation, which
false-positives on a title that begins with a number.

**Report what ran.** "Tests pass" is not "the gates pass". Both must be run and quoted:
- test:  `uv run --directory pipeline pytest -q && pnpm --dir site run test`
- build: `uv run --directory pipeline ruff check src tests && uv run --directory pipeline mypy src && pnpm --dir site run check && pnpm --dir site run build`

## Language

Code, identifiers, comments, commits and technical docs: **English**.
User-facing site copy: **Spanish**, neutral and professional — the audience is residents
and municipal officials.

## What not to flag

`data/**` is pipeline output, not authored code. `pipeline/tests/fixtures/*.html` is a
verbatim capture of the source listing — it is evidence, and must never be reformatted or
"corrected". Both are excluded in `.gga`; if they appear in a diff, review the code that
produced them instead.

## Design system

`DESIGN.md` at the repo root is the source of truth for every visual decision: fonts,
colour, spacing, layout, motion, and the three deliberate risks. Read it before changing
anything that renders, and flag any code that departs from it without a stated reason.

DESIGN.md's "Implementation gap" section tracks adoption item by item, and all five have
landed. `site/` no longer predates the design: any mismatch with DESIGN.md is now a
finding, not expected drift.
