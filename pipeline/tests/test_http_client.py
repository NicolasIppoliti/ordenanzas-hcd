"""Politeness, concurrency and robots.txt HALT. Tasks 2b.2, 2b.3, 2b.4, 2b.5."""

from __future__ import annotations

import threading

import pytest

from hcd_sync.archive import FetchExhaustedError, FetchResponse
from hcd_sync.http_client import (
    BoundedRetryFetcher,
    HostPolicy,
    PolicedHostFetcher,
    RobotsTxtAppearedError,
    check_robots_txt_still_absent,
)


class _FakeFetcher:
    """Records every `get` call; returns a canned response or raises."""

    def __init__(self, responses: list[FetchResponse] | None = None) -> None:
        self.calls: list[str] = []
        self._responses = list(responses or [])

    def get(self, url: str, *, timeout: float = 60, headers: dict[str, str] | None = None) -> FetchResponse:
        self.calls.append(url)
        if self._responses:
            return self._responses.pop(0)
        return FetchResponse(status_code=200, content=b"%PDF-1.4 stub")


class _FakeClock:
    """A controllable monotonic clock for delay assertions."""

    def __init__(self, start: float = 0.0) -> None:
        self.now = start

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


def test_politeness_delay_is_at_least_four_seconds() -> None:
    """Task 2b.2: ≥4.0s requested between sequential gets, via injected clock/sleep."""
    fetcher = _FakeFetcher()
    clock = _FakeClock()
    sleeps: list[float] = []

    def fake_sleep(seconds: float) -> None:
        sleeps.append(seconds)
        clock.advance(seconds)

    policed = PolicedHostFetcher(
        fetcher, HostPolicy(host="hcdrosales.gob.ar"), sleep=fake_sleep, clock=clock
    )

    policed.get("https://hcdrosales.gob.ar/a.pdf")
    clock.advance(0.5)  # only half a second elapses "in real time"
    policed.get("https://hcdrosales.gob.ar/b.pdf")

    assert len(sleeps) == 1
    assert sleeps[0] == pytest.approx(3.5)  # 4.0 - 0.5 requested to close the gap
    assert len(fetcher.calls) == 2


def test_politeness_delay_not_requested_when_enough_time_already_elapsed() -> None:
    fetcher = _FakeFetcher()
    clock = _FakeClock()
    sleeps: list[float] = []

    policed = PolicedHostFetcher(
        fetcher,
        HostPolicy(host="hcdrosales.gob.ar"),
        sleep=lambda s: sleeps.append(s),
        clock=clock,
    )
    policed.get("https://hcdrosales.gob.ar/a.pdf")
    clock.advance(5.0)
    policed.get("https://hcdrosales.gob.ar/b.pdf")

    assert sleeps == []


def test_concurrency_cap_never_exceeds_one_in_flight() -> None:
    """Task 2b.3: two threads through the semaphore; assert never >1 in flight."""
    in_flight = 0
    max_in_flight = 0
    lock = threading.Lock()

    class _SlowFetcher:
        def get(self, url: str, *, timeout: float = 60, headers: dict[str, str] | None = None) -> FetchResponse:
            nonlocal in_flight, max_in_flight
            with lock:
                in_flight += 1
                max_in_flight = max(max_in_flight, in_flight)
            threading.Event().wait(0.05)
            with lock:
                in_flight -= 1
            return FetchResponse(status_code=200, content=b"ok")

    policed = PolicedHostFetcher(
        _SlowFetcher(),
        HostPolicy(host="hcdrosales.gob.ar", min_delay_seconds=0.0),
        sleep=lambda _s: None,
    )

    threads = [
        threading.Thread(target=policed.get, args=(f"https://hcdrosales.gob.ar/{i}.pdf",))
        for i in range(4)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert max_in_flight == 1


def test_robots_txt_still_404_proceeds_normally() -> None:
    fetcher = _FakeFetcher([FetchResponse(status_code=404, content=b"")])
    check_robots_txt_still_absent(fetcher, "hcdrosales.gob.ar")  # does not raise
    assert fetcher.calls == ["https://hcdrosales.gob.ar/robots.txt"]


def test_robots_txt_returning_200_raises_halt_error() -> None:
    """Task 2b.4: robots.txt 200 -> halt error, exactly one get call so far."""
    fetcher = _FakeFetcher([FetchResponse(status_code=200, content=b"User-agent: *\nDisallow: /")])
    with pytest.raises(RobotsTxtAppearedError):
        check_robots_txt_still_absent(fetcher, "hcdrosales.gob.ar")
    assert fetcher.calls == ["https://hcdrosales.gob.ar/robots.txt"]


def test_bounded_retry_exhausted_raises_after_max_attempts() -> None:
    """Task 2b.5 (fetcher level): bounded retries exhausted -> FetchExhaustedError."""
    fetcher = _FakeFetcher(
        [
            FetchResponse(status_code=503, content=b""),
            FetchResponse(status_code=503, content=b""),
            FetchResponse(status_code=503, content=b""),
        ]
    )
    sleeps: list[float] = []
    retrying = BoundedRetryFetcher(fetcher, max_attempts=3, sleep=lambda s: sleeps.append(s))

    with pytest.raises(FetchExhaustedError):
        retrying.get("https://hcdrosales.gob.ar/broken.pdf")

    assert len(fetcher.calls) == 3
    assert len(sleeps) == 2  # backoff only between attempts, not after the last one


def test_bounded_retry_succeeds_after_transient_failures() -> None:
    fetcher = _FakeFetcher(
        [
            FetchResponse(status_code=500, content=b""),
            FetchResponse(status_code=200, content=b"%PDF-1.4 ok"),
        ]
    )
    retrying = BoundedRetryFetcher(fetcher, max_attempts=3, sleep=lambda _s: None)

    response = retrying.get("https://hcdrosales.gob.ar/flaky.pdf")

    assert response.status_code == 200
    assert len(fetcher.calls) == 2
