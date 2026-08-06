# Design System — Archivo de Ordenanzas del HCD

Source of truth for every visual decision in `site/`. Read it before changing anything
that renders. The site now implements it: the five adoption items are all shipped, so a
mismatch between this document and what renders is a defect in one of the two, not
expected drift. See "Implementation gap" at the end for what landed when.

## Product Context

- **What this is:** a free, unofficial, searchable archive of the 1,038 documents the
  Honorable Concejo Deliberante of Coronel Rosales publishes as PDFs.
- **Who it's for:** residents looking up one regulation — a rate, a permit, a rule about
  their street — and councillors or staff looking for precedent. Mobile-majority.
- **Space:** civic tech / legal document archives. Peers: legislation.gov.uk,
  argentina.gob.ar/normativa, boletinoficial.gob.ar.
- **Project type:** public document archive. Reading-first, with search and browse.

## The memorable thing, in order

Four goals were named. They conflict, so they are ranked — when two collide, the higher
one wins:

1. **"Por fin puedo encontrar algo."** The BRIEF exists because these documents are
   public but unusable. If the first screen does not solve that, the rest is decoration.
2. **"Esto es serio y confiable"** is the register, not the goal. It decides how things
   look, and never competes for space above the fold.
3. **"Esto es del pueblo"** lives in the words and the warmth of the surface, not in
   structure.
4. **"Alguien se tomó el trabajo"** is the floor, not a direction. It is execution.

## Aesthetic Direction

- **Direction:** Editorial-Utilitarian. Editorial typography for reading long legal
  text; utilitarian density for finding one document among a thousand.
- **Decoration level:** minimal. No illustration, no imagery, no ornament. The type and
  the paper do the work.
- **Mood:** a well-made public document. Authoritative without being solemn, warm
  without being informal.
- **Reference sites:** legislation.gov.uk (persistent structured search, rendered legal
  structure), argentina.gob.ar/normativa (serif legal titles, labelled metadata strip,
  relationship links).

## Typography

The single largest problem with the previous system: it used `system-ui` as the primary
face, which reads as "typography was not considered."

- **Display / document titles:** **Fraunces** (variable serif). Serif is the Argentine
  convention for legal text; Fraunces carries it without stiffness and gives the archive
  a face of its own.
- **Body / UI / metadata:** **Instrument Sans**. Legible at small sizes, holds up on a
  phone, not on anyone's overused list.
- **Data / numbers:** Instrument Sans with `font-variant-numeric: tabular-nums`, so
  ordinance numbers, years and expedientes align in columns. The shipped subset keeps the
  `tnum` feature — without it the declaration is a silent no-op, which is what happened
  until it was measured. **Exception:** the home's display figures (the numbers band and the
  fact cards) are set in the serif and carry no tabular declaration. There is one figure per
  cell and nothing to align with, and Fraunces has no `tnum` at all, even upstream.
- **Code:** `ui-monospace` system stack. Used only in developer surfaces.
- **Loading:** self-hosted, subset to Latin. Measured after subsetting: Fraunces 18,504
  bytes, Instrument Sans 28,504 — **47,008 total**, cached once across all 1,043 pages.
  This does NOT breach zero-variable-cost: Cloudflare Pages bandwidth is unmetered, and
  the constraint was always about the bill, not about bytes.
- **Fraunces ships at one weight (600), not as a variable range.** Keeping 400–700 costs
  33,916 bytes against 18,504, and every display line in this archive is set at a single
  weight. 15 KB on every first visit for a weight nothing uses is not a trade a public
  archive should make. Instrument Sans keeps its 400–700 range, which body, metadata and
  emphasis genuinely use. Consequence: any future heading that wants a different weight
  needs the range restored, not a `font-weight` change — asking for one the file does not
  carry makes the browser synthesise a fake bold.

**Scale** (17px base — calibrated for reading a 207-page ordinance on a phone, not for a
dashboard):

