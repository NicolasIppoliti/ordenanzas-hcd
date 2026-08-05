"""Document metadata derivation: title (D4), doc_type (D8), year (D10),
number variants and expediente-less entries. Task 2a.16, 2a.18, 2a.20,
2a.21, 2a.22.
"""

from __future__ import annotations

from hcd_sync.doc_meta import (
    build_doc_meta,
    classify_doc_type,
    derive_title,
    derive_year,
)
from hcd_sync.listing import ListingEntry


def _entry(doc_id: str, number, url: str, filename: str, anchor_text: str) -> ListingEntry:
    return ListingEntry(
        doc_id=doc_id, number=number, url=url, filename=filename, anchor_text=anchor_text
    )


def test_title_from_listing_anchor_with_accents() -> None:
    """Task 2a.16: anchor text with accents wins, title_source listing."""
    title, source = derive_title(
        "4457 \u2013 Mesa de Gesti\u00f3n del Agua", "4457-Mesa-de-Gestion-del-Agua"
    )
    assert title == "Mesa de Gesti\u00f3n del Agua"
    assert source == "listing"


def test_title_falls_back_to_filename_slug_no_accent_restoration() -> None:
    """Task 2a.16: anchor unusable -> filename slug, no accents invented."""
    title, source = derive_title("", "Recorrido-omnibus-larga-distancia")
    assert title == "Recorrido omnibus larga distancia"
    assert source == "filename"
    assert "\u00f3" not in title  # no accent restoration


def test_number_only_entry_has_no_title() -> None:
    """Task 2a.16: number-only entry -> title is None, title_source none."""
    title, source = derive_title("4128", "4128")
    assert title is None
    assert source == "none"


def test_body_text_is_never_used_as_a_title() -> None:
    """No fabrication path exists in derive_title; it never sees body text."""
    title, _source = derive_title("4128", "4128")
    assert title is None


def test_doc_type_classification_table() -> None:
    """Task 2a.18: an own ordinance number decides first, then explicit markers."""
    # No own number: the explicit marker classifies the document.
    assert classify_doc_type("Convenio Ministerio de las Mujeres", "Convenio-Ministerio-de-las-Mujeres.pdf", None) == "convenio"
    assert classify_doc_type("Resolucion 053 2021 Informes escuela 18", "Resolucion-053-2021-Informes-escuela-18.pdf", None) == "resolucion"
    assert classify_doc_type("ANEXO I ESPECIES EMBLEMATICAS", "ANEXO-I-ESPECIES-EMBLEMATICAS-.pdf", None) == "anexo"
    assert classify_doc_type("Calle Irigoyen", "Calle-Irigoyen.pdf", None) == "sin clasificar"

    # The real `Dec.-377-…` record carries no ordinance number of its own — the 3288 in
    # its title is the ordinance it promulgates, a reference, not its identity.
    assert classify_doc_type(
        "Dec. 377 Promulga Ordenanza 3288 D 417 11",
        "Dec.-377-Promulga-Ordenanza-3288-D-417-11.doc.pdf",
        None,
    ) == "decreto"

    assert classify_doc_type("4457 Mesa de Gestion del Agua", "4457-Mesa-de-Gestion-del-Agua.pdf", 4457) == "ordenanza"


def test_own_number_outranks_a_marker_describing_the_subject() -> None:
    """A marker in the SUBJECT of a numbered ordinance describes what it is about.

    Regression for 67 real records misclassified when markers outranked the number.
    `Ordenanza 4344` approves a convenio; it is still an ordenanza. Classifying it as
    `convenio` would be deriving the type from subject matter, which D8 forbids.
    """
    assert classify_doc_type(
        "4344 – Convenio Fundación Saber",
        "4344-I752024-Convenio-Fundacion-Saber.pdf",
        4344,
    ) == "ordenanza"
    assert classify_doc_type(
        "4267 – Adhiere decreto 786",
        "4267-O462023-Adhiere-decreto-786.pdf",
        4267,
    ) == "ordenanza"
    assert classify_doc_type(
        "4131 – D 69 Anexo Convenio",
        "4131-D-69-Anexo-Convenio.pdf",
        4131,
    ) == "ordenanza"


