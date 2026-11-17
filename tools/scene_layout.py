#!/usr/bin/env python3
"""Authoritative layout of the underwater pod: zones, slots and asset catalog.

The pod geometry lives here, once. Slots are physical places with a mount
point, a facing yaw and a size budget, so the model fills them by name and can
never produce a floating, sideways or out-of-bounds prop. `assets/scene.js`
only reads `pos`/`rot`/`mount`, so this file is the single source of truth.

Conventions
  floor   pos.y = 0, geometry grows toward local +Z (front), rot faces the room
  wall    pos = backplate centre, geometry grows toward local +Z
  ceiling pos = attachment point, geometry grows down
  water   pos = anchor point, no ground contact
"""
from __future__ import annotations

import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

POD = {
    "radius": 3.05,
    "height": 2.9,
    "eye": 1.62,
    "spawn": [0.0, 1.62, 1.0],
    "bounds": {"minX": -2.55, "maxX": 2.55, "minZ": -2.35, "maxZ": 2.25},
}


def _radial_rot(x: float, z: float) -> float:
    """Yaw that points a chunk's local +Z toward the room centre."""
    return round(math.atan2(-x, -z), 3)


def _slot(sid, zone, mount, pos, size, default, note, accent="primary", rot=None):
    s = {
        "id": sid,
        "zone": zone,
        "mount": mount,
        "pos": [round(v, 2) for v in pos],
        "size": size,
        "default": default,
        "note": note,
        "accent": accent,
        "seed": 1 + sum(ord(c) for c in sid) % 97,
    }
    if mount in ("floor", "wall") and rot is None:
        s["rot"] = _radial_rot(pos[0], pos[2])
    else:
        s["rot"] = round(rot or 0.0, 3)
    return s


SLOTS = [
    # ── port (left) side ─────────────────────────────────────────────────
    _slot("port-front", "port-side", "floor", (-2.25, 0, -1.1), [0.9, 1.6, 0.85],
          "bucket-mop", "front-left corner, beside the console bank, seen on the left as you spawn"),
    _slot("port-mid", "port-side", "floor", (-2.45, 0, -0.35), [1.6, 1.9, 0.8],
          "workbench", "the long left wall between the corner and the rear locker"),
    _slot("port-rear", "port-side", "floor", (-2.2, 0, 1.35), [1.6, 2.45, 0.8],
          "locker-double", "rear-left, between the left wall and the hatch wall"),
    _slot("wall-port", "port-side", "wall", (-2.75, 1.5, -0.35), [1.3, 0.95, 0.4],
          "console-wall", "left wall at eye height, above the workbench"),
    # ── starboard (right) side ───────────────────────────────────────────
    _slot("starboard-front", "starboard-side", "floor", (2.25, 0, -1.1), [1.0, 2.0, 0.8],
          "instrument-rack", "front-right corner, beside the console bank"),
    _slot("starboard-mid", "starboard-side", "floor", (2.45, 0, -0.35), [1.2, 1.7, 0.8],
          "oxygen-rack", "the long right wall between the corner and the rear locker"),
    _slot("starboard-rear", "starboard-side", "floor", (2.2, 0, 1.35), [1.1, 2.42, 0.9],
          "dive-gear", "rear-right, between the right wall and the hatch wall"),
    _slot("wall-starboard", "starboard-side", "wall", (2.75, 1.5, -0.35), [1.4, 0.95, 0.4],
          "pipe-manifold", "right wall at eye height, above the oxygen rack"),
    # ── rear hatch wall ──────────────────────────────────────────────────
    _slot("back-left", "bulkhead", "floor", (-1.45, 0, 2.42), [1.0, 1.9, 0.7],
          "med-bay", "in front of the hatch wall, left of the hatch", rot=math.pi),
    _slot("back-right", "bulkhead", "floor", (1.45, 0, 2.42), [1.2, 1.7, 0.8],
          "radio-station", "in front of the hatch wall, right of the hatch", rot=math.pi),
    _slot("bulkhead-left", "bulkhead", "wall", (-1.45, 1.55, 2.48), [1.25, 1.2, 0.3],
          "tool-wall", "hatch wall at eye height, left of the hatch wheel", rot=math.pi),
    _slot("bulkhead-right", "bulkhead", "wall", (1.45, 1.55, 2.48), [1.2, 1.2, 0.3],
          "emergency-station", "hatch wall at eye height, right of the hatch wheel", rot=math.pi),
    _slot("bulkhead-high", "bulkhead", "wall", (0, 2.24, 2.44), [1.4, 0.66, 0.35],
          "pipe-manifold", "hatch wall above the AIRLOCK sign, below the top trim", rot=math.pi),
    # ── ceiling ──────────────────────────────────────────────────────────
    _slot("ceil-front", "overhead", "ceiling", (0, 2.88, -1.35), [0.6, 0.8, 0.6],
          "ceiling-lamp", "above the walkway in front of the console bank", accent="warm"),
    _slot("ceil-port", "overhead", "ceiling", (-1.35, 2.88, 1.25), [0.9, 0.6, 0.9],
          "ceiling-fan", "rear-left ceiling corner"),
    _slot("ceil-starboard", "overhead", "ceiling", (1.35, 2.88, 1.25), [0.75, 0.8, 0.75],
          "radar-dish", "rear-right ceiling corner", accent="green"),
]

