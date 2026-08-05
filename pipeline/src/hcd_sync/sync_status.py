"""`data/sync-status.json` — per-run status record. See design.md Interfaces/Contracts."""

from __future__ import annotations

from dataclasses import dataclass

from hcd_sync.json_types import JsonDict

SCHEMA_VERSION = 1
STALENESS_THRESHOLD_DAYS = 30


@dataclass(frozen=True)
class SyncStatus:
    last_run_at: str
    last_run_status: str  # "ok" | "partial" | "error" | "halted"
    last_success_at: str | None
    documents_total: int
    documents_added_last_run: int
    staleness_threshold_days: int = STALENESS_THRESHOLD_DAYS
    halt_reason: str | None = None

    def to_json_dict(self) -> JsonDict:
        return {
            "schema_version": SCHEMA_VERSION,
            "last_run_at": self.last_run_at,
            "last_run_status": self.last_run_status,
            "last_success_at": self.last_success_at,
            "documents_total": self.documents_total,
            "documents_added_last_run": self.documents_added_last_run,
            "staleness_threshold_days": self.staleness_threshold_days,
            "halt_reason": self.halt_reason,
        }
