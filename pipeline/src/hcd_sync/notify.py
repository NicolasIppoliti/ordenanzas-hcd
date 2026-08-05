"""Operator escalation email via the Resend HTTP API (design.md D6).

Wired as `run_sync`'s `notifier` callable in `cli.main`. `RESEND_API_KEY`
lives only as a repository Actions secret injected into the job's
environment -- this module reads it from `os.environ`, never writes it to
disk, never interpolates it into a shell string, and never logs it, even
on error. On a provider error it logs the HTTP status only, never the
response headers or body, because this repository is public.

`send_alert` never raises. A halted or retry-exhausted sync run always
exits non-zero regardless of whether this function succeeds, and GitHub's
built-in workflow-failure email to the repository owner is the
unconditional fail-safe layer (spec.md "Operator Escalation on Halt or
Exhausted Retries"). A Resend delivery failure must never mask that exit
code, so it is logged and swallowed here instead of propagated.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any, Protocol, cast

RESEND_API_URL = "https://api.resend.com/emails"
#: Must be a domain Resend has verified, or every send fails with a 403 — and it would
#: fail only on the day an alert was actually needed. The design proposed a dedicated
#: `alerts.` subdomain to keep Resend away from the apex SPF that Cloudflare Email Routing
#: uses. Measured against the real zone, that concern does not apply: Resend isolates its
#: return-path in `send.fragua.dev` (its own MX and SPF) and never touches the apex
#: record, so the apex stays verified for one domain instead of two.
FROM_ADDRESS = "bot@fragua.dev"
TO_ADDRESS = "hcd@fragua.dev"
SUBJECT = "hcd-sync: operator action required"
_TIMEOUT_SECONDS = 10.0

logger = logging.getLogger(__name__)


@dataclass
class TransportResponse:
    status_code: int


class Transport(Protocol):
    """Minimal HTTP POST surface, swappable with a fake in tests -- the
    same seam pattern as `archive.Fetcher`. Nothing in the test suite ever
    exercises `RequestsTransport`; `tests/conftest.py`'s autouse
    `block_network` fixture makes opening a real socket raise.
    """

    def post(
        self,
        url: str,
        *,
        json: dict[str, object],
        headers: dict[str, str],
        timeout: float,
    ) -> TransportResponse: ...


class RequestsTransport:
    """Real HTTP transport used in production."""

    def post(
        self,
        url: str,
        *,
        json: dict[str, object],
        headers: dict[str, str],
        timeout: float,
    ) -> TransportResponse:
        import requests

        # `requests`' stubs type `json=` as a stricter recursive `JsonType`
        # than this module's own `dict[str, object]` transport seam; the
        # payload built in `send_alert` is always plain JSON-safe values
        # (strings and a list of one string), so this cast is a type-only
        # boundary adjustment, not a behavior change.
        response = requests.post(
            url, json=cast("Any", json), headers=headers, timeout=timeout
        )
        return TransportResponse(status_code=response.status_code)


def send_alert(message: str, *, transport: Transport | None = None) -> None:
    """Send one operator escalation email to `hcd@fragua.dev`.

    Silently does nothing (logging that it did so, without the key) if
    `RESEND_API_KEY` is unset -- a degraded-escalation state design.md
    already accounts for via the GitHub failure-email fail-safe. Never
    raises.
    """
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        logger.error("RESEND_API_KEY is not set; skipping the hcd@fragua.dev escalation email")
        return

    active_transport: Transport = transport if transport is not None else RequestsTransport()

    try:
        response = active_transport.post(
            RESEND_API_URL,
            json={
                "from": FROM_ADDRESS,
                "to": [TO_ADDRESS],
                "subject": SUBJECT,
                "text": message,
            },
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=_TIMEOUT_SECONDS,
        )
    except Exception:
        logger.exception("Resend request failed (transport error); operator email not sent")
        return

    if response.status_code >= 400:
        logger.error("Resend API returned HTTP %s; operator email not sent", response.status_code)
