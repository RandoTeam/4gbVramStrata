#!/usr/bin/env python3
"""Automated visual/behavioural gate for a generated single-file page.

Drives headless Firefox through geckodriver's WebDriver HTTP API (no selenium,
no playwright, no pip install). It answers the questions a code review cannot:

  * did the page boot, or is it stuck on the splash / showing an error?
  * how many console errors did the scene produce?
  * how many draw calls and triangles does it actually render?
  * how many props were placed and how many failed?
  * can the player walk, and does collision stop them at the console?
  * what does it look like at 1280x800 and at 390x844?

    python3 tools/browser_gate.py designs/underwater-v2/index.html \
        --out designs/underwater-v2 --json designs/underwater-v2/gate.json
"""
from __future__ import annotations

import argparse
import base64
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

GECKO = "http://127.0.0.1:4444"

PROBE = r"""
return (function () {
  var pod = window.__POD || null;
  var scene = window.__SCENE || null;
  var log = window.__LOG || [];
  var boot = document.getElementById('boot');
  var r = pod && pod.renderer ? pod.renderer.info.render : null;
  return {
    ready: !!(pod && pod.ready),
    frames: pod ? pod.frames : 0,
    position: pod ? pod.position : null,
    drawCalls: r ? r.calls : null,
    triangles: r ? r.triangles : null,
    points: r ? r.points : null,
    colliders: pod ? pod.colliderCount : null,
    canvasCount: document.querySelectorAll('canvas').length,
    bootVisible: !!(boot && !boot.classList.contains('gone')),
    bootText: boot ? (boot.textContent || '').slice(0, 160) : '',
    buttons: ['reset', 'pause', 'quality'].map(function (id) {
      var el = document.getElementById(id);
      return el ? { id: id, w: Math.round(el.getBoundingClientRect().width), text: el.textContent } : null;
    }),
    scene: scene ? { chunks: scene.chunks, defaults: scene.defaults, failed: scene.failed.length,
                     recovered: (scene.recovered || []).length,
                     placed: scene.placed.length, meshes: scene.meshes } : null,
    failed: scene ? scene.failed.slice(0, 12) : [],
    errors: log.filter(function (e) { return e.level === 'error'; }).slice(0, 12),
    warns: log.filter(function (e) { return e.level === 'warn'; }).slice(0, 8),
  };
})()
"""

MOVE_PROBE = r"""
return (function () {
  var pod = window.__POD;
  if (!pod) return null;
  pod.setPosition(0, 1.62, 1.9);
  pod.setView(0, 0);
  pod.key('KeyW', true);
  return pod.position;
})()
"""

STOP_PROBE = r"""
return (function () {
  var pod = window.__POD;
  if (!pod) return null;
  pod.key('KeyW', false);
  return pod.position;
})()
"""

RESET_PROBE = r"""
return (function () {
  var pod = window.__POD;
  if (!pod) return null;
  pod.reset();
  pod.setQuality(1);
  pod.pause(true);
  var paused = pod.paused;
  pod.pause(false);
  return { paused: paused, quality: pod.quality, position: pod.position };
})()
"""


