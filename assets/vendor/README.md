# Vendored Three.js

`three.min.js` is the Three.js **r160** UMD build (MIT), fetched from
`https://unpkg.com/three@0.160.0/build/three.min.js` on 2026-11-16. It is the only copy the design
harness needs and it is assembled inline, so the generated page makes no network request.

Why r160 UMD and not r187:

- r187 no longer ships `three.min.js`, and its `three.module.js` imports `./three.core.js`. Naively
  concatenating the two files duplicates identifiers (`_m1$1` and others); the page dies at parse
  time. A real bundler would fix it, but the harness must stay one file with no build step for the
  generated page.
- The r160 UMD build exposes `window.THREE`, which is exactly what `assets/procedural.js` and
  `assets/framework.js` expect.
- The console warning about `build/three.min.js` being deprecated with r150+ is expected and harmless.
  Do not "fix" it by switching to the r187 split without adding a bundler step.

Keep the licence header in the file. If you update the version, re-run the harness demo and the
visual gate in `skills/visual-review/SKILL.md`; the API used here (`outputColorSpace`, `SRGBColorSpace`,
`InstancedMesh`, `MeshPhysicalMaterial`, `FogExp2`) must still exist.
