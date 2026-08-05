# Text Extraction Specification

## Purpose

Extract body text from text-layer PDFs for indexing and detail-view
rendering; explicitly and permanently mark the non-extractable subset
(scanned documents) as having no indexed text. OCR is out of scope.

## Requirements

### Requirement: Text Extraction For Text-Bearing PDFs

The system MUST extract the full body text from every PDF that carries a
text layer (the ~84% of the corpus verified extractable), for use in
full-text search and the detail view.

#### Scenario: Text-bearing PDF extracted

- GIVEN a PDF with an embedded text layer
- WHEN text extraction runs
- THEN the extracted text is stored and associated with that ordinance's
  record
- AND the record's status is `ok`

### Requirement: Explicit No-Text Marking

The system MUST NOT attempt OCR. For any PDF without an extractable text
layer, the system MUST mark that document's status as `no_text` and MUST
still index it by its filename-derived metadata.

#### Scenario: Scanned PDF from the 2021 bulk historical upload

- GIVEN a PDF with no embedded text layer
- WHEN text extraction runs
- THEN no body text is stored
- AND the record's status is `no_text`
- AND the record remains discoverable by number, year, `expediente` and
  title (if available)

### Requirement: No-Text Status Visible Wherever the Document Appears

Every surface that lists or displays a `no_text` document (search results,
detail view, cross-reference links) MUST explicitly mark it as having no
indexed text, distinct from a document that simply had no search matches.

#### Scenario: no_text document detail page

- GIVEN a document with status `no_text`
- WHEN its detail page renders
- THEN the page shows metadata and the official PDF link
- AND an explicit Spanish notice states there is no indexed text for this
  document
