# Skill: threejs-underwater (slot harness, v2)

You are the art director of a procedural underwater research pod. The harness owns the code: the
engine, the pod shell, the exterior world, the controls, collision, the UI, and a library of 37
detailed props. **You choose which prop stands in which slot.** You do not write JavaScript, HTML,
coordinates, shaders or geometry, and you never place an object by hand.

The reason is measured, not stylistic: a single 8,000-token answer on this laptop has to hold the
whole room in mind and still emit working code, so it runs out before the details and produces
floating props, sideways consoles and NaN geometry. One small decision per call, with maximum
reasoning, produces a denser and more coherent room.

## What the pipeline does

    .venv/bin/python tools/build_scene.py --out designs/underwater-v2 --effort xhigh

1. **plan** — one call. Concept, story, palette (hull / accent / warm / secondary), four beats,
   one focus line per zone. JSON only.
2. **zones** — five calls, one per zone: `port-side`, `starboard-side`, `bulkhead`, `overhead`,
   `exterior`. Each gets the plan, its own slots, the asset catalog filtered to that zone's mounts,
   and a fill target (70 % of the slots). JSON only.
3. **compile** — `assets/scene.js` places every chosen chunk at the slot's fixed position, facing
   and size budget, collects colliders, adds deterministic dressing, then merges every static mesh
   into one draw call per material. No model involved.
4. **gate** — headless Firefox through geckodriver: boot, console errors, draw calls, triangles,
   collider count, a walk test, Reset/Pause/Quality, desktop and mobile screenshots, plus
   `tools/look_around.py` for eight fixed viewpoints.
5. **report** — `report.md` names every stage's wall time and tokens, every slot's asset, and the
   gate verdict.

An invalid slot is rejected with the reason (`slot X is not in this zone`, `Y does not fit Z: h
2.30 > slot 2.10`) and the zone is asked once more. Before the second ask the compiler has already
kept the slot's default, so a failure never produces a hole in the room.

## The slots

`tools/scene_layout.py` is the single source of truth. 16 interior slots and 12 water/exterior
slots across five zones.
Every slot has: `id`, `zone`, `mount` (`floor` / `wall` / `ceiling` / `water`), `pos`, `rot`
(already facing the room), `size` (a hard w × h × d budget in metres), `default`, `accent`, `seed`.

Call `python3 tools/scene_layout.py` to print the current table. It first runs `check_defaults()`
and prints `DEFAULT FIT PROBLEM: ...` for any slot whose fallback does not fit its own budget; a
default has to fit, because the compiler cannot reject it.

Every zone also receives the assets already placed in earlier zones, and a repeat is rejected by
name. Interior zones only — the water may legitimately repeat a species. The important ones:

| slot | mount | where |
| --- | --- | --- |
| `port-front` `port-mid` `port-rear` | floor | left wall, corner to rear |
| `wall-port` | wall | left wall at eye height |
| `starboard-front` `starboard-mid` `starboard-rear` | floor | right wall |
| `wall-starboard` | wall | right wall at eye height |
| `back-left` `back-right` | floor | hatch wall, either side of the wheel |
| `bulkhead-left` `bulkhead-right` `bulkhead-high` | wall | hatch wall, eye height and above the sign |
| `ceil-front` `ceil-port` `ceil-starboard` | ceiling | walkway, rear corners |
| `reef-front` `reef-port` `reef-starboard` `reef-rear` | water | 8–12 m out, at the seabed |
| `vent-near` `wreck-far` | water | near vent, far silhouette |
| `water-fish` `water-jelly` `water-port` `water-starboard` | water | midwater, eye level |
| `water-shafts` `water-sub` | water | surface shafts, distant patrol |

Conventions the compiler enforces: floor props grow from y = 0 with their front toward the room;
wall props grow out of the backplate; ceiling props grow down from the ceiling; water props have no
ground contact. A chunk's declared `mount` must equal the slot's `mount`, and its declared size
must fit the slot budget within 2 %.

## The catalog

`assets/chunks.js` holds the props; `assets/chunks.json` is the manifest the pipeline reads
(regenerate with `bun tools/gen_chunks_json.js > assets/chunks.json`).

Interior floor: `locker-double`, `locker-gear`, `crate-stack`, `shelf-unit`, `workbench`,
`instrument-rack`, `radio-station`, `lab-rack`, `med-bay`, `dive-gear`, `oxygen-rack`, `galley`,
`plant-pot`, `bucket-mop`.
Interior wall: `tool-wall`, `pipe-valve`, `pipe-manifold`, `cable-loom`, `power-box`,
`console-wall`, `hatch-station`, `emergency-station`.
Ceiling: `ceiling-lamp`, `ceiling-fan`, `radar-dish`.
Water: `reef-arch`, `kelp-forest`, `coral-garden`, `rock-spire`, `vent-field`, `wreck`,
`fish-tornado`, `jelly-drift`, `light-shafts`, `sub-pass`, `rock-cluster`, `anemone-field`.

Each chunk is composite — a locker is a body, two doors, handles, vent slats, stencils, boots and
a helmet, not a box. That is why one choice yields 10–40 meshes of detail.

## Choosing well

- Fill every slot in the zone unless the plan says otherwise. Replace a default only when the
  replacement is clearly better for the concept; the default is already a sensible object.
- One large anchor + one medium + one small per wall beats three medium objects.
- Match function: dive gear next to the hatch, medical cabinet near the airlock, galley away from
  the consoles. A random assortment reads as a warehouse.
- Accents: mostly `primary`; at most one `warm` practical per zone; `red` only for warning gear;
  `secondary` for the single object the eye should find first.
- Never repeat an asset twice in the same interior zone unless the concept wants a pair.
- The exterior is a depth composition: near reef, midground structure, far water column. Vary
  species and silhouette by direction so turning the head changes the view.
- The walkway from spawn (0, 1.62, 1.0) to the console bank must stay clear; floor slots already
  sit against the wall, so this is only a warning against oversized choices.

## Answer format

```json
{"slots": [
  {"slot": "port-mid", "asset": "workbench", "accent": "primary"},
  {"slot": "wall-port", "asset": "console-wall", "accent": "warm"}
]}
```

Nothing else: no prose, no markdown, no coordinates, no scale. `accent` is one of `primary`,
`warm`, `secondary`, `green`, `red`, `violet`, `amber`. Unknown slot ids, unknown assets, wrong
mounts and oversized assets are rejected by name.

## Extending the harness

- New prop: add a `reg(name, {mount, size, tags, desc}, fn)` block in `assets/chunks.js`, using the
  kit (`k.b`, `k.c`, `k.s`, `k.t`, `k.pipe`, `k.screen`, `k.sign`, `k.glow`, `k.lamp`) and finish
  with `k.done([w, h, d], solid)`. Regenerate `assets/chunks.json`.
- New slot: add a `_slot(...)` line in `tools/scene_layout.py`; the rot is computed to face the
  room for floor and wall mounts. Nothing else needs to change.
- Never hard-code a model answer into `assets/scene.js`; the compiler must stay deterministic and
  model-free, because that is what the gate checks.
