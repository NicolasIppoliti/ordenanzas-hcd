"""`notify.py` operator escalation email (design.md D6). Task 5.1.

`send_alert` is the callable wired into `cli.main` as `run_sync`'s
`notifier` argument. It must never raise -- a delivery failure is logged
and must never mask the sync job's own non-zero exit, which is the
fail-safe GitHub's built-in workflow-failure email relies on -- and it
must never let `RESEND_API_KEY` reach a log line, an exception message, or
any other observable surface, because this repository is public.
"""

from __future__ import annotations

import logging

import pytest

from hcd_sync import notify
from hcd_sync.notify import RESEND_API_URL, TO_ADDRESS, TransportResponse, send_alert

FAKE_KEY = "re_supersecret_do_not_leak_1234567890"


class _FakeTransport:
    """Records the exact call `send_alert` made, never opens a socket."""

    def __init__(self, response: TransportResponse | None = None, raises: Exception | None = None) -> None:
        self.response = response
        self.raises = raises
        self.calls: list[dict[str, object]] = []

    def post(
        self, url: str, *, json: dict[str, object], headers: dict[str, str], timeout: float
    ) -> TransportResponse:
        self.calls.append({"url": url, "json": json, "headers": headers, "timeout": timeout})
        if self.raises is not None:
            raise self.raises
        assert self.response is not None
        return self.response


def test_send_alert_posts_to_resend_with_bearer_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RESEND_API_KEY", FAKE_KEY)
    transport = _FakeTransport(response=TransportResponse(status_code=200))

    send_alert("robots.txt now returns 200; halting", transport=transport)

    assert len(transport.calls) == 1
    call = transport.calls[0]
    assert call["url"] == RESEND_API_URL
    assert call["headers"] == {"Authorization": f"Bearer {FAKE_KEY}"}
    json_body = call["json"]
    assert json_body["to"] == [TO_ADDRESS]
    assert "robots.txt" in str(json_body["text"])


def test_send_alert_never_raises_on_transport_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RESEND_API_KEY", FAKE_KEY)
    transport = _FakeTransport(raises=ConnectionError("boom"))

    # Must not raise -- a delivery failure must never mask the job's own
    # non-zero exit code.
    send_alert("halt reason", transport=transport)


def test_send_alert_never_raises_on_provider_error_status(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RESEND_API_KEY", FAKE_KEY)
    transport = _FakeTransport(response=TransportResponse(status_code=401))

    send_alert("halt reason", transport=transport)


def test_send_alert_skips_silently_with_no_stored_key_when_key_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    transport = _FakeTransport(response=TransportResponse(status_code=200))

    send_alert("halt reason", transport=transport)

    assert transport.calls == []


def test_error_paths_never_log_the_api_key(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """The load-bearing assertion for task 5.1: no error path -- transport
    exception, provider error status, or missing-key skip -- ever lets the
    secret substring reach a log record.
    """
    caplog.set_level(logging.DEBUG)
    monkeypatch.setenv("RESEND_API_KEY", FAKE_KEY)

    send_alert("halt reason", transport=_FakeTransport(raises=ConnectionError("boom")))
    send_alert("halt reason", transport=_FakeTransport(response=TransportResponse(status_code=500)))

    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    send_alert("halt reason", transport=_FakeTransport(response=TransportResponse(status_code=200)))

    for record in caplog.records:
        assert FAKE_KEY not in record.getMessage()
        assert FAKE_KEY not in repr(record.exc_info)


def test_sender_uses_the_domain_actually_verified_in_resend() -> None:
    """The From domain must be one Resend has verified, or every send 403s.

    The design proposed `alerts.fragua.dev` to keep Resend away from the apex SPF that
    Cloudflare Email Routing uses. Measured, that concern does not apply: Resend isolates
    its return-path in `send.fragua.dev` and never touches the apex SPF, so the owner
    verified `fragua.dev` itself. Sending from an unverified subdomain would fail only
    when an alert was actually needed.
    """
    assert notify.FROM_ADDRESS.endswith("@fragua.dev")
    assert "alerts.fragua.dev" not in notify.FROM_ADDRESS
