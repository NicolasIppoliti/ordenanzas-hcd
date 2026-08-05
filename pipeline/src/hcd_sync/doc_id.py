"""`doc_id` path-safety validation.

See design.md D7. `doc_id` is a remote-controlled string that becomes a
filesystem path component (`archive/{doc_id}.pdf`, `data/documents/{doc_id}.json`)
and a URL path segment. This module is REJECT-ONLY: there is no sanitising,
truncating or slugifying branch whose output could round-trip back into a
path. A non-conforming candidate is always rejected, never repaired.
"""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path
from urllib.parse import unquote

#: Reserved device names on Windows-family filesystems, checked case-insensitively
#: against the whole candidate value.
_RESERVED_DEVICE_NAMES = frozenset(
    {"CON", "PRN", "AUX", "NUL"}
    | {f"COM{i}" for i in range(1, 10)}
    | {f"LPT{i}" for i in range(1, 10)}
)

_CONTROL_CHAR_RE = re.compile(r"[\x00-\x1f\x7f-\x9f]")

_MAX_LENGTH = 120


class DocIdRejected(ValueError):
    """Raised when a candidate `doc_id` fails path-safety validation.

    Rejection is the only outcome for a non-conforming candidate — this
    exception carries no repaired/sanitised value.
    """


def validate_doc_id(raw: str) -> str:
    """Validate a candidate `doc_id` per design.md D7.

    Returns the validated value unchanged on success. Raises `DocIdRejected`
    on any failure; callers MUST NOT attempt to derive a path from a rejected
    candidate.
    """
    decoded = unquote(raw)
    normalized = unicodedata.normalize("NFC", decoded)
    if normalized != decoded:
        raise DocIdRejected(f"NFC normalization changed the value: {raw!r}")

    value = normalized

    if value == "":
        raise DocIdRejected("doc_id is empty")
    if "/" in value or "\\" in value:
        raise DocIdRejected(f"path separator in doc_id: {raw!r}")
    if "\x00" in value:
        raise DocIdRejected(f"NUL byte in doc_id: {raw!r}")
    if _CONTROL_CHAR_RE.search(value):
        raise DocIdRejected(f"control character in doc_id: {raw!r}")
    if ".." in value:
        raise DocIdRejected(f"'..' substring in doc_id: {raw!r}")
    if value in (".", ".."):
        raise DocIdRejected(f"doc_id is '.' or '..': {raw!r}")
    if value.startswith((".", "-")):
        raise DocIdRejected(f"doc_id begins with '.' or '-': {raw!r}")
    if value.endswith(" "):
        raise DocIdRejected(f"doc_id ends with a space: {raw!r}")
    if value.upper() in _RESERVED_DEVICE_NAMES:
        raise DocIdRejected(f"reserved device name: {raw!r}")
    if len(value) > _MAX_LENGTH:
        raise DocIdRejected(f"doc_id exceeds {_MAX_LENGTH} characters: {raw!r}")

    # A trailing "." is deliberately ACCEPTED — see D7. Non-ASCII letters and
    # marks are accepted too; the rule prevents traversal, not the alphabet.
    return value


def resolve_and_assert_contained(base_dir: str | Path, filename: str) -> Path:
    """Resolve `base_dir / filename` and assert it stays inside `base_dir`.

    This is the second, independent containment barrier required by D7 and
    the Threat Matrix: every write resolves its final path and asserts
    containment, regardless of whether `validate_doc_id` already ran.
    """
    base = Path(base_dir).resolve()
    candidate = (base / filename).resolve()
    if candidate != base and base not in candidate.parents:
        raise DocIdRejected(f"resolved path escapes intended directory: {filename!r}")
    return candidate