class Driver:
    def __init__(self, port: int = 4444, headless: bool = True):
        self.base = "http://127.0.0.1:%d" % port
        self.headless = headless
        self.session = None
        self.proc = None

    # ── transport ────────────────────────────────────────────────────────
    def _req(self, method, path, body=None, timeout=120):
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(self.base + path, data,
                                     {"Content-Type": "application/json"} if data else {})
        req.method = method
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
        return json.loads(raw) if raw else {}

    def ensure(self):
        try:
            self._req("GET", "/status", timeout=3)
            return
        except Exception:
            pass
        self.proc = subprocess.Popen(["geckodriver", "--port", str(4444), "--log", "error"],
                                     stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        for _ in range(60):
            time.sleep(0.25)
            try:
                self._req("GET", "/status", timeout=2)
                return
            except Exception:
                continue
        raise RuntimeError("geckodriver did not start")

    def open(self, url: str):
        self.ensure()
        caps = {"capabilities": {"alwaysMatch": {
            "browserName": "firefox",
            "moz:firefoxOptions": {"args": ["-headless"] if self.headless else []},
            "pageLoadStrategy": "normal",
        }}}
        s = self._req("POST", "/session", caps, timeout=120)
        self.session = s["value"]["sessionId"]
        self._req("POST", "/session/%s/url" % self.session, {"url": url}, timeout=120)
        return self

    def rect(self, w, h):
        self._req("POST", "/session/%s/window/rect" % self.session,
                  {"width": w, "height": h, "x": 0, "y": 0})

    def js(self, script, timeout=120):
        r = self._req("POST", "/session/%s/execute/sync" % self.session,
                      {"script": script, "args": []}, timeout=timeout)
        return r.get("value")

    def wait(self, expr: str, timeout=90.0, interval=0.4):
        end = time.time() + timeout
        last = None
        while time.time() < end:
            try:
                last = self.js("return " + expr)
            except Exception as err:      # page still loading
                last = None
            if last:
                return last
            time.sleep(interval)
        return last

    def shot(self, path: Path):
        r = self._req("GET", "/session/%s/screenshot" % self.session, timeout=120)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(base64.b64decode(r["value"]))
        return str(path)

    def close(self):
        if self.session:
            try:
                self._req("DELETE", "/session/%s" % self.session, timeout=30)
            except Exception:
                pass
            self.session = None


def gate(page: Path, out: Path, json_path: Path | None = None, keep_open: bool = False) -> dict:
    page = Path(page).resolve()
    out = Path(out).resolve()
    d = Driver()
    result = {"page": str(page), "ok": False, "problems": []}
    t0 = time.time()
    try:
        d.open(page.as_uri())
        d.rect(1280, 800)
        time.sleep(1.0)
        d.wait("window.__POD && window.__POD.ready", timeout=120)
        # let a few frames render before the probe
        d.wait("window.__POD && window.__POD.frames > 8", timeout=60)
        time.sleep(0.6)
        probe = d.js(PROBE) or {}
        result["probe"] = probe
        result["bootSeconds"] = round(time.time() - t0, 1)

        # frame rate over a measured window
        f0 = d.js("return window.__POD ? window.__POD.frames : 0") or 0
        time.sleep(2.0)
        f1 = d.js("return window.__POD ? window.__POD.frames : 0") or 0
        result["fps"] = round((f1 - f0) / 2.0, 1)
        result["frames"] = f1

        # walk forward, then try to walk through the console
        before = d.js(MOVE_PROBE)
        time.sleep(1.4)
        after = d.js(STOP_PROBE)
        result["walk"] = {"before": before, "after": after}
        ui = d.js(RESET_PROBE)
        result["ui"] = ui

        d.rect(1280, 800)
        time.sleep(0.7)
        result["desktopShot"] = d.shot(out / "shot-desktop.png")
        d.rect(390, 844)
        time.sleep(0.9)
        result["mobileShot"] = d.shot(out / "shot-mobile.png")
        d.rect(1280, 800)

        # ── verdict ──────────────────────────────────────────────────────
        problems = result["problems"]
        if not probe.get("ready"):
            problems.append("page never became ready (boot splash still up)")
        if probe.get("bootVisible"):
            problems.append("boot splash still visible: " + (probe.get("bootText") or "")[:120])
        if probe.get("canvasCount") != 1:
            problems.append("expected exactly one canvas, found %s" % probe.get("canvasCount"))
        if probe.get("errors"):
            problems.append("%d console error(s): %s" % (len(probe["errors"]), probe["errors"][0].get("msg", "")[:160]))
        if probe.get("drawCalls") and probe["drawCalls"] > 520:
            problems.append("draw calls %s > 520 budget" % probe["drawCalls"])
        if not probe.get("colliders") or probe["colliders"] < 30:
            problems.append("only %s colliders" % probe.get("colliders"))
        scene = probe.get("scene") or {}
        if scene.get("chunks", 0) < 18:
            problems.append("only %s chunks placed" % scene.get("chunks"))
        if scene.get("failed"):
            problems.append("%s chunk(s) failed to build" % scene.get("failed"))
        walk = result.get("walk") or {}
        b, a = walk.get("before"), walk.get("after")
        if not b or not a:
            problems.append("debug API missing: cannot test movement")
        else:
            moved = abs(a[2] - b[2]) + abs(a[0] - b[0])
            result["walkDistance"] = round(moved, 2)
            if moved < 0.25:
                problems.append("player barely moved (%.2f m in 1.4 s)" % moved)
            if a[2] < -2.05:
                problems.append("player walked through the console bank (z=%.2f)" % a[2])
        if result["fps"] and result["fps"] < 5:
            problems.append("renderer is effectively frozen (%.1f fps in software GL)" % result["fps"])
        result["ok"] = not problems
        result["seconds"] = round(time.time() - t0, 1)
    except Exception as err:
        result["problems"].append("gate failed: %s" % err)
        result["exception"] = repr(err)
    finally:
        if not keep_open:
            d.close()
    if json_path:
        Path(json_path).parent.mkdir(parents=True, exist_ok=True)
        Path(json_path).write_text(json.dumps(result, indent=1, ensure_ascii=False), encoding="utf-8")
    return result


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("page")
    ap.add_argument("--out", default=None, help="directory for screenshots (default: page directory)")
    ap.add_argument("--json", default=None)
    ap.add_argument("--keep-open", action="store_true")
    a = ap.parse_args()
    page = Path(a.page).resolve()
    out = Path(a.out).resolve() if a.out else page.parent
    res = gate(page, out, Path(a.json) if a.json else None, a.keep_open)
    print(json.dumps({k: res.get(k) for k in
                      ("ok", "problems", "fps", "drawCalls", "walkDistance", "seconds",
                       "desktopShot", "mobileShot")}, indent=1, ensure_ascii=False))
    probe = res.get("probe") or {}
    if probe:
        print("draw calls:", probe.get("drawCalls"), "triangles:", probe.get("triangles"),
              "colliders:", probe.get("colliders"), "chunks:", (probe.get("scene") or {}).get("chunks"),
              "failed:", (probe.get("scene") or {}).get("failed"))
        print("errors:", probe.get("errors"))
        print("boot:", probe.get("bootText"))
    return 0 if res.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
