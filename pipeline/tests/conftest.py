"""Shared pytest fixtures for the hcd_sync test suite.

The network guard below is load-bearing: it makes "no test ever touches the
live government host" an enforced property of the test suite rather than an
aspiration. See design.md, "Testing Strategy" > Guard.
"""

from __future__ import annotations

import socket
from collections.abc import Iterator

import pytest


class NetworkAccessError(RuntimeError):
    """Raised when a test attempts to open a real network socket."""


@pytest.fixture(autouse=True)
def block_network(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Autouse fixture: monkeypatch `socket.socket` to raise on use.

    Any code path under test that tries to open a real socket — directly, or
    transitively through `requests` — fails loudly instead of silently
    reaching the live host. Tests that need HTTP behavior must inject a fake
    fetcher/transport instead of hitting the network.
    """

    def _raise(*_args: object, **_kwargs: object) -> None:
        raise NetworkAccessError(
            "Network access attempted during a test. Inject a fake "
            "fetcher/transport instead of opening a real socket."
        )

    monkeypatch.setattr(socket, "socket", _raise)
    yield
