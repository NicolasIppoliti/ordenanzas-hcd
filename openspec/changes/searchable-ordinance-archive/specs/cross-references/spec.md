# Cross-References Specification

## Purpose

Surface the relationships between ordinances that the official site does
not expose — one ordinance referencing another by number, in its title or
body text — as neutral, bidirectional links, without ever asserting a
legal relationship (e.g. "modifies") the source text does not itself state
as fact-checkable regex output.

## Requirements

### Requirement: Reference Detection

The system MUST detect references to other ordinance numbers within a
document's title and body text (e.g. "Modifica Ordenanza 3351",
"Incorpora artículo 169 bis a la Ordenanza 1999").

#### Scenario: Title reference detected

- GIVEN a document titled "Modifica Ordenanza 3351"
- WHEN cross-reference detection runs
- THEN a reference to ordinance 3351 is recorded for that document

#### Scenario: Body-text reference detected

- GIVEN a document whose body text mentions "la Ordenanza 1999"
- WHEN cross-reference detection runs
- THEN a reference to ordinance 1999 is recorded for that document

### Requirement: Resolution Against the Known Manifest Only

A detected reference MUST render as a clickable link only if the referenced
number resolves to at least one existing record in the manifest. Unresolvable
numbers MUST NOT render as links, MUST NOT be fuzzy-matched, and MUST NOT be
narrowed by any numeric plausibility window.

#### Scenario: Reference resolves

- GIVEN a detected reference to ordinance 3351, and 3351 exists in the
  manifest
- WHEN the referencing document's page renders
- THEN the reference appears as a link to ordinance 3351's detail page

#### Scenario: Reference does not resolve

- GIVEN a detected reference to a number not present in the manifest
- WHEN the referencing document's page renders
- THEN the reference does not render as a link (it may appear as plain
  text or be omitted)

### Requirement: A Resolved Number May Match More Than One Record

Ordinance numbers are not unique: the source publishes more than one document
under the same number. Resolution MUST therefore map a referenced number to the
SET of records carrying it, and the system MUST render a link to every one of
them. The system MUST NOT pick a single "best" or "most likely" target, and
MUST NOT drop the others.

Each rendered link MUST carry enough information to tell the targets apart —
its document type and its title (or the explicit absent marker) — so the
visitor, not the system, decides which one they meant.

#### Scenario: Referenced number is held by two records

- GIVEN a detected reference to ordinance 3296, and two records in the
  manifest carry number 3296
- WHEN the referencing document's page renders
- THEN both records appear as separate links under the same neutral heading
- AND each link is labelled with its document type and title so the two are
  distinguishable
- AND neither is presented as the primary, current or correct target

#### Scenario: Ambiguity is never resolved by heuristic

- GIVEN a referenced number held by two records, one of which has extracted
  text and one of which does not
- WHEN the page renders
- THEN both are still linked
- AND recency, extraction status, upload order and file size are not used to
  select one of them

### Requirement: Undirected, Neutral Linking

Cross-references MUST render as neutral bidirectional links with no
relationship-type label. The system MUST NOT state or imply that one
ordinance "modifies" or "was modified by" another.

#### Scenario: Bidirectional visibility

- GIVEN document A's title references ordinance number B
- WHEN either A's or B's detail page renders
- THEN each page shows a link to the other under a neutral heading (e.g.
  "Ordenanzas relacionadas")
- AND neither page labels the relationship's direction or type

#### Scenario: Multi-target reference stays undirected

- GIVEN a referenced number held by two records
- WHEN the referencing page and both target pages render
- THEN every one of the three pages lists the others under the same neutral
  heading
- AND the presence of two targets is not described with any verb, direction or
  disambiguating claim beyond each target's own type and title

#### Scenario: No relationship claim rendered

- GIVEN a detected title reference "Modifica Ordenanza 3351"
- WHEN the cross-reference link renders
- THEN the link text and surrounding copy do not assert "modifica" or any
  other relationship verb — only that the two ordinances are related
