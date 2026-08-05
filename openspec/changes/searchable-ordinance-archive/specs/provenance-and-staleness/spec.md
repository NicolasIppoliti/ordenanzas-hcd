# Provenance and Staleness Specification

## Purpose

Make the archive's freshness and authority status impossible to miss:
always show when it was last successfully synced, warn explicitly when it
is stale, state clearly that it is unofficial, and attribute the tool
discreetly without branding the archive.

## Requirements

### Requirement: Always-Visible Last-Synchronised Date

The site MUST display the date of the last successful sync on every page
that lists or shows ordinances.

#### Scenario: Normal freshness

- GIVEN the last successful sync completed within the staleness threshold
- WHEN a visitor loads any page
- THEN the last-synchronised date is visible

### Requirement: Configurable Staleness Threshold and Notice

The system MUST support a configurable staleness threshold (default 30
days). When no successful sync has occurred within the threshold, the site
MUST show an explicit Spanish "archive out of date" notice in addition to
the last-synchronised date.

#### Scenario: Threshold exceeded

- GIVEN the last successful sync was more than 30 days ago (or the
  configured threshold)
- WHEN a visitor loads any page
- THEN an explicit Spanish out-of-date notice is shown alongside the
  last-synchronised date

#### Scenario: Threshold not exceeded

- GIVEN the last successful sync was within the threshold
- WHEN a visitor loads any page
- THEN no out-of-date notice is shown

### Requirement: Last-Attempt Status Never Visitor-Facing

The status of the most recent sync *attempt* (as opposed to the most
recent *successful* sync) MUST NOT be surfaced anywhere on the visitor-facing
site.

#### Scenario: Halted attempt does not appear to visitors

- GIVEN the most recent sync attempt was `halted`, but a prior sync
  succeeded within the threshold
- WHEN a visitor loads any page
- THEN the page shows the last *successful* sync date normally
- AND nothing on the page references the halted attempt

### Requirement: Unofficial-Tool Disclaimer

Every page MUST state, in Spanish, that this is an unofficial consultation
tool and that the official HCD PDF prevails in case of discrepancy.

#### Scenario: Disclaimer present

- GIVEN any page on the site
- WHEN it renders
- THEN a visible statement declares the tool unofficial and the official
  PDF authoritative

### Requirement: Discreet Footer Attribution Only

Attribution to Fragua MUST appear only as a discreet footer credit
("herramienta no oficial publicada por Fragua" plus a link). The site MUST
NOT show a header brand or logo over the archive.

#### Scenario: Footer credit present, no header brand

- GIVEN any page on the site
- WHEN it renders
- THEN the footer contains the Fragua credit and link
- AND no header, banner or logo element brands the archive

### Requirement: The `acerca` Page States What the Archive Contains

The `acerca` page MUST state plainly, in neutral Spanish, that the archive
mirrors the HCD's `Ordenanzas` listing exactly as published, and that this
listing includes documents that are not ordinances — which is why the site
counts and routes "documentos" rather than "ordenanzas".

The statement MUST be factual and MUST NOT editorialise: it MUST NOT
characterise the HCD's classification as an error, MUST NOT suggest what the
listing ought to contain, and MUST NOT single out any document, councillor or
political bloc.

#### Scenario: Composition of the archive is disclosed

- GIVEN a visitor opens the `acerca` page
- WHEN it renders
- THEN it states that the archive mirrors the HCD `Ordenanzas` listing as
  published
- AND it states that the listing includes documents that are not ordinances,
  such as convenios, decretos, resoluciones and anexos
- AND it explains that this is why the site says "documentos"
- AND no wording characterises the source's classification as mistaken or
  suggests a correction to it

### Requirement: Operator Escalation on Halt or Exhausted Retries

When a sync run halts (`robots.txt` returned 200) or exhausts its retry
bound, the system MUST notify the repository owner via GitHub's
workflow-failure email AND send an email to `hcd@fragua.dev`. This
escalation MUST NOT be visible to site visitors and the deployed site MUST
send no outbound message of any kind.

#### Scenario: Halt triggers dual operator notification

- GIVEN a sync run halts due to `robots.txt` returning 200
- WHEN the run ends
- THEN the repository owner receives a GitHub Actions failure notification
- AND an email is sent to `hcd@fragua.dev`
- AND no visitor-facing page reflects this event beyond the normal
  last-successful-sync-date / staleness-notice behavior
