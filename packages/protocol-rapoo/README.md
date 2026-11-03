# Rapoo protocol

Pure preparation and verification for the bounded inactive DPI-stage experiment,
plus decoding of the BB status payload observed directly through WebHID.
There is no hardware access or generic memory-write API in this package.

Polling decoding checks the native response status, length and overlap with DPI.
A bench-only 1000-to-500 Hz preparation preserves wired/reserved bytes and verifies
both configuration blocks. WebHID application/restoration and persistence after
physical power cycles were verified with native readback on the observed unit. See
`research/experiments/browser-polling-write.md`.

Fixed read experiments live in `research/experiments/read-mt760.py` and
`apps/web/src/webhid-probe.ts`. The web app receives partial DPI/battery telemetry
through passive BB events; full configuration reading still needs native access.

A development-only WebHID bench has sent and restored the known DPI packet.
Web-applied DPI also survived a physical power cycle; recovery after reconnect
was native, followed by a verified cycle of the restored state. See
`research/experiments/browser-dpi-write.md` for evidence and limits. The main UI
does not expose configuration writes, pairing or firmware updates.
Do not reuse ClickSync's Rapoo protocol without proving compatibility with this exact device.
