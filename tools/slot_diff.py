#!/usr/bin/env python3
"""Compare a run's slot choices with the layout defaults.

    python3 tools/slot_diff.py designs/underwater-v3
    python3 tools/slot_diff.py designs/underwater-v3 designs/underwater-v4

Prints one row per slot (chosen, default, SAME/DIFF), counts how many defaults
survived, and lists any asset named twice. Repeats inside a zone or across
interior zones are a model error the driver should already have rejected, so a
non-empty list here means a rule was bypassed (for example a reused zone file).
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import scene_layout as L  # noqa: E402


def load(run: Path) -> dict[str, str]:
    spec = json.loads((run / "spec.json").read_text(encoding="utf-8"))
    return {a["slot"]: a["asset"] for a in spec.get("assignments", [])}


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    run = Path(argv[0])
    chosen = load(run)
    after = load(Path(argv[1])) if len(argv) > 1 else None

    same = diff = 0
    rows = []
    for s in L.ALL_SLOTS:
        a = chosen.get(s["id"], s["default"] + " (default)")
        tag = "SAME" if a == s["default"] else "DIFF"
        same += tag == "SAME"
        diff += tag == "DIFF"
        extra = ""
        if after:
            b = after.get(s["id"], s["default"] + " (default)")
            extra = ("  %-20s %s" % (b, "same" if a == b else "changed")) if a != b else ""
        rows.append("%-16s %-20s %-20s %s%s" % (s["id"], a, s["default"], tag, extra))
    print("\n".join(rows))
    print("\n%d SAME / %d DIFF of %d slots" % (same, diff, len(L.ALL_SLOTS)))

    counts = Counter(chosen.values())
    repeat = {name: n for name, n in counts.items() if n > 1}
    if repeat:
        where: dict[str, list[str]] = {}
        for slot, name in chosen.items():
            where.setdefault(name, []).append(slot)
        for name in repeat:
            print("REPEAT  %-20s %s" % (name, ", ".join(where[name])))
    else:
        print("no repeated assets")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
