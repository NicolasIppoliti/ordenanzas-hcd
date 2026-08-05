# Ordinance Search Specification

## Purpose

Let a visitor find any published document by full text, by year or by document
type, with results that show enough context to identify the right document,
that never hide which portion of the corpus has no indexed text, and that never
let a document of one type be mistaken for another.

## Requirements

### Requirement: Full-Text Search

The system MUST provide full-text search across the extracted text of all
`ok`-status documents, returning document type, ordinance number (when
present), title (or its explicit absent marker), year and a matching excerpt
per result.

#### Scenario: Query matches text-bearing documents

- GIVEN a search term present in one or more `ok`-status documents' text
- WHEN the visitor submits the query
- THEN results include those documents with a short excerpt showing the
  match in context

#### Scenario: Query matches nothing

- GIVEN a search term matching no document
- WHEN the visitor submits the query
- THEN the site shows a Spanish "no results" state, not an error

### Requirement: Year Filter

The system MUST let a visitor filter results (search or browse) to a
specific year or narrow the corpus by year.

#### Scenario: Filter by year

- GIVEN the visitor selects year 2021
- WHEN the filter is applied
- THEN only documents with year 2021 are shown

#### Scenario: Documents with no determinable year remain reachable

- GIVEN documents whose year is marked absent
- WHEN the visitor browses or filters by year
- THEN those documents appear under an explicit `Año no determinado` bucket
- AND no year is inferred for them so they can be placed in a real year

### Requirement: Document Type Is Visible in Every Result

The `ordenanzas` category as published also contains convenios, resoluciones,
decretos, anexos and preparatorias. Every search result and every list entry
MUST display the record's document type as text, so a non-ordinance document
can never be read as an ordinance. The type MUST NOT be conveyed by colour,
icon or position alone. The system MUST also let a visitor filter by document
type.

#### Scenario: A convenio appears in results

- GIVEN a record whose type is `convenio` matching the query
- WHEN it appears in results
- THEN the result carries the visible Spanish label `Convenio`
- AND nothing in the result labels or formats it as `Ordenanza`

#### Scenario: An unclassified document appears in results

- GIVEN a record whose type is `sin clasificar`
- WHEN it appears in results
- THEN it carries the visible label `Documento sin clasificar`
- AND no type is guessed for it from its title or subject matter

#### Scenario: Filter by document type

- GIVEN the visitor filters by type `Convenio`
- WHEN the filter is applied
- THEN only records classified `convenio` are shown

#### Scenario: The type filter exposes every type in the corpus

- GIVEN the visitor opens the type filter
- WHEN its options render
- THEN they are exactly `Ordenanza`, `Convenio`, `Decreto`, `Resolución`,
  `Anexo`, `Preparatoria` and `Sin clasificar`

### Requirement: Corpus Copy Counts Documents, Not Ordinances

Because the corpus includes documents that are not ordinances, user-facing copy
that counts or names the corpus MUST say "documentos", never "ordenanzas".

#### Scenario: Search page describes the corpus neutrally

- GIVEN the visitor opens the search page
- WHEN the corpus is described or counted in the interface
- THEN the copy reads `Buscar en 1.038 documentos`, not a count of ordinances
- AND no interface text implies that every indexed record is an ordinance

### Requirement: Records Without an Ordinance Number Are Findable

Some published documents carry no ordinance number. Search MUST still find them
by their remaining metadata and text, and MUST NOT display an invented,
placeholder or positional number for them.

#### Scenario: Numberless document matches a query

- GIVEN a record with no ordinance number whose title matches the query
- WHEN it appears in results
- THEN it is shown with its type label and title
- AND no number is rendered in place of the absent one

### Requirement: Metadata-Only Results Explicitly Marked

Search results MUST never present a `no_text` document as if it matched a
full-text query. `no_text` documents MUST only appear via metadata match
(number/`expediente`/year/title) and MUST carry an explicit "no indexed
text" marker in the result.

#### Scenario: Metadata search surfaces a no_text document

- GIVEN a `no_text` document whose number matches the query
- WHEN search runs
- THEN it appears in results marked as having no indexed text
- AND no excerpt is shown for it

### Requirement: Mobile-Usable, Accessible Results

Search MUST be usable on a mobile device and MUST meet WCAG 2.1 AA
(keyboard navigable, visible focus, semantic HTML, adequate contrast).

#### Scenario: Keyboard-only search

- GIVEN a visitor navigating by keyboard only
- WHEN they reach the search input and results
- THEN every interactive element is reachable and operable via keyboard
  with a visible focus indicator
