# Source Sync Specification

## Purpose

Polite, incremental, auditable fetching of the HCD ordinance listing and PDFs
into a local/committed archive, with a `robots.txt` halt condition and
recorded sync status for downstream staleness display.

## Requirements

### Requirement: Incremental Listing Sync

The system MUST fetch the single HCD listing page at
`https://hcdrosales.gob.ar/?lsvr_document_cat=ordenanzas` on every run and MUST
download only documents whose `doc_id` is not already present in the
archive/manifest.

#### Scenario: Re-run downloads nothing new

- GIVEN a manifest already containing every currently published document
- WHEN the sync runs again with no new documents published
- THEN zero PDF downloads occur
- AND the manifest is unchanged except for `last_run_at`

#### Scenario: New ordinance published since last sync

- GIVEN a manifest missing the record whose `doc_id` is `4458-Presupuesto`
- WHEN the sync runs and the listing now includes it
- THEN only that document is downloaded
- AND the manifest gains exactly one new record

### Requirement: Listing Parsing From the Document Tree Markup

The listing is a nested document tree, not a flat list. The system MUST select
entries by the anchor class `post-tree__item-link--file` wherever they occur
within the `post-tree__children--level-N` nesting, MUST unescape HTML entities
in the anchor text before using it, and MUST NOT derive any meaning from
nesting depth, sibling position, or ordering.

#### Scenario: Anchors are found at every nesting level

- GIVEN a listing whose entries are nested across several
  `post-tree__children--level-N` lists
- WHEN the listing is parsed
- THEN every anchor carrying the `post-tree__item-link--file` class is
  collected, regardless of its depth
- AND no field of any record is derived from the depth at which it was found

#### Scenario: HTML entities in anchor text are unescaped

- GIVEN an anchor whose markup reads `4457 &#8211; Mesa de Gestión del Agua`
- WHEN the listing is parsed
- THEN the recovered anchor text contains the en-dash character, not the
  entity
- AND the leading number and separator are stripped before the title is taken

#### Scenario: Listing markup changes so that zero anchors parse

- GIVEN a listing page whose markup no longer yields any matching anchor
- WHEN the sync parses it
- THEN `last_run_status` is recorded as `error` and the operator is escalated
- AND no file under `data/` is rewritten, so the site keeps serving the last
  good archive

### Requirement: Polite Crawling Policy

The system MUST fetch with single concurrency, an enforced delay between
requests, an honestly identifying `User-Agent` carrying a Fragua-owned
contact URL and `hcd@fragua.dev`, a local cache preventing re-download of
already-archived files, and bounded retries with a stop condition on
persistent error.

#### Scenario: Persistent fetch failure stops the run

- GIVEN a document request fails repeatedly beyond the retry bound
- WHEN the bound is reached
- THEN the sync stops fetching further new documents for that run
- AND records a non-success `last_run_status`

### Requirement: robots.txt Halt Condition

The system MUST re-check `robots.txt` at the start of every run and MUST
halt the entire run without fetching any document if `robots.txt` returns
HTTP 200 (a crawl restriction now exists, where none did before).

#### Scenario: robots.txt still 404s

- GIVEN `robots.txt` returns 404
- WHEN the sync run starts
- THEN the run proceeds normally

#### Scenario: robots.txt starts returning 200

- GIVEN `robots.txt` now returns HTTP 200
- WHEN the sync run starts
- THEN the run halts before fetching any listing or document
- AND `last_run_status` is recorded as `halted`
- AND escalation (per provenance-and-staleness / operator alerting) is triggered

### Requirement: A Record Describes Its Fetch State

Every manifest record MUST carry a `status` of `pending`, `ok`, `no_text` or
`error`.

`pending` means the document is known and described from the listing but has
never been fetched: `sha256`, `bytes`, `fetched_at` and `text_path` are all
absent. It is distinct from `error`, which means a fetch was attempted and
failed.

`pending` MUST NOT satisfy the already-archived skip — only `ok` and `no_text`
do — so a `pending` record is fetched on the next run that has a network layer.
`pending` MUST NOT set `last_run_status` to `error` or `partial` and MUST NOT
escalate. A record MUST NOT transition back to `pending` once fetched.

A `pending` record MUST remain fully discoverable by its metadata, since none of
that metadata comes from the PDF.

#### Scenario: Listing-only run produces pending records

- GIVEN a run that builds the manifest from the listing without fetching
- WHEN it finishes
- THEN every new record has `status` `pending` with no checksum, byte count,
  fetch timestamp or text path
- AND `last_run_status` is `ok`, because nothing failed

#### Scenario: A pending record is fetched on the next run

