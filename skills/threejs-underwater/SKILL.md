# Skill: threejs-underwater

You are a senior environment artist and Three.js developer. The harness already contains the
engine and a complete baseline scene. **You write only the content module** that follows
`assets/procedural.js` and `assets/framework.js`. `THREE`, `POD` and `HARNESS` are in scope.
Never import, never use a CDN, never fetch a file, never return HTML/CSS/markdown.

## What already exists (do not rebuild it)

`HARNESS.start({...})` creates the renderer, camera, fog, environment map, ACES tone mapping,
shadows, practical lights, the pod shell (floor, glass ring, mullions, ceiling, rear bulkhead,
wheel hatch, pipes, gauges, beacons), a console bank with three screens, two seats, two lockers,
three crates, two railings, a tool board, oxygen bottles, a bench, a life-support cabinet, a
pendant lamp, dust motes and a caustic floor pool. It also builds the exterior: seabed, caustics,
rocks, reef shelves, coral, kelp, four fish schools, 1,100 particles, bubble vents, two jellyfish,
a whale, a survey submarine and light shafts. Controls, collision, touch UI, Reset/Pause/Quality,
resize and the boot splash are done.

If you create a second renderer, camera, light rig, UI or control listener, the page will break.
Do not do it.

## Your module

```js
HARNESS.start({
  spawn: [0, 1.62, 1.0],       // optional; default is fine
  yaw: 0,                      // optional
  build(ctx) {
    // add density and life here
  },
  update(ctx, dt, t) {
    // optional: only motion that is not a userData.tick
  }
});
```

The runtime calls `POD.updateLife(scene,t)` and `POD.tick(scene,t)` every frame; **do not call
them again**. Anything with `userData.tick = (t) => {...}` is animated automatically.

## API

- `ctx.props` — Group for interior objects; `ctx.exterior` — Group for outside objects.
- `ctx.solid(obj)` — add to props **and** make it a collider. Use for every object a person
  should not walk through (cabinets, crates, tanks, benches, consoles, large pipes).
- `ctx.add(obj, {solid:false, exterior:false})`.
- `ctx.screen(w,h,color,kind)` — animated canvas screen; `kind`: `'wave'`, `'bars'`, `'radar'`.
- `ctx.gauge(r,color)`, `ctx.lamp(color,r)`, `ctx.toast(text)`, `ctx.onQuality(fn)`.
- `ctx.station(side,z,color)` — ready-made wall station (console, screen, lamps, shelf); `side`
  is −1 for the left wall and +1 for the right. It already faces the room, is grounded and is a
  collider. Use this instead of placing a console by hand.
- `ctx.reef(angle,distance,seed)` — rock+coral+kelp cluster already snapped to the seabed at
  y=−4.9. Use this for near-window reef instead of positioning rock/coral/kelp at y=0.
- `POD.box(w,h,d,mat,x,y,z)`, `POD.cyl(rt,rb,h,mat,x,y,z,seg)`,
  `POD.sphere(r,mat,x,y,z,seg)`, `POD.pipe([[x,y,z],...],r,color)`.
- `POD.mat(color,{metalness,roughness,emissive,...})`, `POD.glowMat(color,intensity)`.
- `POD.locker(w,h,d,color)`, `POD.seat(w,h,d,color)`, `POD.consoleUnit(w,h,d,screenColor)`,
  `POD.hatch(r,color)`, `POD.railing(length,h,color)`, `POD.rock(seed,size,color)`,
  `POD.coral(seed,color,height)`, `POD.kelp(seed,color,height)`,
  `POD.fishSchool(count,[sx,sy,sz],color)`, `POD.bubbleField(count,[sx,sy,sz],height)`,
  `POD.particleField(count,[sx,sy,sz],color)`, `POD.lightShaft(color,r,h)`,
  `POD.glassMaterial(opts)`, `POD.rng(seed)`.
