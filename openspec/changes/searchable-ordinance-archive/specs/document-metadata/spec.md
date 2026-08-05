# Document Metadata Specification

## Purpose

Derive document identity, ordinance number, `expediente`, year, title and
document type from each listing entry — its anchor text and its PDF filename —
with a defined, honest degradation path for entries that do not carry a
descriptive title, a number, or a stated type, and an absolute prohibition on
fabricating any of them.

## Requirements

### Requirement: Metadata Extraction From the Listing Entry

The system MUST extract, for every listing entry, the document identity
(`doc_id`), the ordinance number when present, `expediente` (originating file
number, when present in the filename), year, title, `title_source` and
`doc_type`. Extraction MUST read both the listing anchor text and the PDF
filename; neither alone is sufficient.

#### Scenario: Entry with a descriptive anchor and filename

- GIVEN a listing anchor `3653 – Recorrido ómnibus larga distancia` linking to
  `3653-COR03-17-Recorrido-omnibus-larga-distancia.pdf`
- WHEN metadata extraction runs
- THEN the record has `doc_id`
  `3653-COR03-17-Recorrido-omnibus-larga-distancia`, number `3653`, an
  `expediente` value, `doc_type` `ordenanza`, and title
  "Recorrido ómnibus larga distancia"
- AND `title_source` is `listing`

### Requirement: Title Source Priority

The title MUST be taken from the listing anchor text first, from the filename
slug second, and MUST be marked absent third. `title_source` MUST record which
of the three applied, with the value `listing`, `filename` or `none`.

The listing anchor text is the only place the source publishes accented titles;
the filename slug has had its accents stripped by the publishing platform. The
system MUST NOT restore accents to a slug-derived title.

#### Scenario: Anchor text carries the accented title

- GIVEN a listing anchor `4457 &#8211; Mesa de Gestión del Agua` linking to
  `4457-Mesa-de-Gestion-del-Agua.pdf`
- WHEN metadata extraction runs
- THEN the HTML entity is unescaped, the leading number and its separator are
  stripped, and the title is "Mesa de Gestión del Agua" with its accents
- AND `title_source` is `listing`

#### Scenario: Anchor text unusable, filename slug used

- GIVEN a listing entry whose anchor text is empty or carries no alphabetic
  token of at least three characters, but whose filename slug does
- WHEN metadata extraction runs
- THEN the title is the slug with `-` replaced by spaces, verbatim otherwise —
  original casing kept, no title-casing, no expansion, no translation, and no
  accent restoration
- AND `title_source` is `filename`

#### Scenario: Number-only entry

- GIVEN a listing entry whose anchor text and filename both carry only a
  number
- WHEN metadata extraction runs
- THEN the number is populated
- AND the title field is marked absent (not fabricated, not left ambiguous)
- AND `title_source` is `none`

### Requirement: No-Fabrication Fallback

The system MUST NOT invent, guess, or infer a descriptive title from any source
other than the listing anchor text or the filename. Deriving a title from the
document's body text is prohibited, even when the body's opening line reads
like a title.

#### Scenario: Body text is never used as a title

- GIVEN a record whose title is absent and whose extracted body text begins
  `Artículo 1º: MESA DEL AGUA: Créase…`
- WHEN metadata extraction runs
- THEN the title field remains absent
- AND no fragment of the body text is stored in the title field

#### Scenario: Entry matching no known pattern

- GIVEN a listing entry that matches neither the descriptive nor the
  number-only pattern
- WHEN metadata extraction runs
- THEN whatever fields can be reliably derived are populated
- AND every field that cannot be reliably derived is marked absent, EXCEPT
  `doc_id`, which is required: a document record cannot exist without it
- AND the record is still written to the manifest, because a missing number,
  title or year is not an identity failure

### Requirement: Ordinance Number Is a Nullable Attribute

The ordinance number MUST be modelled as a nullable attribute
(`int | null`), not as the record's identity, and MUST NOT be treated as
unique. Document identity is `doc_id`, specified by the source-sync
capability. A record whose number cannot be derived MUST still be written to
the manifest.

#### Scenario: Entry with no leading ordinance number

- GIVEN a listing entry `Convenio-Ministerio-de-las-Mujeres.pdf` whose anchor
  text carries no leading number
- WHEN metadata extraction runs
- THEN the record is written to the manifest with number marked absent
- AND `doc_id` is `Convenio-Ministerio-de-las-Mujeres`
- AND no number is invented, inferred from neighbouring entries, or assigned
  by position in the listing

#### Scenario: Two records share one ordinance number

- GIVEN two listing entries whose numbers are both `3296`
- WHEN metadata extraction runs
- THEN both records are written, each with its own `doc_id`
- AND neither is dropped, merged, or marked as the preferred record

### Requirement: Document Type Classification From Explicit Evidence

The system MUST assign every record a `doc_type` from
`ordenanza | convenio | resolucion | decreto | anexo | preparatoria |
sin clasificar`, derived from explicit evidence only, in this priority: a record
carrying its own ordinance number is `ordenanza`; otherwise an explicit type
marker in the anchor text or filename decides; otherwise `sin clasificar`.

The system MUST NOT infer a type from the document's subject matter, from its
body text, or from the category it was published under. A type marker appearing
in the title of a record that has its own ordinance number describes what that
ordinance is ABOUT and MUST NOT change its type.

#### Scenario: Explicit marker in the filename

- GIVEN a listing entry `Convenio-Ministerio-de-las-Mujeres.pdf`
- WHEN classification runs
- THEN `doc_type` is `convenio`

#### Scenario: Marker classifies a record that has no ordinance number