EXTERIOR = [
    _slot("reef-front", "exterior", "water", (0, -4.9, -9.0), [8, 7, 6],
          "reef-arch", "dead ahead through the front glass, 9 m out"),
    _slot("reef-port", "exterior", "water", (-9, -4.9, -3.0), [9, 10, 7],
          "kelp-forest", "through the port glass, 9 m out", accent="green"),
    _slot("reef-starboard", "exterior", "water", (9, -4.9, -4.0), [8, 5, 6],
          "coral-garden", "through the starboard glass, 9 m out", accent="secondary"),
    _slot("reef-rear", "exterior", "water", (2, -4.9, 10.0), [6, 13, 6],
          "rock-spire", "behind the pod, visible when you turn around", accent="primary"),
    _slot("vent-near", "exterior", "water", (-4, -4.9, -5.5), [5, 7, 5],
          "vent-field", "near the port front quarter, close enough to see bubbles", accent="warm"),
    _slot("wreck-far", "exterior", "water", (-13, -4.9, -12.0), [12, 6, 7],
          "wreck", "far port background, a wreck silhouette 17 m out"),
    _slot("water-fish", "exterior", "water", (2, 1.5, -7.0), [10, 7, 10],
          "fish-tornado", "midwater in front of the pod at eye level", accent="primary"),
    _slot("water-jelly", "exterior", "water", (-6.5, 2.5, -5.0), [7, 5, 7],
          "jelly-drift", "port window, drifting at eye level", accent="violet"),
    _slot("water-port", "exterior", "water", (-12, 0.2, 1.5), [8, 6, 8],
          "anemone-field", "hard to port, midwater close enough to see individual polyps", accent="secondary"),
    _slot("water-starboard", "exterior", "water", (12, 0.5, 1.5), [8, 6, 8],
          "rock-cluster", "hard to starboard, midground reef structure at eye level", accent="primary"),
    _slot("water-shafts", "exterior", "water", (-2, 3.0, -13.0), [11, 16, 11],
          "light-shafts", "from the surface, backlighting the reef"),
    _slot("water-sub", "exterior", "water", (20, 8.0, -30.0), [10, 5, 5],
          "sub-pass", "distant starboard background, a patrol craft", accent="warm"),
]

ALL_SLOTS = SLOTS + EXTERIOR

