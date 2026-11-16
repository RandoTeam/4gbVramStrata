#!/usr/bin/env python3
"""Generate one single-file Three.js page with the local Clover model and review it.

    ./run-clover-apex-i-nanoplus.sh          # or serve/server.py --config ... --port 8080
    .venv/bin/python tools/design_harness.py \
        --prompt templates/underwater-pod/prompt.txt \
        --out designs/underwater-pod

The harness supplies the library (three.min.js + assets/procedural.js + assets/framework.js) and the HTML/CSS shell;
the model writes only the app module. That keeps the model's context for scene logic instead of
1.8 MB of bundled Three.js. Nothing is downloaded and no external asset is allowed in the result.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "templates" / "underwater-pod" / "index.template.html"
SKILLS = [
    ROOT / "skills" / "threejs-underwater" / "SKILL.md",
    ROOT / "skills" / "fps-controls" / "SKILL.md",
    ROOT / "skills" / "visual-review" / "SKILL.md",
]
THREE = ROOT / "assets" / "vendor" / "three.min.js"
ASSETS = ROOT / "assets" / "procedural.js"
FRAMEWORK = ROOT / "assets" / "framework.js"

SYSTEM = """STOP. Do not write a renderer, scene, camera, lights, controls, animation loop or HTML.
The only valid answer is one `HARNESS.start({ build(ctx) {...}, update(ctx, dt, t) {...} })` call.
If you write `new THREE.WebGLRenderer`, `new THREE.Scene`, `new THREE.PerspectiveCamera`,
`addEventListener`, `document.body.appendChild`, a second `<canvas>`, or your own HUD, the answer
is wrong.

You are a senior creative Three.js developer. You write the content module for a
single-file browser scene. The harness has already included `three.min.js` (global `THREE`),
`assets/procedural.js` (the `POD` asset pack) and `assets/framework.js` (the `HARNESS` runtime);
you write only the JavaScript that follows them. Do not import anything, do not use a CDN, do not
fetch a file, do not return HTML, CSS, markdown fences or explanations. Return only JavaScript.

The HTML shell and the runtime already exist. Never create a renderer, camera, lights, controls,
collision loop, resize handler or Reset/Pause/Quality handlers: HARNESS.start does all of that.
Your whole module is one call:

  HARNESS.start({
    spawn: [0, 1.62, 1.0],
    yaw: 0,
    build(ctx) {
      // add interior detail and exterior life here
    },
    update(ctx, dt, t) {
      // optional per-frame animation not covered by POD.updateLife
    }
  });

What HARNESS.start already builds (do not duplicate it):
- the pod shell: metal floor, a full ring of curved glass, mullions, ceiling ribs and lamps, a rear
  bulkhead with a wheel hatch, ceiling pipes and cables, gauges and warning beacons;
- a console bank with three consoles and three animated screens, two seats, two lockers, three
  crates, two railings and a fire extinguisher;
- the exterior: seabed, caustics, 22 rocks, coral, kelp, three fish schools, 1,100 particles,
  bubbling vents, a whale silhouette, a survey submarine and seven light shafts, all animated;
- cool/warm practical lighting, fog, ACES tone mapping, environment reflections, shadows;
- first-person movement (WASD/arrows, mouse drag, touch joystick and look pad), collision against
  the shell and every object passed to ctx.solid, Reset/Pause/Quality, boot splash, resize.

Your job is density, composition and life. Add at least:
- two console/screen clusters on the side walls, each with an animated screen and two status lamps;
- storage: two more lockers or crates, a wall tool board, a diving helmet, a cable coil, a flask,
  a radio, a first-aid box, a bucket and a mop, a folded blanket, a mug, a clipboard;
- pipes and cables that follow the shell, plus a vertical pipe with a valve wheel;
- a second hatch-side station with gauges and a warning light;
- exterior extras visible through the side windows: a rock arch or spire, two coral clusters, a
  kelp cluster, a small school of fish and a passing jellyfish or second creature;
- animation hooks for flickering screens, a rotating radar, a swinging lamp, drifting cable, and
  a creature that crosses the background.
Keep the walking loop from the spawn to the front console clear. Put every large object through
ctx.solid(obj); put decorative objects through ctx.props.add(obj) or ctx.add(obj).

Available API:
- ctx.props (Group), ctx.exterior (Group), ctx.pod, ctx.scene, ctx.camera, ctx.renderer
- ctx.solid(obj): add to props and make it a collider
- ctx.add(obj, {solid:true, exterior:false})
- ctx.screen(w,h,color,kind) -> animated CanvasTexture plane; kind: 'wave' | 'bars' | 'radar'
- ctx.gauge(r,color), ctx.lamp(color,r), ctx.onQuality(fn), ctx.toast(text)
- ctx.station(side,z,color) -> ready-made wall station, side=-1 left / +1 right; oriented and solid
- ctx.reef(angle,distance,seed) -> rock+coral+kelp cluster snapped to the seabed at y=-4.9
- exterior ground is y=-4.9: rocks/coral/kelp start there, never at y=0
- POD.box/cyl/sphere/pipe/rock/coral/kelp/fishSchool/bubbleField/particleField/consoleUnit/
  locker/seat/hatch/railing/lightShaft/glassMaterial/mat/glowMat/screen/statusLamp/gauge/rng
- POD.updateLife(scene,t) and POD.tick(scene,t) are called by the runtime; do not call them again.