def test_duplicate_number_variants_are_reciprocal() -> None:
    """Task 2a.20: 3296 + 3296-1 -> two records, reciprocal number_variants, no preferred one."""
    from hcd_sync.doc_meta import with_number_variants

    entry_a = _entry(
        "3296", 3296,
        "https://hcdrosales.gob.ar/wp-content/uploads/2021/01/3296.pdf",
        "3296.pdf", "3296",
    )
    entry_b = _entry(
        "3296-1", 3296,
        "https://hcdrosales.gob.ar/wp-content/uploads/2021/02/3296-1.pdf",
        "3296-1.pdf", "3296",
    )
    metas = with_number_variants([build_doc_meta(entry_a), build_doc_meta(entry_b)])
    by_id = {m.doc_id: m for m in metas}
    assert set(by_id["3296"].number_variants) == {"3296", "3296-1"}
    assert set(by_id["3296-1"].number_variants) == {"3296", "3296-1"}


def test_numberless_convenio_is_present_with_null_number() -> None:
    """Task 2a.21: Convenio.pdf (no leading number) -> present with number None."""
    entry = _entry(
        "Convenio", None,
        "https://hcdrosales.gob.ar/wp-content/uploads/2021/05/Convenio.pdf",
        "Convenio.pdf", "Convenio",
    )
    meta = build_doc_meta(entry)
    assert meta.number is None
    assert meta.doc_type == "convenio"


def test_upload_path_year_is_never_used_as_ordinance_year() -> None:
    """Task 2a.22: /uploads/YYYY/ must never be read as the ordinance year."""
    # No expediente year token, no header text -> year stays absent, never 2021.
    assert derive_year(expediente=None, header_text=None) is None


def test_year_from_expediente_token() -> None:
    assert derive_year(expediente="O-02-2026", header_text=None) == 2026


def test_year_from_stubbed_document_header() -> None:
    """The header-transcription branch is exercised with a stubbed text body in PR2a."""
    header = "Punta Alta, 27 de enero de 2.026\nArticulo 1"
    assert derive_year(expediente=None, header_text=header) == 2026


def test_expediente_families_per_d13() -> None:
    """Task 2a.22b: three known families, longest-match, everything else absent.

    The GDE case is the regression: the best-effort pattern shipped in PR2a truncated
    `EX-2025-00106406-MUNICRO-DCSE` to `EX-2025`. A truncated expediente is worse than an
    absent one — it looks authoritative while citing a file number that does not exist.
    """
    from hcd_sync.doc_meta import extract_expediente

    # GDE family, captured whole.
    assert extract_expediente(
        "4448-EX-2025-00106406-MUNICRO-DCSE-Presupuesto-2026", ""
    ) == "EX-2025-00106406-MUNICRO-DCSE"

    # Compact and dashed families.
    assert extract_expediente("4440-O822024-Modifica-Ordenanza-3766", "") == "O822024"
    assert extract_expediente("4445-Pres012025-Rectifica-Donaciones", "") == "Pres012025"
    assert extract_expediente(
        "3653-COR03-17-Recorrido-omnibus-larga-distancia", ""
    ) == "COR03-17"

    # A title that simply follows the number carries no expediente.
    assert extract_expediente("4457-Mesa-de-Gestion-del-Agua", "") is None
    assert extract_expediente("4449-Modifica-Ordenanza-4448", "") is None

    # Year-less letter+digit tokens are NOT captured: the source does not distinguish a
    # year-less file number from an abbreviation that begins the title.
    assert extract_expediente("4372-O89-Lugar-Historico-Casa-en-Villa-Arias", "") is None
    assert extract_expediente("3866-IVR62-Calle-Scout-Julio-Perez", "") is None
    assert extract_expediente("4262-O1", "") is None