ZONES = [
    {
        "id": "port-side",
        "title": "Port side: left wall, workbench corner and rear locker",
        "brief": ("Seen immediately when the player turns left after spawning. It must read as the working "
                  "side of the pod: one large floor anchor, one medium, one small, plus one wall-mounted "
                  "unit at eye height. Mix one warm accent into the cool palette."),
        "mounts": ["floor", "wall"],
    },
    {
        "id": "starboard-side",
        "title": "Starboard side: right wall, instrument corner and rear locker",
        "brief": ("Mirror of the port side but not a copy: different function, different accent, different "
                  "scale rhythm. The wall unit here should not be the same asset as the port wall unit."),
        "mounts": ["floor", "wall"],
    },
    {
        "id": "bulkhead",
        "title": "Rear hatch wall: storage, comms, safety and the airlock",
        "brief": ("The player turns around to face this. Two floor anchors flank the hatch wheel, two wall "
                  "units sit at eye height and one wide unit hangs above the AIRLOCK sign. This wall should "
                  "feel like the operational heart: labels, gauges, safety gear."),
        "mounts": ["floor", "wall"],
    },
    {
        "id": "overhead",
        "title": "Ceiling: light, ventilation and a rotating sensor",
        "brief": ("Three ceiling anchors. Keep them light: one warm practical, one mechanical, one moving. "
                  "Do not hang anything large or low over the walkway."),
        "mounts": ["ceiling"],
    },
    {
        "id": "exterior",
        "title": "Outside the glass: the reef and the water column",
        "brief": ("Ten anchors around and above the pod, from 5 m to 30 m. Compose three depth layers: "
                  "near reef, midground structure, far water column. The species and silhouettes should "
                  "differ by direction so turning the head changes the view."),
        "mounts": ["water"],
    },
]


def load_catalog() -> list[dict]:
    path = ROOT / "assets" / "chunks.json"
    if not path.exists():
        raise SystemExit("missing assets/chunks.json — run: bun tools/gen_chunks_json.js > assets/chunks.json")
    return json.loads(path.read_text(encoding="utf-8"))


def catalog_for(zone: dict, catalog: list[dict]) -> list[dict]:
    mounts = set(zone["mounts"])
    return [c for c in catalog if c["mount"] in mounts]


def zone_slots(zone_id: str) -> list[dict]:
    return [s for s in ALL_SLOTS if s["zone"] == zone_id]


def slot_by_id(sid: str) -> dict | None:
    for s in ALL_SLOTS:
        if s["id"] == sid:
            return s
    return None


def fits(slot: dict, asset: dict) -> tuple[bool, str]:
    """Size gate: the chunk's bounding box must fit the slot budget."""
    if slot["mount"] != asset["mount"]:
        return False, "asset mounts on %s, slot is %s" % (asset["mount"], slot["mount"])
    if slot["mount"] == "water":
        return True, ""
    for i, axis in enumerate("whd"):
        limit = slot["size"][i]
        need = asset["size"][i]
        if need > limit * 1.02:
            return False, "%s %.2f > slot %.2f" % (axis, need, limit)
    return True, ""


def check_defaults(catalog: list[dict]) -> list[str]:
    """A slot's own fallback must fit its budget.

    The compiler does not run the size gate on defaults (they have to be there),
    so a default that is too big renders anyway and teaches the model a wrong
    size. Fail loudly instead.
    """
    by_name = {c["name"]: c for c in catalog}
    problems = []
    for s in ALL_SLOTS:
        d = s["default"]
        if d not in by_name:
            problems.append("%s: default %s is not in the catalog" % (s["id"], d))
            continue
        ok, why = fits(s, by_name[d])
        if not ok:
            problems.append("%s: default %s does not fit: %s" % (s["id"], d, why))
    return problems


