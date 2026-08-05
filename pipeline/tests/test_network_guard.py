"""Prove the autouse network guard in conftest.py is enforced, not aspirational.

This is the one test in Phase 1 (Scaffolding). It exists to verify the guard
itself, not any product behavior — Phase 1 ships no product code.
"""

from __future__ import annotations

import pytest
import requests

from conftest import NetworkAccessError


def test_real_requests_get_is_blocked_by_the_network_guard() -> None:
    """A real `requests.get` against a live host must raise, not succeed."""
    with pytest.raises(NetworkAccessError):
        requests.get("https://hcdrosales.gob.ar/", timeout=5)
