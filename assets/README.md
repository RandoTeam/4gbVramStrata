# Design harness assets

These files are the runtime that `tools/design_harness.py` inlines into a single HTML file. They
are not loaded by the model at run time; they are assembled before the page is written.

- `procedural.js` — the `POD` asset pack. Pure code: materials, rocks, coral, kelp, instanced fish,
  bubbles, particles, pipes, consoles, lockers, seats, hatches, railings, light shafts, glass,
  animated canvas screens, gauges, status lamps, the lighting rig and collision helpers. No GLTF,
  no external textures, no network.
- `framework.js` — the `HARNESS` runtime and baseline scene. Renderer, camera, fog, environment
  map, pod shell, exterior world, first-person controls, touch UI, collision, pause/reset/quality,
  boot sequence and the `window.__POD` debug API. The model only writes a `HARNESS.start({...})`
  content module.
- `vendor/three.min.js` — Three.js r160 UMD, MIT. See `vendor/README.md` for why this build and
  why it must not be replaced with the r187 split without a bundler.

`templates/underwater-pod/` contains the HTML shell, the benchmark prompt and a hand-written
`demo.app.js` used as a harness smoke test:

    .venv/bin/python tools/design_harness.py --app templates/underwater-pod/demo.app.js \
        --out designs/framework-demo
