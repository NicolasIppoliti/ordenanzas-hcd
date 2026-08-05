# Ordinance Detail Specification

## Purpose

Give every one of the 1,038 published documents a dedicated page showing its
metadata, its document type, its extracted text when available, and an
unambiguous link back to the official PDF — the authoritative source.

## Requirements

### Requirement: Detail Page Per Document

The system MUST generate a detail page for every record in the manifest at the
route `/documento/{doc_id}`, showing document type, ordinance number (when
present),
`expediente` (if known), year, title (or its explicit absent marker), and a
link to the official PDF at `hcdrosales.gob.ar`.

#### Scenario: Detail page for an ok-status ordinance

- GIVEN an ordinance with status `ok`
- WHEN its detail page renders
- THEN metadata, the extracted text, and the official PDF link are all
  shown

#### Scenario: Detail page for a no_text ordinance

- GIVEN an ordinance with status `no_text`
- WHEN its detail page renders
- THEN metadata and the official PDF link are shown
- AND an explicit no-indexed-text notice replaces the text section

#### Scenario: The route is document-neutral for every type

- GIVEN records of any type, including `convenio` and `sin clasificar`
- WHEN their detail pages are generated
- THEN every one is served from `/documento/{doc_id}`
- AND no record is served from a type-specific route such as `/ordenanza/…`

### Requirement: Every Published Alias Resolves to Its Current Document

Every alias in `data/doc-id-aliases.json` MUST produce a working route in the
built site, so a URL published earlier keeps working. Because the site is
statically generated and has no server, the system MUST emit one static page
per alias that sends the visitor to the current document, carrying a canonical
link to it and a visible fallback link for clients that do not follow the
redirect.

An alias whose target does not exist in the manifest MUST fail the build. It
MUST NOT be skipped silently and MUST NOT be emitted as a page pointing at a
route that was never generated.

#### Scenario: A previously published URL still resolves

- GIVEN an alias `3298` resolving to `3298--2021-11`
- WHEN the site is built
- THEN a page is emitted for the alias route
- AND it directs the visitor to `/documento/3298--2021-11`, states in neutral
  Spanish that the document is now at another address, and offers a visible
  link to it

#### Scenario: An alias with a missing target fails the build

- GIVEN an alias whose target `doc_id` is absent from the manifest
- WHEN the site is built
- THEN the build fails with an error naming the alias and its missing target
- AND no page is emitted for that alias

### Requirement: Document Type Is Visible on Every Detail Page

Every detail page MUST display the record's document type as text, in the page
heading and in the metadata block, so a convenio, resolución, decreto, anexo or
preparatoria can never be read as an ordinance. The heading MUST NOT prefix a
non-ordinance record with `Ordenanza`.

#### Scenario: Detail page for a convenio

- GIVEN a record whose type is `convenio`
- WHEN its detail page renders
- THEN the heading reads `Convenio — {título}` and the metadata block shows
  `Tipo de documento: Convenio`
- AND the word `Ordenanza` does not appear as this document's own designation

#### Scenario: Detail page for an unclassified document

- GIVEN a record whose type is `sin clasificar`
- WHEN its detail page renders
- THEN it is labelled `Documento sin clasificar`
- AND a neutral line states that the source does not indicate the type, for
  example `El origen no indica el tipo de este documento.`
- AND no type is inferred from the document's subject matter

### Requirement: Detail Page for a Record Without an Ordinance Number

A record whose ordinance number is absent MUST still render a complete detail
page, and MUST NOT display an invented, placeholder or positional number.

#### Scenario: Numberless record renders

- GIVEN a record with no ordinance number
- WHEN its detail page renders
- THEN the heading uses the document type and title, with no number
- AND the metadata block omits the number rather than showing a substitute
- AND the official PDF link and any extracted text are still shown

### Requirement: Records Sharing an Ordinance Number Are Cross-Linked

When more than one record carries the same ordinance number, each of their
detail pages MUST disclose that fact and link to its siblings, without
asserting which one is current, superseding or authoritative.

#### Scenario: Two records share a number

- GIVEN two records both carrying ordinance number 3296
- WHEN either detail page renders
- THEN it shows a neutral notice, for example
  `El HCD publicó más de un archivo con este número.`, and links to the other
  record
- AND neither page describes either record as current, superseded, replaced or
  corrected

### Requirement: Official PDF Is Always Reachable

Every detail page MUST link directly to the document's official source URL
at `hcdrosales.gob.ar`, regardless of extraction status.

#### Scenario: Link present regardless of status

- GIVEN any ordinance record in the manifest
- WHEN its detail page renders
- THEN the official PDF link is present and points to the source URL
  recorded at sync time

### Requirement: Accessible, Mobile-Usable Detail View

Detail pages MUST meet WCAG 2.1 AA and MUST be usable on a mobile screen.

#### Scenario: Screen reader reads structure

- GIVEN a visitor using a screen reader
- WHEN they open a detail page
- THEN semantic headings and landmarks convey metadata, text and the PDF
  link as distinct, labeled sections
