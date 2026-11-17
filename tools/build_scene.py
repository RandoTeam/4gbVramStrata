#!/usr/bin/env python3
"""Staged harness: plan -> per-zone slot filling -> deterministic compile -> gate.

Why staged instead of one long answer: on this laptop Clover spends most of an
answer on thinking. One 8,000-token answer has to hold the whole scene in mind
and still write code, so it runs out before the details. This harness asks for
one small, checkable decision per call, with maximum reasoning each time:

  1. plan     concept, palette and what each zone is for          (~700 tokens)
  2. zones    fill named slots for one zone, JSON only            (~40 tokens/slot)
  3. compile  assets/scene.js places chunks deterministically      (no model)
  4. gate     headless Firefox: console, draw calls, walk, shots   (no model)
  5. repair   only the failing zone, only its error text           (rare)

The model never writes geometry, coordinates, HTML or a renderer. It chooses
asset names for slots that already have a mount point, a facing and a size
budget, which removes the failure modes of the single-shot harness: floating
props, sideways consoles, NaN geometry, missing collisions and half-finished
files.

    ./run-clover-apex-i-nanoplus.sh            # server on :8080
    .venv/bin/python tools/build_scene.py --out designs/underwater-v2
    .venv/bin/python tools/build_scene.py --out designs/underwater-v2 --defaults
    .venv/bin/python tools/build_scene.py --reuse designs/underwater-v2 --gate-only
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

import scene_layout as L  # noqa: E402

TEMPLATE = ROOT / "templates" / "underwater-pod" / "index.template.html"
PROMPT = ROOT / "templates" / "underwater-pod" / "prompt.txt"
THREE = ROOT / "assets" / "vendor" / "three.min.js"
ASSETS = ROOT / "assets" / "procedural.js"
CHUNKS = ROOT / "assets" / "chunks.js"
SCENE = ROOT / "assets" / "scene.js"
FRAMEWORK = ROOT / "assets" / "framework.js"

SYSTEM = """You are the art director of a procedural underwater research station for a browser Three.js scene.
The engine, the pod shell, the controls, the collision system and the procedural asset library already exist.
You do not write code, HTML, shaders, coordinates or geometry. You make placement decisions by naming an
asset for a named slot. Reply with JSON only: no markdown, no comments, no prose."""

PLAN_SCHEMA = """{
  "concept": "<= 90 chars, what this station is",
  "story": "<= 160 chars, what happened here and what the player should notice",
  "palette": {
    "hull": "#rrggbb, a dark desaturated metal (luminance < 0.30)",
    "accent": "#rrggbb, the main glowing UI colour, bright and saturated",
    "warm": "#rrggbb, a warm practical light colour",
    "secondary": "#rrggbb, one contrasting accent for the exterior or warning labels"
  },
  "mood": "<= 80 chars",
  "beats": ["3 to 5 short lines: what the player sees turning left, right, back, up, and outside"],
  "zoneFocus": {
    "port-side": "<= 100 chars",
    "starboard-side": "<= 100 chars",
    "bulkhead": "<= 100 chars",
    "overhead": "<= 100 chars",
    "exterior": "<= 100 chars"
  }
}"""

ZONE_SCHEMA = """{"slots": [{"slot": "slot-id-from-the-table", "asset": "asset-name-from-the-catalog", "accent": "primary|warm|secondary|green|red|violet|amber"}]}"""

WORLD_BRIEF = """THE WORLD (already built, do not describe or rebuild it)
- A cylindrical observation pod 6.1 m across and 2.9 m high: metal floor, a full ring of curved glass at
  eye height, 12 mullions, a ceiling with four lamps and a vent, a rear bulkhead with a wheel hatch.
- A three-console bank with three animated screens and two seats faces the front glass at z=-2.06.
- Outside: a modelled seabed at y=-4.9, caustics, rocks, coral, kelp, four fish schools, particles, vents,
  jellyfish, a whale, a survey submarine and light shafts.
- The player walks inside the pod only, with collision, mouse/touch look, joystick, Reset/Pause/Quality.
- 15 interior slots and 10 exterior slots are empty. Every slot has a fixed position, a facing and a size
  budget. The asset library supplies detailed props: lockers, workbenches, racks, consoles, pipes, safety
  gear, galley, dive gear, lights, reef set pieces, wrecks and creatures.