- GIVEN a manifest containing a `pending` record
- WHEN a run with a network layer processes the same listing entry
- THEN the document is fetched exactly once
- AND its status becomes `ok`, `no_text` or `error`
- AND no record anywhere returns to `pending`

### Requirement: Sync Status Recording

The system MUST record, per run, `last_run_at`, `last_run_status`
(`ok | partial | error | halted`), and the count of documents added, in a
committed, machine-readable record consumed by the site build.

#### Scenario: Successful run recorded

- GIVEN a run completes without error
- WHEN it finishes
- THEN `last_run_status` is `ok` and `last_run_at` is updated

### Requirement: Document Identity Is doc_id

Every document record MUST be identified by `doc_id`, derived as the final path
segment of the document's source URL with the trailing `.pdf` removed, and
disambiguated only when it collides with another record's stem. Every
local archive path, every per-document JSON filename and every detail page
route MUST derive from `doc_id`.

The ordinance number MUST NOT be used as the identity, because it is not
unique: the source publishes multiple records under the same number. An entry
whose ordinance number cannot be derived is still a document record and MUST be
written to the manifest with its number marked absent.

#### Scenario: doc_id derived from the source URL

- GIVEN a listing entry linking to
  `https://hcdrosales.gob.ar/wp-content/uploads/2026/01/4457-Mesa-de-Gestion-del-Agua.pdf`
- WHEN the sync processes the listing
- THEN `doc_id` is `4457-Mesa-de-Gestion-del-Agua`
- AND the archived PDF, the per-document JSON and the detail page route all
  derive from that `doc_id`

#### Scenario: Entry with no derivable ordinance number is still a record

- GIVEN a listing entry linking to `Convenio-Ministerio-de-las-Mujeres.pdf`
- WHEN the sync processes the listing
- THEN a manifest record is written with `doc_id`
  `Convenio-Ministerio-de-las-Mujeres` and its number marked absent
- AND the document is fetched and archived normally
- AND the run is not marked `partial` for this reason alone

### Requirement: doc_id Path-Safety Validation

`doc_id` originates from a third-party listing and is used to build local
filesystem paths, so it MUST be validated before any path is built from it. The
purpose of the rule is to prevent path traversal, NOT to restrict the alphabet:
non-ASCII letters and marks MUST be accepted, because ordinary Spanish legal
typography such as `N°` occurs in real published filenames.

The system MUST percent-decode the candidate and then NFC-normalize it, and
MUST reject it if normalization changes the value. The system MUST then reject
any value that contains `/`, `\`, a null byte, a C0 or C1 control character, or
`..` as a substring; that equals `.` or `..`; that begins with `.` or `-`; that
ends with a space; that matches a reserved device name (`CON`, `PRN`,
`AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`, case-insensitive); or that exceeds
120 characters. Every other value MUST be accepted.

A value ending in `.` MUST be accepted. Three real published filenames carry a
stray dot before the extension, and every on-disk name is written as
`{doc_id}.json` or `{doc_id}.pdf`, so a trailing dot in the identifier can never
produce a bare trailing-dot filename.

A rejected entry MUST NOT be sanitised, truncated, slugified or otherwise
repaired into a conforming value, and MUST NOT be written to disk under any
name. Independently of this rule, every write MUST resolve its final path and
assert containment within its intended directory.

#### Scenario: Traversal attempt is rejected, not repaired

- GIVEN a listing entry whose URL yields a `doc_id` of `../../etc/passwd`
- WHEN the sync processes the listing
- THEN the entry is rejected and recorded in
  `data/unresolved-listing-entries.json` with its URL and raw filename
- AND the document is not fetched
- AND no file is written anywhere outside `archive/` and `data/documents/`
- AND the run ends with `last_run_status` of `partial` and escalates to the
  operator
- AND the previously archived documents are left untouched

#### Scenario: Percent-encoded traversal is decoded before validation

- GIVEN a listing entry whose URL yields a raw `doc_id` of `4457%2f..%2f`
- WHEN the sync validates it
- THEN validation runs on the decoded value and the entry is rejected

#### Scenario: Normalization-unstable value is rejected

- GIVEN a listing entry whose decoded `doc_id` changes under NFC normalization
- WHEN the sync validates it
- THEN the entry is rejected, without the system needing to enumerate the
  specific homoglyph or encoding trick used

#### Scenario: Non-ASCII legal typography is accepted

- GIVEN a listing entry yielding the `doc_id`
  `4298-O252023-Ley-Provincial-N°-15430.-Carga-administrativa`
- WHEN the sync validates it
- THEN it passes validation and the document is fetched and archived normally
- AND `last_run_status` is `ok`

#### Scenario: Legitimate punctuation is accepted

- GIVEN listing entries yielding `doc_id` values `3296-1`, `Convenio` and
  `Dec.-377-Promulga-Ordenanza-3288-D-417-11.doc`
- WHEN the sync validates them
- THEN all three pass validation and are archived normally

### Requirement: doc_id Collisions Are Resolved, Not Escalated

Two entries with distinct source URLs can share a filename stem, because the
same filename may be published under different upload paths. The system MUST
resolve such a collision deterministically and MUST NOT treat it as an error,
drop either document, or halt the run.

The system MUST disambiguate ONLY the colliding records, by appending the
upload path's year and month to the stem, and MUST leave every non-colliding
record's `doc_id` as the clean stem.

#### Scenario: Same filename stem under two upload months

- GIVEN listing entries
  `https://hcdrosales.gob.ar/wp-content/uploads/2021/11/3298.pdf` and
  `https://hcdrosales.gob.ar/wp-content/uploads/2021/12/3298.pdf`