Hard rules:
- no external assets, no network calls, no alert/prompt, no OrbitControls, no second renderer;
- never move or replace the camera, never add your own keyboard/pointer listeners, never hide the UI;
- all objects must be grounded and scaled to a 2.9 m high, 6.1 m wide pod;
- return 250-500 lines of complete, runnable code with no TODO markers.

Follow the attached skills exactly. Return only the app module."""


CONTRACT = """

HARNESS CONTRACT - this overrides any instruction above that conflicts.
The HTML shell, canvas#c, HUD, joystick, look pad, boot splash, Three.js, POD and HARNESS are
already loaded. The pod shell and exterior already exist. Do not create a renderer, scene, camera,
lights, canvas, HUD, animation loop, keyboard/pointer/touch listener, resize handler or second
renderer. Do not touch the DOM. Your answer must be exactly one IIFE with one call:

(function () {
  'use strict';
  HARNESS.start({
    spawn: [0, 1.62, 1.0],
    yaw: 0,
    build(ctx) {
      // ctx.props / ctx.exterior / ctx.solid / ctx.screen / ctx.gauge / ctx.lamp
      // POD.box / POD.pipe / POD.locker / POD.seat / POD.coral / POD.kelp / ...
    },
    update(ctx, dt, t) {
      // optional bespoke animation
    }
  });
})();

Return no HTML, no markdown, no prose. The first line of your answer must be `(function () {`.
"""


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def chat(prompt: str, base: str, max_tokens: int, temperature: float,
         think: bool = True, effort: str | None = None) -> dict:
    messages = [{"role": "system", "content": SYSTEM}]
    for skill in SKILLS:
        messages.append({"role": "system", "content": "SKILL: " + skill.stem + "\n" + read(skill)})
    messages.append({"role": "user", "content": prompt + CONTRACT})
    payload = {
        "model": "local",
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": False,
    }
    if not think:
        payload["chat_template_kwargs"] = {"enable_thinking": False}
    elif effort:
        payload["chat_template_kwargs"] = {"reasoning_effort": effort}
    body = json.dumps(payload).encode()
    req = urllib.request.Request(base.rstrip("/") + "/v1/chat/completions", body,
                                 {"Content-Type": "application/json"})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=7200) as r:
        data = json.loads(r.read())
    data["_wall_s"] = round(time.time() - t0, 1)
    return data


def extract_code(text: str) -> str:
    text = text.strip()
    # a model may wrap the app in a markdown fence or a full HTML document; keep the largest JS block
    blocks = re.findall(r"```(?:javascript|js)?\s*(.*?)```", text, re.S | re.I)
    if blocks:
        text = max(blocks, key=len).strip()
    if "<script" in text.lower():
        blocks = re.findall(r"<script[^>]*>(.*?)</script>", text, re.S | re.I)
        if blocks:
            text = max(blocks, key=len).strip()
    if text.lower().startswith("<!doctype") or "<html" in text.lower():
        # last resort: use the last script block, else fail
        blocks = re.findall(r"<script[^>]*>(.*?)</script>", text, re.S | re.I)
        if blocks:
            text = max(blocks, key=len).strip()
    return text.strip() + "\n"


def assemble(app: str, out_dir: Path) -> Path:
    html = read(TEMPLATE)
    html = html.replace("/*__THREE__*/", read(THREE))
    html = html.replace("/*__NAMESPACE__*/", "")
    html = html.replace("/*__ASSETS__*/", read(ASSETS))
    html = html.replace("/*__FRAMEWORK__*/", read(FRAMEWORK))
    html = html.replace("/*__APP__*/", app)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "app.js").write_text(app, encoding="utf-8")
    target = out_dir / "index.html"
    target.write_text(html, encoding="utf-8")
    return target


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prompt", default=str(ROOT / "templates" / "underwater-pod" / "prompt.txt"))
    ap.add_argument("--base", default="http://127.0.0.1:8080")
    ap.add_argument("--out", default=str(ROOT / "designs" / "underwater-pod"))
    ap.add_argument("--max-tokens", type=int, default=12000)
    ap.add_argument("--temperature", type=float, default=0.25)
    ap.add_argument("--no-think", action="store_true", help="send enable_thinking=false")
    ap.add_argument("--effort", choices=["none", "low", "medium", "high"], help="reasoning effort")
    ap.add_argument("--app", help="assemble this JS file instead of calling the model (harness smoke test)")
    a = ap.parse_args()
    if a.app:
        app = read(Path(a.app))
        target = assemble(app, Path(a.out))
        print(f"assembled {a.app} -> {target} ({target.stat().st_size/1024:.0f} KB)")
        return 0
    prompt = read(Path(a.prompt))
    print(f"prompt: {a.prompt} ({len(prompt)} chars); skills: {len(SKILLS)}; max_tokens: {a.max_tokens}")
    data = chat(prompt, a.base, a.max_tokens, a.temperature, not a.no_think, a.effort)
    choice = (data.get("choices") or [{}])[0]
    msg = choice.get("message") or {}
    content = msg.get("content") or ""
    if not content.strip():
        print("empty answer:", json.dumps(data, ensure_ascii=False)[:2000])
        return 1
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "response.txt").write_text(content, encoding="utf-8")
    app = extract_code(content)
    (out / "app.js").write_text(app, encoding="utf-8")
    if "HARNESS.start" not in app:
        print("REJECTED: the answer did not call HARNESS.start; save is in response.txt/app.js")
        return 2
    target = assemble(app, out)
    u = data.get("usage") or {}
    print(f"wall {data['_wall_s']} s; usage {u}; app {len(app)} chars; {target}")
    print(f"html {target.stat().st_size/1024:.0f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