- If a slot is left empty it keeps a sensible default. Choosing the right asset for the right place is the
  whole job: density, function and composition."""

PLAN_RULES = """HOW TO DECIDE
1. Read the brief. Give the station a specific function and a believable recent history, not "generic sci-fi".
2. Choose a palette that works under cyan water light with warm practicals: dark hull, one bright accent,
   one warm, one contrasting secondary. Keep the accent readable on screens.
3. Plan the room as a tour: what is on the left when you turn, what anchors the right, what is behind you,
   what hangs above, what is outside. Name concrete objects, not adjectives.
4. The exterior is a depth composition: near reef, midground structure, far water column. Vary species and
   silhouettes by direction so turning the head changes the view.
5. Respect the pod: it is a working room, not a warehouse. One strong anchor per wall beats five small ones."""

ZONE_RULES = """HOW TO FILL SLOTS
- Use only slot ids and asset names from the tables. Never invent either.
- Match the asset's mount to the slot (floor / wall / ceiling / water). The catalog lists it.
- Every slot is empty until you fill it: there is no hidden fallback and no safe answer to fall back on.
  Fill all of them, and choose the asset the brief actually calls for, not the most obvious one.
- One large anchor + one medium + one small per wall reads better than three medium objects.
- Do not put the same asset in two slots of the same zone, and never reuse an asset that the station
  already has in another zone (the list below the palette names them). A room of near-identical
  cabinets is a failure even if every individual choice is plausible.
- Accent use: mostly "primary"; at most one "warm" practical per zone; "red" only for warning gear;
  "secondary" for the one object you want the eye to find.
- The floor slots sit against the curved wall, so the asset's back is to the glass and its front faces the
  room. Do not worry about coordinates: the compiler places and orients everything.