| Token | Size | Use |
|---|---|---|
| `--text-3xl` | 40px | home hero, and nothing else. Steps down to `--text-2xl` below 34rem, where 40px runs the headline to five lines and pushes the search field under the fold |
| `--text-2xl` | 30px | page title |
| `--text-xl` | 24px | section title |
| `--text-lg` | 20px | lead, result title |
| `--text-base` | 17px | body and document text |
| `--text-sm` | 15px | secondary, metadata |
| `--text-xs` | 13px | labels |

Line height: **1.25** headings · 1.5 UI · 1.65 document prose. The heading value is not the
1.15 a display face usually takes: headings here are document titles that run to a full
sentence, and at 1.15 the descenders of one line meet the ascenders of the next. Pinned by
`tokens.test.ts` against this table, because a leading written down beside a token is a
leading nobody measured. Measure capped at 68ch.

## Color

- **Approach:** restrained. One accent, two neutral families, one amber reserved for a
  single message.
- **Paper:** `#faf8f4` light / `#14161a` dark. **Not white.** Every civic site is white
  and blue; warm paper is what makes this read as a document archive rather than a
  dashboard, and it serves "esto es del pueblo" without touching a political colour.
- **Surface:** `#f2eee7` / `#1c1f25`
- **Ink (text):** `#161b21` / `#f2eee7`
- **Muted:** `#5f5a52` / `#a49c8f`
- **Rules:** `#ded7cb` / `#2e333b`
- **Accent (links, focus):** `#0a4f8f` / `#8fbae3`
- **Notice (stale archive only):** bg `#f7edd6`, rule `#a06a00`, ink `#5c3d00`
- **Dark mode:** follows `prefers-color-scheme`. No toggle — a toggle needs JavaScript,
  and this site ships none beyond a 268-byte staleness script.

**Political neutrality constrains the palette as hard as legibility does.** In Argentina
that rules out celeste, red, violet and yellow as an accent. Deep ink blue reads
"official document" without reading as any bloc.

**Every pair is measured, never estimated.** `site/tests/palette.test.ts` computes every
ratio from `tokens.css` itself and fails the build below 4.5:1 for text and 3:1 for
control boundaries — a ratio written down beside the colour is a ratio nobody measured.
Measured floors: **5.91:1 light, 6.08:1 dark**.

That test found one real defect on adoption: `--border-strong`, which draws the boundary
of the search input and the two selects, measured 2.07:1 light and 2.65:1 dark against
WCAG 1.4.11's 3:1. It is now 3.59:1 and 4.76:1.

## Spacing

- **Base unit:** 4px. **Density:** comfortable.
- **Scale:** 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64. Steps are missing on purpose; the gap
  pushes you to the nearest rung instead of inventing an in-between.

## Layout

- **Approach:** grid-disciplined for lists and search, editorial measure for documents.
- **Max content width:** 60rem. Document text: 68ch.
- **Border radius:** 4px small, 8px medium. Nothing larger.
- **No elevation scale.** No shadow tokens, no modals, and nothing floating except the one
  thing that must: the phone menu's panel, which drops below the header over the page. It
  separates itself with a surface fill and a rule rather than a shadow — shipping shadow tokens
  no other component consumes is how a system starts to rot.

## Composition and voice

The first five gap items changed type, colour and features. They never touched composition,
and the result read as unfinished with every token correct — new skin on the same austere
structure. This section exists so that gap cannot reopen.

**The home is a landing and an index at once.** It has to make a reader want to stay and give
them somewhere to go on the same screen, and it answers three questions in order: what can I do
here, how big is this, and what is in it. Search is the hero there — it is the one page where
search IS the point, so the header band hides itself rather than shipping a second field with
the same id. Then the numbers band, the year strip, three measured facts, and the newest
documents. A second link to a destination the nav already reaches is a defect, not a
convenience.

