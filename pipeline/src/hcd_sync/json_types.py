"""Shared alias for the JSON shapes exchanged across the pipeline/site contract.

Every artifact under `data/` is plain JSON with string keys. Naming that shape once
keeps the writers' signatures honest under `mypy --strict` without scattering
`dict[str, object]` through every module.
"""

from __future__ import annotations

from typing import TypeAlias

JsonDict: TypeAlias = dict[str, object]