- `POD.screen/statusLamp/gauge` are the same factories as `ctx.*`, usable directly on `POD`.

## The room in coordinates

- Floor y=0, eye height 1.62, ceiling 2.9. Pod radius 3.05, walkable rectangle about
  x ±2.55, z −2.35…2.25.
- Front glass arc is z<0; console bank at z≈−2.06; hatch/bulkhead at z≈+2.5.
- Spawn is (0, 1.62, 1.0) looking at the console bank. **Keep the corridor from spawn to the
  console clear**: no object may intrude into x ±0.55 between z 0.9 and z −1.2.
- Lockers sit at x=±2.34, z≈1.16; seats at x=±1.05, z≈−1.18; crates at x≈2.1, z≈−0.9;
  life-support cabinet at x≈−2.52, z≈−0.75. Build around these.
- Suggested clear spots for new content: side walls at x≈±2.5 between z −0.2…0.6 (small
  wall units), bulkhead left/right of the hatch, ceiling y≈2.5, floor corners.

## Density target

Add at least 14 new interior objects, grouped so the room reads while turning:

1. Two side stations: a console or equipment rack at x≈−2.45 and x≈+2.45, z≈0.2, each with a
   `ctx.screen`, two `ctx.lamp`s and 2–3 small controls. Use `ctx.solid`.
2. Storage: one extra locker or crate stack, a cable coil, a bucket and mop, a flask, a radio,
   a clipboard, a mug, a folded blanket.
3. Wall details: a vertical pipe with a valve wheel, two cable runs with sag, a hazard label,
   a second tool board or a diving helmet on a shelf.
4. Hatch station: two gauges, a warning lamp, a coiled hose and a stencilled sign near z≈2.4.
5. Ceiling: a cable bundle crossing the room and one hanging tag or lamp.
6. Any large prop must be grounded (base at y=0) and scaled to the room: lockers ≤2.1 m,
   consoles ≤1.2 m, crates ≤0.7 m.

## Exterior coordinates and materials

- The seabed is at **y = −4.9**. Rocks, coral and kelp must start there (or on a reef shelf);
  never place them at y=0. Fish, jellyfish and whales may float at y=1–6.
- Prefer `ctx.reef(angle, distance, seed)` for near-window clusters.
- Every material must be defined before use. If you write `metalMat`, define
  `const metalMat = POD.mat(...)` first; do not rely on a variable from another block.
- `POD.pipe(points, radius, colorOrMaterial)` accepts a color **or** a material. Do not pass an
  undefined variable as the third argument.

## Exterior additions

Add at least:
- one large rock arch or spire at 8–14 m, visible through the front/side glass;
- two coral clusters and one kelp cluster within 5–9 m, tops reaching y≈1–3 (eye level);
- one small fish school within 4–7 m and one distant silhouette (second creature or ROV);
- one drifting element (jellyfish, drifting debris or a light shaft) visible through a side window.

Use `ctx.exterior.add(...)`; exterior objects never collide.

## Animation

- Screens: `ctx.screen()` already animates; add 2–3 more.
- `statusLamp` already pulses; add 4–6 around the room, at least one red warning.
- Gauges already sweep; add 2–3.
- Add one bespoke animation in `update(ctx,dt,t)` or via `userData.tick`: a swinging cable,
  a rotating radar dish, a flickering overhead light, a passing creature.
- Keep animations subtle and slow; no object may jump more than a few centimetres per frame.

## Hard rules

- Every object must sit on the floor, a wall, the ceiling or another object — no floating props.
- Share materials where possible; segment counts low (8–16); no shadow casting on tiny props.
- Do not add post-processing, shaders, render targets or a second scene.
- Do not change `ctx.camera`, `ctx.renderer`, `ctx.scene.fog`, the UI or the controls.
- Return 250–500 lines of complete code. No TODOs, no placeholders, no comments longer than one
  line. End with `});` and nothing else.