**Everything that invites is a measured fact.** The shortcut chips carry the count of documents
that MENTION a word — "documentos que mencionan obras", never "ordenanzas de obras", because a
count is a fact and a category is a classification nobody made. The fact cards are counts and
extremes, never a chosen document: the moment the archive features "the ordinance you should
read", it stops being a transcript and becomes an opinion. Where a fact ties, both sides are
named — 2002 and 2012 each hold one document, and calling either "the quietest year" would be a
claim the data does not make.

**The shortcut list is chosen, and it carries its rule.** A term earns a place if it names a
matter a municipality legislates on, at least 40 documents mention it, and it is worded as a
search. Ranking the corpus by frequency instead — the apparently neutral option — returns the
letterhead every document repeats: rosales, concejo, deliberante, comuníquese, regístrese,
archívese, and the contact gmail. That list is neutral and useless. The rule and the reason for
each term live beside the list in `lib/highlights.ts`, so the selection can be audited rather
than defended.

**The year strip states proportion, and states it honestly.** Each year is a bar whose width
is relative to the LARGEST ROW — which is the undated group at 223, not the fullest year — so
every bar on screen is comparable to every other one. Scaling to the fullest year instead would
push the undated bar past 100% or clip it, and that group is a fact about the archive, not an
exception to it. A year holding one document gets a floored 3px of bar: at true proportion it
would be under a pixel and read as zero, and zero is a different claim from one. That floor
overstates the smallest years, and it is the one place on the site where a mark is not to
scale — stated here rather than left in a component comment.

**The header collapses on a phone, without JavaScript.** The two links become a `<details>`
menu below 34rem and a row above it, with CSS showing exactly one — `display: none` takes the
other out of the accessibility tree, so nothing is announced twice. A `<details>` rather than a
button and a script: it is the platform's disclosure widget, it opens on tap and on Enter, and
it keeps the header at zero bytes of JavaScript on all 1,043 pages. The bars rotate into a
cross when it opens, because the state has to be readable without the label.

Measured while building it, and both are why the markup is shaped this way: CSS cannot force a
closed `<details>` open on a wide screen — its content stays 0×0, so the wide layout is its own
list rather than the same one restyled. And the panel is positioned out of flow, because a
`<details>` left in flow grows when it opens and pushes the site name onto a row of its own.

**Lists are columns, not bullets.** Every document row hangs its number in a tabular column
and sets the title in the serif, the same treatment the article renderer gives article
numbers. It is what lets a reader scan 4449 against 4454 without reading either line. No body
excerpt: every extracted document opens with the same municipal letterhead, so an excerpt is
thirty identical words.

**Every class a page uses must be defined in the component that uses it.** Astro scopes styles
per component; a rule and its element in different files ship a selector that matches nothing.
This project has shipped that defect twice — once silently removing `pre-wrap` from 19
documents, once leaving the home page's document list with the browser's default bullets.

**Voice: speak to a resident, never about the source.** Voseo, imperative, the reader's problem
first. Every number on screen comes from the manifest. What is forbidden is not informality —
it is a villain. "Dejá de pelearte con PDFs sueltos" reads better precisely because it has an
enemy, and the only enemy available is the body that publishes those PDFs: the HCD is the
client Fragua wants, and this archive is unofficial and survives because they tolerate it. No
speed promises, no superlatives, no ranking, nothing that interprets a document's content.

## Motion

- **Approach:** minimal-functional. There is no JavaScript to animate anything.
- **Easing:** `cubic-bezier(0.16, 1, 0.3, 1)` for the few colour transitions.
- **Duration:** 100ms micro only. `prefers-reduced-motion` respected globally.

## The three risks

Coherence is table stakes. These are the deliberate departures that give the archive a
face, each with what it costs.

**1. Warm paper instead of white.** Every civic site is white-and-blue. Costs a little
"clean and modern"; buys an identity as an archive.

**2. Render the legal structure.** Detect `Artículo N` and set it with a hanging number
in a left column and indented text, instead of dumping `white-space: pre-wrap`. Measured:
875 of 894 text-bearing documents (97%) carry the anchor. The 3% without it keep the
current rendering — never a fabricated structure. This is what makes a 207-page tariff
schedule navigable, and no local peer does it for extracted text.

