#!/usr/bin/env python3
"""Capture a contact sheet of the pod: front, port, starboard, rear, ceiling.

    python3 tools/look_around.py designs/underwater-default/index.html \
        --out designs/underwater-default/views
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from browser_gate import Driver  # noqa: E402

VIEWS = [
    ("front", 0.0, -0.08, [0, 1.62, 1.0]),
    ("port", 1.57, -0.05, [0, 1.62, 1.0]),
    ("starboard", -1.57, -0.05, [0, 1.62, 1.0]),
    ("rear", 3.14, -0.05, [0, 1.62, 1.0]),
    ("ceiling", 0.0, 0.75, [0, 1.62, 0.6]),
    ("floor", 0.0, -0.62, [0, 1.62, 0.6]),
    ("corner", 2.35, -0.1, [-0.55, 1.62, 0.15]),
    ("console", 0.0, -0.18, [0, 1.62, 0.25]),
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("page")
    ap.add_argument("--out", default=None)
    ap.add_argument("--width", type=int, default=1280)
    ap.add_argument("--height", type=int, default=800)
    a = ap.parse_args()
    page = Path(a.page).resolve()
    out = Path(a.out) if a.out else page.parent / "views"
    out.mkdir(parents=True, exist_ok=True)
    d = Driver()
    shots = []
    try:
        d.open(page.as_uri())
        d.rect(a.width, a.height)
        d.wait("window.__POD && window.__POD.ready", timeout=120)
        d.wait("window.__POD.frames > 6", timeout=60)
        time.sleep(0.8)
        for name, yaw, pitch, pos in VIEWS:
            d.js("var p=window.__POD; p.setPosition(%s,%s,%s); p.setView(%s,%s); return 1;"
                 % (pos[0], pos[1], pos[2], yaw, pitch))
            time.sleep(0.65)
            shots.append(d.shot(out / ("%s.png" % name)))
        print("\n".join(shots))
    finally:
        d.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
