"""Polite fetcher for `hcdrosales.gob.ar`. See design.md 'Polite Crawling
Policy' and the `robots.txt` Halt Condition requirement in
`specs/source-sync/spec.md`.

Ported, never imported, from `votus-plataforma-lla/etl/etl/http_client.py`
(`HostPolicy`, `PolicedHostFetcher`, `check_robots_txt_still_absent`).
Adaptations for this project, stated:

- `HostPolicy` carries no `allowed_path_prefixes` allowlist. The bounded
  surface (design.md 'Sync mechanics': same host, scheme `https`, path ends
  `.pdf`, and the URL appeared in this run's listing parse) is already
  enforced upstream in `listing.py`'s `_is_in_bounded_surface`, before any
  URL ever reaches this module — a redundant runtime allowlist here would
  duplicate that check against a different, harder-to-keep-in-sync data
  shape (URL prefixes vs. an exact per-run URL set).
- `BoundedRetryFetcher` replaces votus's PBA-specific `_PolicedBackoffFetcher`
  with a host-agnostic version implementing the same bounded
  backoff-then-stop contract (design.md 'Polite Crawling Policy': "bounded
  retries with a stop condition on persistent error").
"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable
from dataclasses import dataclass

import requests

from hcd_sync.archive import Fetcher, FetchExhaustedError, FetchResponse

#: Identifying UA per spec: carries a Fragua-owned contact URL and the
#: escalation mailbox, so a human on the receiving end can identify and
#: contact the operator of this bot.
#: The contact URL is the archive's own future address. It does not resolve yet — the site
#: is published in slice 5 — so the e-mail below is the channel that actually works today,
#: and it is carried in the same header for exactly that reason. Task 5.11 verifies the URL
#: resolves before the full corpus import runs.
DEFAULT_USER_AGENT = (
    "HCDOrdinanceArchiveBot/1.0 "
    "(+https://ordenanzas.fragua.dev; archival bot for the public HCD "
    "ordinance archive of Coronel Rosales; contact hcd@fragua.dev)"
)

DEFAULT_MAX_ATTEMPTS = 3
DEFAULT_MIN_DELAY_SECONDS = 4.0


@dataclass
class RequestsFetcher:
    """Real HTTP fetcher used in production.

    Never exercised by the test suite — `tests/conftest.py`'s autouse
    `block_network` fixture makes opening a real socket raise, so any test
    that reached this class would fail loudly rather than touching the
    live host.
    """

    def get(
        self, url: str, *, timeout: float = 60, headers: dict[str, str] | None = None
    ) -> FetchResponse:
        response = requests.get(url, timeout=timeout, headers=headers or {}, allow_redirects=True)
        return FetchResponse(
            status_code=response.status_code, content=response.content, headers=dict(response.headers)
        )


@dataclass(frozen=True)
class HostPolicy:
    """Etiquette constraints bound to one host (design.md 'Polite Crawling Policy')."""

    host: str
    max_concurrency: int = 1
    min_delay_seconds: float = DEFAULT_MIN_DELAY_SECONDS
    user_agent: str = DEFAULT_USER_AGENT


class RobotsTxtAppearedError(Exception):
    """Raised when `robots.txt` now returns 200 where it previously 404d —
    halt for a fresh policy decision rather than parsing and proceeding.
    """


class PolicedHostFetcher:
    """Wraps a `Fetcher` with single concurrency, an enforced minimum delay
    between sequential requests and an identifying User-Agent.

    `sleep`/`clock` are injectable so tests assert politeness without
    spending real wall-clock time (design.md Testing Strategy).
    """

    def __init__(
        self,
        fetcher: Fetcher,
        policy: HostPolicy,
        *,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._fetcher = fetcher
        self._policy = policy
        self._semaphore = threading.Semaphore(policy.max_concurrency)
        self._sleep = sleep
        self._clock = clock
        self._delay_lock = threading.Lock()
        self._last_request_at: float | None = None

    def get(
        self, url: str, *, timeout: float = 60, headers: dict[str, str] | None = None
    ) -> FetchResponse:
        with self._semaphore:
            self._enforce_delay()
            merged_headers = {"User-Agent": self._policy.user_agent, **(headers or {})}
            return self._fetcher.get(url, timeout=timeout, headers=merged_headers)

    def _enforce_delay(self) -> None:
        with self._delay_lock:
            now = self._clock()
            if self._last_request_at is not None:
                elapsed = now - self._last_request_at
                remaining = self._policy.min_delay_seconds - elapsed
                if remaining > 0:
                    self._sleep(remaining)
            self._last_request_at = self._clock()


@dataclass
class BoundedRetryFetcher:
    """Adds bounded backoff-then-stop retries around any `Fetcher`,
    typically a `PolicedHostFetcher`. Raises `FetchExhaustedError` after
    `max_attempts` consecutive 429/5xx responses or transport exceptions.
    """

    fetcher: Fetcher
    max_attempts: int = DEFAULT_MAX_ATTEMPTS
    sleep: Callable[[float], None] = time.sleep
    backoff_seconds: float = DEFAULT_MIN_DELAY_SECONDS

    def get(
        self, url: str, *, timeout: float = 60, headers: dict[str, str] | None = None
    ) -> FetchResponse:
        last_response: FetchResponse | None = None
        last_exc: Exception | None = None
        for attempt in range(1, self.max_attempts + 1):
            try:
                response = self.fetcher.get(url, timeout=timeout, headers=headers)
            except Exception as exc:  # noqa: BLE001 -- any transport failure
                # counts as one exhausted attempt; re-raised as
                # FetchExhaustedError only once every attempt is spent.
                last_exc = exc
                last_response = None
                if attempt < self.max_attempts:
                    self.sleep(self.backoff_seconds)
                continue

            if response.status_code == 429 or response.status_code >= 500:
                last_response = response
                last_exc = None
                if attempt < self.max_attempts:
                    retry_after = response.headers.get("Retry-After")
                    delay = float(retry_after) if retry_after else self.backoff_seconds
                    self.sleep(delay)
                continue

            return response

        detail = f"HTTP {last_response.status_code}" if last_response is not None else str(last_exc)
        raise FetchExhaustedError(
            f"{url} failed after {self.max_attempts} attempts; last error: {detail}"
        )


def check_robots_txt_still_absent(fetcher: Fetcher, host: str) -> None:
    """Re-check on each run that `robots.txt` has not started returning 200.

    Raises `RobotsTxtAppearedError` if it has; does nothing otherwise. This
    is a raw, unpoliced, one-off request — it is the very first request of
    a run, so there is nothing to enforce a delay against yet.
    """
    response = fetcher.get(
        f"https://{host}/robots.txt", timeout=10, headers={"User-Agent": DEFAULT_USER_AGENT}
    )
    if response.status_code == 200:
        raise RobotsTxtAppearedError(
            f"https://{host}/robots.txt now returns 200; halting for a fresh "
            "policy decision instead of parsing and proceeding"
        )
