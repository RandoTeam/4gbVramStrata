# Skill: visual-review

`tools/build_scene.py` assembles one `index.html` from the plan, the zone answers and the compiler,
then runs `tools/browser_gate.py`. Do not consider a scene done until this gate passes. Never fix a
generated page by editing `designs/*/index.html` — fix the slot, the chunk or the framework and
rebuild, or the next run reintroduces the bug.

## Hard failures

- Any uncaught JavaScript error, shader error or `NaN` bounding-sphere warning.
- A black/empty view, a page stuck on the splash, or an object at the camera.
- The spawn view is a wall, a blank panel or a flat row of screens with no depth.
- No visible exterior through at least two window directions.
- A solid object without a collider, or a collider that blocks the walking loop.
- Reset/Pause/Quality missing or non-functional.
- The page is unusable at 390×844 or 1280×720.

## Visual gate

Turn a full 360° from the spawn and inspect:

1. **Composition.** The spawn view has a focal point: the console bank with animated screens,
   a warm pendant above it, and layered water beyond. Left and right windows show different
   foreground/midground/background content. The hatch side reads as a hatch, not a blank wall.
2. **Density.** At least 8 interior objects are identifiable: consoles, seats, lockers, crates,
   pipes, cables, gauges, warning lights, railings, hatch, tool board, tanks, bench, small props.
   At least 14 if the brief asks for a dense room.
3. **Scale.** Eye height 1.62; consoles at waist/chest; hatch near 2 m; lockers ≤2.1 m; no chair
   taller than the player; no mug the size of a bucket.
4. **Light.** No blown-out ceiling or white screen glare. Warm practical over the console, cool
   fill from the water, readable floor, visible shadows under seats and crates. Screens and lamps
   are the brightest accents, not the whole room.
5. **Water.** Fog, light shafts, caustics on the floor, drifting particles, bubbles. Coral/kelp
   tops reach the window band (y≈0.8–2.6), not only the seabed out of sight.
6. **Life.** Screens animate, at least one lamp pulses, at least one plant/fish/creature moves,
   one bespoke animation (swing, radar, flicker).
7. **UI.** Compact top-right Reset/Pause/Quality; touch joystick bottom-left and look pad
   bottom-right; nothing covers the centre or the hatch.

## Technical gate

- One renderer, one camera, one animation loop.
- `colliderCount` should be roughly 60–200; if it is 400+, a decorative group was passed to
  `ctx.solid` and must be split.
- Draw calls: keep the interior under ~250 meshes. Share materials, use low segment counts,
  avoid per-frame geometry creation.
- Pause keeps rendering; Reset returns the camera and clears input; Quality changes pixel ratio.
- No network requests, no external fonts/images/audio, no `alert`/`prompt`.
- Console is clean apart from the Three.js UMD deprecation warning, which the harness accepts.

## Review loop

1. Open the page; read the console; screenshot the spawn view.
2. `__POD.setView(Math.PI,0)`, `±Math.PI/2`, screenshot each; look for empty walls, floating props
   and intersections.
3. Walk to the console and the hatch with `__POD.key`; check collision and that the camera never
   clips through glass.
4. Change to a 390×844 viewport; check the joystick/look pad, safe areas and the HUD.
5. Pause, reset, cycle quality; check each changes state.
6. If a check fails, decide which layer owns it: the model's choice (re-ask one zone with
   `--zones <id>`), the layout (a slot position or size in `tools/scene_layout.py`), a chunk
   (`assets/chunks.js`) or the shell (`assets/framework.js`). Fix that layer, rebuild, and re-gate.
   Never hand-edit the generated HTML.