- Keep the spawn-to-console walkway clear: never choose a floor asset deeper than 0.9 m for a slot whose
  size budget depth is 0.9 m or less."""


# ── model transport ────────────────────────────────────────────────────────
def chat(messages, base: str, max_tokens: int, temperature: float, effort: str,
         timeout: float = 3600.0) -> dict:
    payload = {
        "model": "local",
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": False,
    }
    if effort and effort != "none":
        payload["reasoning_effort"] = effort
    else:
        payload["chat_template_kwargs"] = {"enable_thinking": False}
    body = json.dumps(payload).encode()
    req = urllib.request.Request(base.rstrip("/") + "/v1/chat/completions", body,
                                 {"Content-Type": "application/json"})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = json.loads(r.read())
    data["_wall_s"] = round(time.time() - t0, 1)
    choice = (data.get("choices") or [{}])[0]
    data["_content"] = ((choice.get("message") or {}).get("content") or "")
    data["_finish"] = choice.get("finish_reason")
    return data


def parse_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        blocks = re.findall(r"```(?:json)?\s*(.*?)```", text, re.S | re.I)
        if blocks:
            text = max(blocks, key=len).strip()
    try:
        return json.loads(text)
    except Exception:
        pass
    # first balanced object
    start = text.find("{")
    if start < 0:
        raise ValueError("no JSON object in answer")
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(text)):
        c = text[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return json.loads(text[start:i + 1])
    raise ValueError("unbalanced JSON object")


class Run:
    def __init__(self, out: Path, base: str, max_tokens: int, temperature: float,
                 effort: str, verbose: bool = True):
        self.out = out
        self.base = base
        self.max_tokens = max_tokens
        self.temperature = temperature
        self.effort = effort
        self.verbose = verbose
        self.log: list[dict] = []
        out.mkdir(parents=True, exist_ok=True)

    def say(self, msg: str):
        if self.verbose:
            print(msg, flush=True)

    def ask(self, stage: str, system: str, user: str, max_tokens: int | None = None) -> dict:
        budget = max_tokens or self.max_tokens
        for attempt in (1, 2):
            messages = [{"role": "system", "content": system},
                        {"role": "user", "content": user}]
            t0 = time.time()
            data = chat(messages, self.base, budget, self.temperature, self.effort)
            usage = data.get("usage") or {}
            content = data["_content"]
            entry = {
                "stage": stage, "attempt": attempt, "wall_s": data["_wall_s"],
                "prompt_tokens": usage.get("prompt_tokens"),
                "completion_tokens": usage.get("completion_tokens"),
                "reasoning_tokens": (usage.get("completion_tokens_details") or {}).get("reasoning_tokens"),
                "finish": data["_finish"], "chars": len(content),
                "monotonic_s": round(time.time() - t0, 1),
            }
            self.log.append(entry)
            self.say("  %-22s %5.1fs  out %5s tok  %s" % (
                stage, data["_wall_s"],
                entry["completion_tokens"] or "?", data["_finish"] or ""))
            (self.out / ("raw-" + re.sub(r"[^a-z0-9-]+", "-", stage) + ("" if attempt == 1 else "-r2") + ".txt")) \
                .write_text(content, encoding="utf-8")
            if content.strip():
                return data
            if attempt == 1:
                self.say("  empty answer, retrying once")
        raise RuntimeError("model returned nothing for " + stage)

    def save_log(self):
        path = self.out / "log.jsonl"
        with path.open("a", encoding="utf-8") as f:
            for e in self.log:
                f.write(json.dumps(e, ensure_ascii=False) + "\n")


# ── stages ─────────────────────────────────────────────────────────────────
def stage_plan(run: Run, brief: str) -> dict:
    user = "THE BRIEF\n" + brief.strip() + "\n\n" + WORLD_BRIEF + "\n\n" + PLAN_RULES + \
           "\n\nReply with exactly this JSON shape, no markdown:\n" + PLAN_SCHEMA
    last = ""
    for attempt in (1, 2, 3):
        if attempt > 1:
            user = ("Your previous answer was not valid: " + last + "\n\nFix it. Reply with JSON only, "
                    "same shape:\n" + PLAN_SCHEMA + "\n\nBrief:\n" + brief.strip()[:1500])
        data = run.ask("plan" + ("" if attempt == 1 else "-r%d" % attempt), SYSTEM, user)
        try:
            plan = normalize_plan(parse_json(data["_content"]))
        except Exception as err:
            last = str(err)[:300]
            run.say("  plan rejected: " + last)
            continue
        (run.out / "plan.json").write_text(json.dumps(plan, indent=1, ensure_ascii=False), encoding="utf-8")
        return plan
    raise SystemExit("plan stage failed: " + last)


def normalize_plan(plan: dict) -> dict:
    if not isinstance(plan, dict):
        raise ValueError("plan is not an object")
    for key in ("concept", "story", "mood"):
        if not isinstance(plan.get(key), str):
            raise ValueError("missing string " + key)
    pal = plan.get("palette")
    if not isinstance(pal, dict):
        raise ValueError("missing palette")
    colors = {}
    for key in ("hull", "accent", "warm", "secondary"):
        raw = str(pal.get(key, "")).strip()
        # the model often writes "#00e5ff (bright cyan control glow)" — take the
        # first hex in the string instead of discarding a perfectly good colour
        found = re.search(r"#[0-9a-fA-F]{6}", raw)
        v = found.group(0).lower() if found else ""
        if not v:
            v = {"hull": "#2f4249", "accent": "#63e8ff", "warm": "#ffb35c",
                 "secondary": "#ff7f8f"}[key]
        colors[key] = v
    # hull must stay dark or the glass and practicals lose contrast
    h = colors["hull"].lstrip("#")
    lum = 0.2126 * int(h[0:2], 16) + 0.7152 * int(h[2:4], 16) + 0.0722 * int(h[4:6], 16)
    if lum > 96:
        colors["hull"] = "#2f4249"
    beats = plan.get("beats")
    if not isinstance(beats, list) or not beats:
        beats = ["console bank ahead", "workbench on the port wall", "lockers behind", "reef outside"]
    focus = plan.get("zoneFocus") if isinstance(plan.get("zoneFocus"), dict) else {}
    zones = {}
    for z in L.ZONES:
        v = str(focus.get(z["id"], "")).strip()
        zones[z["id"]] = v[:160]
    return {
        "concept": str(plan["concept"])[:120],
        "story": str(plan["story"])[:200],
        "mood": str(plan["mood"])[:100],
        "palette": colors,
        "beats": [str(b)[:110] for b in beats[:6]],
        "zoneFocus": zones,
    }


def stage_zone(run: Run, plan: dict, zone: dict, catalog: list[dict],
               taken: dict[str, str] | None = None) -> list[dict]:
    slots = L.zone_slots(zone["id"])
    fill_target = len(slots)
    user = (
        "THE STATION\n"
        "concept: %s\nstory: %s\nmood: %s\npalette: %s\nbeats:\n- %s\n\n"
        "ZONE: %s\n%s\nZone focus from the plan: %s\n\n"
        "%s"
        "SLOTS (id, mount, size budget w x h x d in metres, where it is)\n%s\n\n"
        "ASSET CATALOG (name, mount, w x h x d in metres, what it looks like)\n%s\n\n"
        "%s\n\n"
        "Fill all %d slots. Reply with JSON only, exactly:\n%s"
    ) % (
        plan["concept"], plan["story"], plan["mood"], json.dumps(plan["palette"]),
        "\n- ".join(plan["beats"]), zone["title"], zone["brief"],
        plan["zoneFocus"].get(zone["id"]) or "(none)",
        (("ALREADY PLACED ELSEWHERE IN THE STATION (these assets are taken; do not reuse them here)\n"
          + "\n".join("- %s at %s" % (a, sl) for a, sl in sorted(taken.items())) + "\n\n")
         if taken else ""),
        L.slot_table(zone["id"]), L.catalog_table(zone["id"], catalog),
        ZONE_RULES, len(slots), ZONE_SCHEMA,
    )
    errors: list[str] = []
    accepted: list[dict] = []
    for attempt in (1, 2):
        if attempt == 2:
            user = user + ("\n\nYOUR PREVIOUS ANSWER WAS REJECTED. Fix these and resend the whole JSON:\n- "
                           + "\n- ".join(errors[:10]))
        try:
            data = run.ask("zone-" + zone["id"] + ("" if attempt == 1 else "-fix"), SYSTEM, user)
            answer = parse_json(data["_content"])
        except Exception as err:
            errors = ["invalid JSON: " + str(err)[:200]]
            run.say("  %s rejected: %s" % (zone["id"], errors[0]))
            continue
        accepted, errors = L.validate_assignments(zone["id"], answer, catalog, taken)
        if not errors and len(accepted) >= fill_target:
            break
        if not errors and len(accepted) < fill_target:
            errors = ["only %d of %d slots filled: every slot must be filled" % (len(accepted), len(slots))]
        run.say("  %s: %d accepted, %d error(s)" % (zone["id"], len(accepted), len(errors)))
    (run.out / ("zone-" + zone["id"] + ".json")).write_text(
        json.dumps({"accepted": accepted, "errors": errors}, indent=1), encoding="utf-8")
    return accepted


# ── compile ────────────────────────────────────────────────────────────────
def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def app_source(spec: dict) -> str:
    return (
        "(function () {\n"
        "  'use strict';\n"
        "  var SPEC = " + json.dumps(spec, separators=(",", ":")) + ";\n"
        "  HARNESS.start({\n"
        "    spawn: [0, 1.62, 1.0],\n"
        "    yaw: 0,\n"
        "    quality: 2,\n"
        "    build: function (ctx) { SCENE.build(ctx, SPEC); },\n"
        "    update: function (ctx, dt, t) {}\n"
        "  });\n"
        "})();\n"
    )


def assemble(spec: dict, out: Path) -> Path:
    app = app_source(spec)
    html = read(TEMPLATE)
    html = html.replace("/*__THREE__*/", read(THREE))
    html = html.replace("/*__NAMESPACE__*/", "")
    html = html.replace("/*__ASSETS__*/", read(ASSETS))
    html = html.replace("/*__CHUNKS__*/", read(CHUNKS))
    html = html.replace("/*__SCENE__*/", read(SCENE))
    html = html.replace("/*__FRAMEWORK__*/", read(FRAMEWORK))
    html = html.replace("/*__APP__*/", app)
    (out / "app.js").write_text(app, encoding="utf-8")
    target = out / "index.html"
    target.write_text(html, encoding="utf-8")
    return target


def build_spec(plan: dict, answers: dict[str, list[dict]]) -> dict:
    spec = L.spec_skeleton()
    spec["palette"] = plan["palette"]
    spec["concept"] = plan["concept"]
    spec["assignments"] = [a for z in answers for a in answers[z]]
    return spec


def defaults_spec() -> dict:
    return {
        "palette": {"hull": "#2f4249", "accent": "#63e8ff", "warm": "#ffb35c", "secondary": "#ff7f8f"},
        "concept": "default layout",
        "assignments": [],
        "slots": L.spec_skeleton()["slots"],
    }


def report_md(plan: dict, spec: dict, gate: dict | None, log: list[dict], out: Path) -> str:
    lines = ["# Generated scene report", ""]
    lines.append("Concept: **%s**  " % plan.get("concept", "?"))
    lines.append("Story: %s  " % plan.get("story", "?"))
    lines.append("Palette: `%s`" % json.dumps(plan.get("palette", {})))
    lines += ["", "## Stages", "", "| stage | wall s | out tok | finish |", "| --- | ---: | ---: | --- |"]
    for e in log:
        lines.append("| %s | %s | %s | %s |" % (e["stage"], e["wall_s"], e["completion_tokens"], e["finish"]))
    lines += ["", "## Slots", "", "| slot | asset | accent |", "| --- | --- | --- |"]
    by_slot = {a["slot"]: a for a in spec.get("assignments", [])}
    for s in spec.get("slots", []):
        a = by_slot.get(s["id"])
        lines.append("| %s | %s | %s |" % (s["id"], a["asset"] if a else s["default"] + " (default)",
                                           a["accent"] if a else s["accent"]))
    if gate:
        probe = gate.get("probe") or {}
        lines += ["", "## Gate", "", "- ok: **%s**" % gate.get("ok"),
                  "- problems: %s" % (gate.get("problems") or "none"),
                  "- draw calls: %s, triangles: %s, colliders: %s" % (
                      probe.get("drawCalls"), probe.get("triangles"), probe.get("colliders")),
                  "- chunks: %s (defaults %s), failed: %s, recovered: %s" % (
                      (probe.get("scene") or {}).get("chunks"), (probe.get("scene") or {}).get("defaults"),
                      (probe.get("scene") or {}).get("failed"), (probe.get("scene") or {}).get("recovered")),
                  "- fps (software GL): %s" % gate.get("fps"),
                  "- boot: %s s" % gate.get("bootSeconds"),
                  "- screenshots: %s, %s" % (gate.get("desktopShot"), gate.get("mobileShot"))]
    lines += ["", "## Files", "", "- `index.html` — the single deliverable",
              "- `spec.json` — the compiled layout", "- `plan.json` — the art-direction plan",
              "- `gate.json` — machine verdict", "- `raw-*.txt` — every model answer"]
    text = "\n".join(lines) + "\n"
    (out / "report.md").write_text(text, encoding="utf-8")
    return text


# ── main ──────────────────────────────────────────────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prompt", default=str(PROMPT))
    ap.add_argument("--out", default=str(ROOT / "designs" / "underwater-v2"))
    ap.add_argument("--base", default="http://127.0.0.1:8080")
    ap.add_argument("--max-tokens", type=int, default=9000)
    ap.add_argument("--temperature", type=float, default=0.35)
    ap.add_argument("--effort", default="xhigh", choices=["none", "low", "medium", "high", "xhigh"])
    ap.add_argument("--defaults", action="store_true", help="compile the default layout, no model calls")
    ap.add_argument("--reuse", default=None, help="reuse plan/zone answers from an earlier run")
    ap.add_argument("--gate-only", action="store_true", help="reassemble and gate an existing spec")
    ap.add_argument("--zones", default=None, help="comma list of zones to (re)ask")
    ap.add_argument("--no-gate", action="store_true")
    ap.add_argument("--save-spec", default=None, help="load this spec JSON instead of asking the model")
    a = ap.parse_args()

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    run = Run(out, a.base, a.max_tokens, a.temperature, a.effort)
    catalog = L.load_catalog()
    bad_defaults = L.check_defaults(catalog)
    if bad_defaults:
        raise SystemExit("slot defaults do not fit their budgets:\n  " + "\n  ".join(bad_defaults))
    t_start = time.time()

    try:
        if a.defaults:
            plan = {"concept": "default layout", "story": "the shipped baseline",
                    "mood": "baseline", "palette": {"hull": "#2f4249", "accent": "#63e8ff",
                                                    "warm": "#ffb35c", "secondary": "#ff7f8f"},
                    "beats": [], "zoneFocus": {}}
            spec = defaults_spec()
            run.say("compiling the default layout (no model calls)")
        elif a.save_spec:
            spec = json.loads(Path(a.save_spec).read_text(encoding="utf-8"))
            plan = json.loads((out / "plan.json").read_text(encoding="utf-8")) if (out / "plan.json").exists() else \
                {"concept": spec.get("concept", "loaded"), "story": "", "palette": spec.get("palette", {})}
            run.say("loaded spec from " + a.save_spec)
        elif a.gate_only and (out / "spec.json").exists():
            # --gate-only means "do not touch the model": recompile the spec that
            # is already in the out directory with the current assets, then gate
            # it. Without this it fell through to a full model run.
            spec = json.loads((out / "spec.json").read_text(encoding="utf-8"))
            plan = json.loads((out / "plan.json").read_text(encoding="utf-8")) \
                if (out / "plan.json").exists() else {"concept": spec.get("concept", "loaded")}
            run.say("gate-only: recompiled spec.json with the current assets")
        else:
            brief = read(Path(a.prompt))
            plan_path = out / "plan.json"
            zone_paths = {z["id"]: out / ("zone-" + z["id"] + ".json") for z in L.ZONES}
            reuse = bool(a.reuse)
            if reuse:
                src = Path(a.reuse)
                if (src / "plan.json").exists():
                    plan = json.loads((src / "plan.json").read_text(encoding="utf-8"))
                else:
                    plan = stage_plan(run, brief)
                run.say("reused plan: " + plan.get("concept", ""))
            elif plan_path.exists() and a.gate_only:
                plan = json.loads(plan_path.read_text(encoding="utf-8"))
            else:
                run.say("stage 1/2: plan")
                plan = stage_plan(run, brief)

            wanted = set(x.strip() for x in a.zones.split(",")) if a.zones else None
            answers: dict[str, list[dict]] = {}
            run.say("stage 2/2: zone slot filling")
            # assets already spoken for, so a second wall does not get the same
            # cabinet the first one got
            taken: dict[str, str] = {}
            for zone in L.ZONES:
                if wanted and zone["id"] not in wanted:
                    path = (Path(a.reuse) / ("zone-" + zone["id"] + ".json")) if a.reuse else zone_paths[zone["id"]]
                    if path.exists():
                        answers[zone["id"]] = json.loads(path.read_text(encoding="utf-8")).get("accepted", [])
                        for it in answers[zone["id"]]:
                            if zone["id"] != "exterior":
                                taken.setdefault(it["asset"], it["slot"])
                        continue
                answers[zone["id"]] = stage_zone(run, plan, zone, catalog,
                                                 taken if zone["id"] != "exterior" else None)
                if zone["id"] != "exterior":
                    for it in answers[zone["id"]]:
                        taken.setdefault(it["asset"], it["slot"])
            for z in L.ZONES:
                answers.setdefault(z["id"], [])
            spec = build_spec(plan, answers)
            (out / "spec.json").write_text(json.dumps(spec, indent=1, ensure_ascii=False), encoding="utf-8")
            run.save_log()

        target = assemble(spec, out)
        size_kb = target.stat().st_size / 1024
        run.say("assembled %s (%.0f KB)" % (target, size_kb))

        gate = None
        if not a.no_gate:
            import browser_gate
            run.say("gate: headless Firefox")
            gate = browser_gate.gate(target, out, out / "gate.json")
            run.say("  gate %s in %.1fs; draw calls %s; chunks %s; problems %s" % (
                "PASS" if gate.get("ok") else "FAIL", gate.get("seconds", 0),
                (gate.get("probe") or {}).get("drawCalls"),
                ((gate.get("probe") or {}).get("scene") or {}).get("chunks"),
                gate.get("problems") or "none"))

        report_md(plan, spec, gate, run.log, out)
        run.say("total %.1f s; report %s" % (time.time() - t_start, out / "report.md"))
        return 0 if (not gate or gate.get("ok")) else 1
    except Exception as err:
        run.save_log()
        (out / "failure.txt").write_text(repr(err), encoding="utf-8")
        raise


if __name__ == "__main__":
    sys.exit(main())