- WHEN the sync processes the listing
- THEN two records exist, with `doc_id` `3298--2021-11` and `3298--2021-12`
- AND both documents are fetched and archived
- AND `last_run_status` is `ok`

#### Scenario: Non-colliding records keep their clean stem

- GIVEN a listing containing both the colliding pair above and other entries
  with unique stems
- WHEN the sync processes the listing
- THEN no non-colliding record receives an upload-path suffix
- AND no existing record's `doc_id` changes because another entry collided

### Requirement: Retired doc_ids Are Recorded as Append-Only Aliases

Because `doc_id` is a public URL component, a change to a record's `doc_id` would break
every externally cited link to it. Whenever a record's `doc_id` changes, for any reason,
the system MUST record the previous id as an alias resolving to the new id, in a
committed, versioned artifact `data/doc-id-aliases.json`.

The alias map MUST be append-only. An existing entry MUST NOT be deleted, MUST NOT have
its target changed to a different document, and its alias string MUST NOT be reused as
the identity of any other record. Alias strings MUST pass the same path-safety validation
as a live `doc_id`.

#### Scenario: A doc_id changes and the old id becomes an alias

- GIVEN a record previously published with `doc_id` `3298`
- WHEN a later run derives `doc_id` `3298--2021-11` for that same document
- THEN `data/doc-id-aliases.json` gains an entry mapping alias `3298` to target
  `3298--2021-11`
- AND the manifest record itself carries only the current `doc_id`

#### Scenario: Aliases survive later runs untouched

- GIVEN an alias map containing entries from an earlier run
- WHEN the sync runs again
- THEN every existing entry is still present, with an unchanged target and creation
  timestamp
- AND no entry is removed, repointed, or reused for a different record

#### Scenario: Rewriting an alias to a different target is refused

- GIVEN an alias already resolving to one document
- WHEN a run would map that same alias string to a different document
- THEN the write is refused and the run fails loudly rather than silently serving the
  wrong document to a cited link

### Requirement: Identical Source URL Collapses to One Record

If the listing renders the same byte-identical source URL more than once, the
system MUST collapse those entries into exactly one record, before any fetch.
This MUST NOT be recorded as an error, MUST NOT set `last_run_status` to
`partial`, and MUST NOT produce an unresolved-listing entry. This is a
defensive rule; the corpus as measured contains no duplicated URL.

#### Scenario: The same URL appears twice in the listing

- GIVEN a listing in which one document's URL appears twice, byte-identical
- WHEN the sync parses the listing
- THEN exactly one manifest record exists for that URL
- AND the PDF is fetched at most once
- AND `last_run_status` is `ok`

### Requirement: Two Records Sharing an Ordinance Number Are Variants

When two distinct documents carry the same ordinance number, the system MUST
keep both as separate records and MUST expose each to the other as a variant of
that number. Neither record may be dropped, merged, overwritten, or presented
as the authoritative one.

#### Scenario: Re-upload collision produces two records

- GIVEN listing entries yielding `doc_id` values `3296` and `3296-1`, both
  carrying ordinance number 3296
- WHEN the sync processes the listing
- THEN two manifest records exist, each with its own `doc_id`, archived PDF and
  per-document JSON
- AND each record lists the other in its number-variant set
- AND neither record is marked as current, superseding, or preferred

### Requirement: Checksum-Verified Local Archive

The system MUST store a checksum (sha256) for every archived PDF and MUST
use it to detect drift between the cached copy and any re-fetch.

#### Scenario: Cached file matches checksum

- GIVEN an already-archived PDF with a stored sha256
- WHEN the sync considers it during a run
- THEN it is not re-downloaded because the manifest already marks it archived