**3. Browse the whole corpus, not just search it.** Every archive in this category builds
faceted search because their corpora are millions of records. **This one is 1,038.** The
entire corpus fits on one page, browsable by year. A resident often does not know the
number — they know roughly when. Search demands you know what to type; browsing does not.

## Things this system deliberately does NOT do

- **Cross-reference links carry no direction and no verb.** argentina.gob.ar labels
  "modifica" / "es modificada" because its source is an official database. Ours comes
  from a regex over a title, so stating a legal relationship would assert something the
  source does not. This is a provenance decision, not a missing feature.
- **No Fragua branding** beyond a discreet footer credit. No header brand, no logo.
- **No editorial layer over the CONTENT**: no summaries, no rankings, no highlighting, and
  never a featured document. The boundary is between content and navigation: offering a search
  for a word, with the measured count of documents that mention it, is a route into the archive
  and states a fact about it. Saying which ordinance matters, or ordering documents by anything
  other than what the source stated, is an opinion. The shortcut list under Composition and
  voice sits on the navigation side of that line, and carries the rule that admitted each term.

## Implementation gap

Adopting this document was done in five independently shippable steps, in the order that
carried the most value to a reader first:

1. ✅ Article renderer with its fallback — PR #24.
2. ✅ Browse-by-year page — PR #25.
3. ✅ Self-hosted Fraunces + Instrument Sans — PR #26.
4. ✅ Warm paper palette, every contrast pair re-measured.
5. ✅ Persistent header search band.

All five have landed. The band is a plain GET form rather than a live widget: it adds
zero bytes of script to the 1,038 document pages, where a suggestion box would have
shipped the ~30 KB Pagefind runtime to save one navigation.

It does not make search work without JavaScript, and the site does not pretend otherwise
— Pagefind resolves its index in the browser and there is no server behind it. `/buscar`
carries a `<noscript>` saying so and pointing at the browse page, which needs nothing.

## Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-08-05 | Initial design system | Created by /design-consultation after visual research of legislation.gov.uk and argentina.gob.ar, against a live site the owner judged unfinished, poorly ordered, cheap-looking, and unclear on the home page |
| 2026-08-05 | Webfonts allowed | The no-webfont rule was inferred from "mobile payload", not stated in BRIEF.md. Two subset variable families cost ~45 KB cached once, on unmetered bandwidth. It was over-strict, and it was the main reason the site read as unfinished |
| 2026-08-05 | Warm paper over white | Distinguishes a document archive from a dashboard, and serves civic warmth without any politically-coded colour |
| 2026-08-05 | Landing and index in one screen | The owner asked for a page that invites you to stay, explicitly over the formality of legislation.gov.uk and the Boletín Oficial. Formality was mine to trade; neutrality and no-fabrication were not, so every invitation on the page is a measured fact |
| 2026-08-05 | Shortcut terms chosen, not calculated | Measured: ranking by frequency returns only letterhead — rosales, concejo, comuníquese, archívese, gmail. Neutral and useless. The chosen list ships with a written admission rule instead |
| 2026-08-05 | Composition and voice written down | Five gap items shipped tokens and features and left the structure of 2010 underneath; the owner read the result as not intuitive and not modern, and he was right |
| 2026-08-05 | Warm and direct, never a villain | The full marketing register got its energy from an enemy, and the only enemy available was the HCD — the client, and the body whose tolerance this unofficial archive depends on |
| 2026-08-05 | Contrast asserted by computation, not by table | The written floors (5.84 / 8.55) were both wrong once the palette changed, and the form-control boundary had never cleared 3:1 at all |
| 2026-08-05 | Fraunces pinned to weight 600 | The variable range cost 15 KB more than the whole Instrument Sans file, for weights no heading uses. Measured, not estimated |
| 2026-08-05 | Ranked the four goals instead of blending them | "A bit of all four" was the owner's instinct; blended, they conflict above the fold. Ranked, all four survive and collisions have an answer |
