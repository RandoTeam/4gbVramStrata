# Design harness assets

These files are the runtime that `tools/build_scene.py` inlines into a single HTML file. They are
not loaded by the model at run time; they are assembled before the page is written.

- `procedural.js` — the `POD` primitive pack. Pure code: materials and the shared material cache,
  rocks, coral, kelp, instanced fish, bubbles, particles, pipes, consoles, lockers, seats, hatches,
  railings, light shafts, glass, animated canvas screens, gauges, status lamps, stencilled signs,
  additive halos, the lighting rig, collision helpers and `compactWorld()`. No GLTF, no external
  textures, no network.
- `chunks.js` — the composite prop library (`CHUNKS`). 37 authored props on a small kit; each
  chunk declares its mount point, size budget and description, and the Python side reads the same
  data from `chunks.json`.
- `scene.js` — the deterministic slot compiler (`SCENE.build`). Places each chosen chunk at its
  slot, checks mount and size, collects floor colliders, adds fixed dressing and merges the result.
- `framework.js` — the `HARNESS` runtime and baseline scene. Renderer, camera, fog, environment
  map, pod shell, console bank, exterior world, first-person controls, touch UI, collision,
  pause/reset/quality, boot sequence and the `window.__POD` debug API.
- `vendor/three.min.js` — Three.js r160 UMD, MIT. See `vendor/README.md` for why this build and
  why it must not be replaced with the r187 split without a bundler.

`chunks.json` is generated, never hand-edited:

    bun tools/gen_chunks_json.js > assets/chunks.json

`templates/underwater-pod/` contains the HTML shell, the benchmark prompt and a hand-written
`demo.app.js` used as a harness smoke test:

    .venv/bin/python tools/design_harness.py --app templates/underwater-pod/demo.app.js \
        --out designs/framework-demo

`tools/design_harness.py` is the old single-shot harness: it asks the model for a free-form
`HARNESS.start({...})` module. It is kept for the smoke test and as the fallback path, but the
normal route is the staged slot harness:

    .venv/bin/python tools/build_scene.py --defaults --out designs/underwater-default
    .venv/bin/python tools/build_scene.py --out designs/underwater-v2 --effort xhigh
