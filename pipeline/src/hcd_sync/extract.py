"""PyMuPDF text extraction. See design.md 'Data Flow' and
specs/text-extraction/spec.md.

OCR is out of scope. A PDF with no embedded text layer yields
`status: "no_text"` -- never `"error"` (design.md D13: "`status: 'no_text'`
is a known, expected outcome for the ~16% scanned subset ... it is never
recorded as `error`").
"""

from __future__ import annotations

from dataclasses import dataclass

import fitz

from hcd_sync.json_types import JsonDict

EXTRACTOR_ID = f"pymupdf/{fitz.VersionBind}"


@dataclass(frozen=True)
class ExtractionResult:
    text: str
    pages: int
    is_empty: bool


def extract_text(pdf_bytes: bytes) -> ExtractionResult:
    """Extract the full body text of a PDF, page by page, joined with newlines.

    `is_empty` is true when the extracted text, stripped of whitespace, is
    empty -- the "no text layer" case this module must detect and never
    attempt to OCR.
    """
    with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
        pages = doc.page_count
        parts = [page.get_text() for page in doc]

    text = "\n".join(parts)
    return ExtractionResult(text=text, pages=pages, is_empty=not text.strip())


def build_extraction_fields(
    *,
    doc_id: str,
    number: int | None,
    sha256: str | None,
    pdf_bytes: bytes,
    now: str,
    extractor: str = EXTRACTOR_ID,
) -> tuple[JsonDict, JsonDict | None]:
    """Extract `pdf_bytes` and build the manifest status-field update plus,
    for a text-bearing PDF, the full `data/documents/{doc_id}.json` payload.

    Returns `(status_fields, document_json)`:
    - `status_fields` is always `{"status": ..., "text_path": ...}`, merged
      into the manifest record by the caller.
    - `document_json` is `None` for `no_text` (nothing is written), or the
      full document payload per design.md's `data/documents/{doc_id}.json`
      contract for `ok`.

    `text_path`, when present, is the fixed repo-relative path
    `data/documents/{doc_id}.json` -- independent of wherever the caller's
    `data_dir` physically is (tests may use a tmp dir; the stored value is
    the logical path the site reads at build time).
    """
    result = extract_text(pdf_bytes)

    if result.is_empty:
        return {"status": "no_text", "text_path": None}, None

    text_path = f"data/documents/{doc_id}.json"
    document_json: JsonDict = {
        "schema_version": 1,
        "doc_id": doc_id,
        "number": number,
        "sha256": sha256,
        "extracted_at": now,
        "extractor": extractor,
        "pages": result.pages,
        "text": result.text,
    }
    return {"status": "ok", "text_path": text_path}, document_json