def test_expediente_whole_corpus_properties() -> None:
    """Task 2a.22b: replay D13 over every real stem before the rule is trusted.

    Three earlier rules in this project passed review and then failed against real data.
    This asserts the anti-truncation property directly rather than sampling.
    """
    import re
    from pathlib import Path

    from hcd_sync.doc_meta import extract_expediente
    from hcd_sync.listing import parse_listing

    fixture = Path(__file__).parent / "fixtures" / "listing-2026-08-04.html"
    result = parse_listing(fixture.read_text(encoding="utf-8"))
    numbered = [e for e in result.entries if e.number is not None]
    assert len(numbered) == 987

    captured = {e.doc_id: extract_expediente(e.doc_id, e.anchor_text) for e in numbered}
    found = {k: v for k, v in captured.items() if v is not None}
    assert len(found) == 394, "measured D13 coverage over the real corpus"

    # Anti-truncation, stated as the real property: the captured value must be the
    # LONGEST family match at that position, never a shorter family's prefix of it.
    # (A naive "no digit may follow" check false-positives on titles that start with a
    # number, e.g. `4201-O12023-40-anos-de-democracia`, where the 40 begins the title.)
    from hcd_sync.doc_meta import _EXPEDIENTE_FAMILIES

    for stem, exp in found.items():
        rest = stem.split("-", 1)[1]
        longest = max(
            (m.group(0) for m in (re.match(fam, rest) for fam in _EXPEDIENTE_FAMILIES) if m),
            key=len,
            default="",
        )
        assert exp == longest, f"{exp!r} is shorter than {longest!r} in {stem!r}"


def test_year_comes_from_the_trailing_year_of_the_expediente() -> None:
    """The year is the TAIL of a compact expediente, not the first 4-digit run in it.

    Found by reading the built Pagefind year filter, which offered 1919, 1920, 2072,
    2082 and 2092 — impossible years for this corpus. `T192024` is file T-19 of 2024,
    but a leftmost `(19|20)\\d{2}` search reads `1920` out of the middle of it. Thirteen
    records were filed under a year they do not belong to, so a resident filtering by
    2024 would not find them.
    """
    assert derive_year(expediente="T192024", header_text=None) == 2024
    assert derive_year(expediente="O192019", header_text=None) == 2019
    assert derive_year(expediente="D1192022", header_text=None) == 2022
    assert derive_year(expediente="S2072022", header_text=None) == 2022
    assert derive_year(expediente="S2092021", header_text=None) == 2021
    # Already correct before the fix — must stay correct.
    assert derive_year(expediente="O822024", header_text=None) == 2024
    assert derive_year(expediente="Pres012025", header_text=None) == 2025
    assert derive_year(expediente="O-02-2026", header_text=None) == 2026
    assert derive_year(expediente="EX-2025-00106406-MUNICRO-DCSE", header_text=None) == 2025


def test_two_digit_expediente_year_is_expanded_not_misread() -> None:
    """`COR03-17` is file 03 of 2017, and `D31919` is file 319 of 2019.

    A two-digit tail must expand to the 2000s rather than being swallowed by a
    leftmost four-digit match that invents 1919.
    """
    assert derive_year(expediente="COR03-17", header_text=None) == 2017
    assert derive_year(expediente="D31919", header_text=None) == 2019


def test_sanction_year_from_the_header_outranks_the_expediente_year() -> None:
    """The document's own printed date wins over the year its file was opened.

    Measured over the real corpus: of 394 records carrying both, 67 disagree, always
    because the expediente was opened in an earlier year than the ordinance was
    sanctioned. Ordinance 4393 carries expediente O812022 and reads
    `Punta Alta, ... de 2.025`. Filing it under 2022 means a resident filtering by 2025
    does not find an ordinance the HCD sanctioned in 2025.
    """
    header_2025 = "Punta Alta, 3 de marzo de 2.025\nEL HONORABLE CONCEJO DELIBERANTE"
    assert derive_year(expediente="O812022", header_text=header_2025) == 2025

    # The expediente still answers when the document prints no date.
    assert derive_year(expediente="O812022", header_text=None) == 2022
    assert derive_year(expediente="O812022", header_text="sin fecha impresa") == 2022

    # Neither source: absent, never invented.
    assert derive_year(expediente=None, header_text=None) is None