def validate_assignments(zone_id: str, answer: dict, catalog: list[dict],
                         taken: dict[str, str] | None = None) -> tuple[list[dict], list[str]]:
    """Return (accepted assignments, error lines). Never raises on model output.

    `taken` maps asset -> slot for properties already accepted in *other* zones.
    The catalog is small, so without this the model fills two walls with the same
    cabinet; rejecting the repeat by name is cheaper than another prompt rule.
    """
    slots = {s["id"]: s for s in zone_slots(zone_id)}
    by_name = {c["name"]: c for c in catalog}
    raw = answer.get("slots") if isinstance(answer, dict) else None
    if not isinstance(raw, list):
        return [], ["answer has no `slots` array"]
    accepted, errors, seen = [], [], set()
    for item in raw:
        if not isinstance(item, dict):
            errors.append("item is not an object: %r" % (item,))
            continue
        sid = str(item.get("slot", "")).strip()
        name = str(item.get("asset", "")).strip()
        # tolerate "workbench — vise, tool tray" and "port-mid (left wall)"
        sid = re.match(r"[A-Za-z0-9_-]+", sid).group(0) if re.match(r"[A-Za-z0-9_-]+", sid) else sid
        name = re.match(r"[A-Za-z0-9_-]+", name).group(0) if re.match(r"[A-Za-z0-9_-]+", name) else name
        name = name.lower()
        if sid not in slots:
            errors.append("slot %r is not in this zone" % sid)
            continue
        if sid in seen:
            errors.append("slot %r listed twice" % sid)
            continue
        if name not in by_name:
            errors.append("asset %r does not exist in this zone's catalog" % name)
            continue
        ok, why = fits(slots[sid], by_name[name])
        if not ok:
            errors.append("%s does not fit %s: %s" % (name, sid, why))
            continue
        if taken and name in taken and slots[sid]["mount"] != "water":
            errors.append("%s is already placed at %s; pick a different asset for %s"
                          % (name, taken[name], sid))
            continue
        accent = str(item.get("accent", "primary")).strip().lower()
        # "warm (practical lamp)" should still count as warm
        accent = re.split(r"[^a-z]+", accent)[0] if accent else "primary"
        if accent not in ("primary", "warm", "secondary", "green", "red", "violet", "amber"):
            accent = "primary"
        accepted.append({"slot": sid, "asset": name, "accent": accent})
        seen.add(sid)
    return accepted, errors


def spec_skeleton() -> dict:
    return {
        "slots": [
            {
                "id": s["id"], "zone": s["zone"], "mount": s["mount"],
                "pos": s["pos"], "rot": s["rot"], "size": s["size"],
                "default": s["default"], "accent": s["accent"], "seed": s["seed"],
            }
            for s in ALL_SLOTS
        ],
    }


def slot_table(zone_id: str) -> str:
    """Compact slot table for a prompt.

    The default asset is deliberately NOT shown. With it in the table the model
    echoed it for 24 of 28 slots: the fallback became the answer. The fallback
    still exists in the compiler as a safety net, it is just not an anchor.
    """
    lines = []
    for s in zone_slots(zone_id):
        lines.append("%-16s %-8s max %sx%sx%s m  %s" % (
            s["id"], s["mount"], s["size"][0], s["size"][1], s["size"][2],
            s["note"]))
    return "\n".join(lines)


def catalog_table(zone_id: str, catalog: list[dict]) -> str:
    zone = next(z for z in ZONES if z["id"] == zone_id)
    lines = []
    for c in catalog_for(zone, catalog):
        w, h, d = c["size"]
        lines.append("%-18s %-8s %4.2fx%4.2fx%4.2f  %s" % (c["name"], c["mount"], w, h, d, c["desc"]))
    return "\n".join(lines)


if __name__ == "__main__":
    cat = load_catalog()
    problems = check_defaults(cat)
    for p in problems:
        print("DEFAULT FIT PROBLEM:", p)
    print(json.dumps(spec_skeleton(), indent=1))
    for z in ZONES:
        print("\n##", z["id"], len(zone_slots(z["id"])), "slots")
        print(slot_table(z["id"]))