- GIVEN a listing entry
  `Dec.-377-Promulga-Ordenanza-3288-D-417-11.doc.pdf`, whose only
  ordinance-shaped number is the `3288` it promulgates — a reference, not its
  own identity
- WHEN classification runs
- THEN the record's own number is absent
- AND `doc_type` is `decreto`, decided by the explicit marker

#### Scenario: An ordinance about a convenio is still an ordenanza

- GIVEN a listing entry `4344-I752024-Convenio-Fundacion-Saber.pdf` whose own
  ordinance number is `4344` and whose title contains the marker `Convenio`
- WHEN classification runs
- THEN `doc_type` is `ordenanza`
- AND the marker in the title does not change the type, because it describes
  what the ordinance is about rather than what the document is

#### Scenario: Ordinance number implies ordenanza

- GIVEN a listing entry `4457-Mesa-de-Gestion-del-Agua.pdf` with no explicit
  type marker
- WHEN classification runs
- THEN `doc_type` is `ordenanza`

#### Scenario: Subject matter is never used to guess a type

- GIVEN a listing entry `Calle-Irigoyen.pdf` with no explicit type marker and
  no ordinance number
- WHEN classification runs
- THEN `doc_type` is `sin clasificar`
- AND no type is assigned from what the document appears to be about

### Requirement: Expediente Extraction From Known Families Only

The `expediente` MUST be taken only from the token immediately following the
leading ordinance number, and only when that token matches one of three known
families: the GDE form (`EX`/`IF`/`ME`/`NO`/`PV`, a four-digit year, a six- to
nine-digit sequence, and one or two uppercase organisational codes), the compact
form (one to four letters, a one- to three-digit sequence, and a four-digit
year, concatenated), or the dashed form (one to four letters, an optional dash, a
sequence, a dash, and a two- to four-digit year — `COR03-17` carries no dash
after its letters and must still match).

Matching MUST be longest-first, so a longer family is never truncated into a
shorter one. A captured `expediente` MUST NOT be a strict prefix of a longer
expediente-shaped token in the same filename.

Every other case MUST mark the `expediente` absent. In particular, a
letter-plus-digits token that carries no year MUST NOT be captured: nothing in
the source distinguishes a year-less file number from an abbreviation that
begins the title, and capturing it would be a guess.

An absent `expediente` is the common case and MUST NOT be treated as an
extraction failure, MUST NOT affect `last_run_status`, and MUST NOT be escalated.

#### Scenario: Modern GDE expediente is captured whole

- GIVEN a listing entry
  `4448-EX-2025-00106406-MUNICRO-DCSE-Presupuesto-2026.pdf`
- WHEN metadata extraction runs
- THEN the `expediente` is `EX-2025-00106406-MUNICRO-DCSE`
- AND it is not truncated to `EX-2025`

#### Scenario: Compact and dashed forms are captured

- GIVEN listing entries `4440-O822024-Modifica-Ordenanza-3766.pdf` and
  `3653-COR03-17-Recorrido-omnibus-larga-distancia.pdf`
- WHEN metadata extraction runs
- THEN their `expediente` values are `O822024` and `COR03-17`

#### Scenario: Title-leading token is never mistaken for an expediente

- GIVEN a listing entry `4457-Mesa-de-Gestion-del-Agua.pdf`
- WHEN metadata extraction runs
- THEN the `expediente` is absent
- AND `Mesa` is not captured as a file number

#### Scenario: Year-less letter-digit token stays absent

- GIVEN a listing entry `4372-O89-Lugar-Historico-Casa-en-Villa-Arias.pdf`
- WHEN metadata extraction runs
- THEN the `expediente` is absent, because `O89` carries no year and the source
  does not distinguish it from a title abbreviation
- AND the record's `last_run_status` contribution is unaffected

### Requirement: Year Derivation

The system MUST derive the ordinance year from the `Punta Alta, … de {yyyy}`
header line transcribed from the document first, from the `expediente` year
token second, and MUST mark the year absent third, placing the record in an
`Año no determinado` filter bucket.

The header wins because the two sources state different facts: the expediente
year is when the file was opened, the header is the date the HCD printed when it
sanctioned the ordinance. The year MUST be read from the END of an expediente,
never from the first four-digit run inside it, and a four-digit tail below 2000
MUST be re-read as a two-digit year in the 2000s.

The system MUST NOT use the source URL's upload path segment
(`/wp-content/uploads/YYYY/MM/`) as the ordinance year, as a tiebreak, or as a
fallback preferred over an absent year: that segment records when the file was
uploaded, not when the ordinance was sanctioned.

#### Scenario: Year present in the expediente

- GIVEN a filename encoding an `expediente` with a year token
- WHEN metadata extraction runs
- THEN the year field matches the encoded value

#### Scenario: Year transcribed from the document header

- GIVEN a record with no `expediente` year token whose extracted text begins
  `Punta Alta, 27 de enero de 2.026`
- WHEN metadata extraction runs
- THEN the year field is `2026`, transcribed from the document itself

#### Scenario: Upload path year is never used

- GIVEN a record with no `expediente` year token and no transcribable header
  date, whose source URL is under `/wp-content/uploads/2021/03/`
- WHEN metadata extraction runs
- THEN the year field is marked absent
- AND the record is placed in the `Año no determinado` bucket
- AND `2021` is not recorded as the ordinance year

### Requirement: Metadata Surfaced Without Fabrication Downstream

Search, detail views and cross-references MUST render an absent title as an
explicit absent state (e.g. "sin título disponible" in user-facing copy),
never as a placeholder that could be mistaken for real source data.

#### Scenario: Search result for a title-absent record

- GIVEN a record with title marked absent
- WHEN it appears in a search result or listing
- THEN the UI shows the ordinance number and an explicit "no title
  available" indicator instead of blank or synthesized text
