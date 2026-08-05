"""Send one real escalation email, to prove the alert path end to end.

Run once by an operator, never by CI:

    read -rs "?Resend API key: " K && RESEND_API_KEY="$K" \
      uv run --directory pipeline python scripts/send_test_alert.py; unset K

It calls the same `send_alert` production uses, so a pass here is evidence about the
real path rather than about a parallel test client. `send_alert` deliberately never
raises — a broken alert must not take the sync down with it — so this script turns on
logging and inspects the outcome itself, otherwise a failure would be silent.
"""

from __future__ import annotations

import logging
import os
import sys

from hcd_sync import notify

MESSAGE = (
    "Prueba de escalación del archivo de ordenanzas del HCD de Coronel Rosales. "
    "Si recibís este mensaje, la ruta de alertas funciona de punta a punta: "
    "Resend envía desde bot@fragua.dev y hcd@fragua.dev recibe."
)


def main() -> int:
    logging.basicConfig(level=logging.DEBUG, format="%(levelname)s %(name)s: %(message)s")

    if not os.environ.get("RESEND_API_KEY"):
        print("RESEND_API_KEY is not set — nothing was sent.", file=sys.stderr)
        return 2

    print(f"from: {notify.FROM_ADDRESS}\nto:   {notify.TO_ADDRESS}\n")

    captured: dict[str, int] = {}

    class _ObservingTransport(notify.RequestsTransport):  # type: ignore[misc]
        def post(self, url, *, json, headers, timeout):  # type: ignore[no-untyped-def]
            response = super().post(url, json=json, headers=headers, timeout=timeout)
            captured["status"] = response.status_code
            return response

    notify.send_alert(MESSAGE, transport=_ObservingTransport())

    status = captured.get("status")
    if status is None:
        print("\nNo HTTP response was observed — the transport itself failed.", file=sys.stderr)
        return 1
    if status >= 400:
        print(f"\nResend rejected the send: HTTP {status}.", file=sys.stderr)
        return 1

    print(f"\nResend accepted the send: HTTP {status}. Now confirm it ARRIVED at")
    print(f"{notify.TO_ADDRESS} — acceptance by the API is not delivery to a mailbox.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
