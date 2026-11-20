# Harness, tools and skills for the model we have

**What is installed here:** Clover-35B-A3B-Preview APEX-I-NANOPLUS, 12.6 GB, 32K and 64K run
configs. Qwen3.8 was removed after the Linux test; Flint and Ornith are not installed. So this page
is about making **Clover** better, not about another download.

## What Clover already does

- **Agentic/tool use:** BFCL-v4 **67.9**, τ³ Overall **65.3**, τ³ Banking **14.4** (DiffuSpace
  launch data). It is not a weak tool user; the banking score is the weak spot.
- **Coding/reasoning:** SWE-bench Verified 73.6, Terminal-Bench 2.1 51.7, GPQA 83.8, MMLU-Pro 84.8,
  ZebraLogic 95.8.
- **On this laptop:** 32K APEX works at 43.2 tok/s chat / 546 tok/s prefill on engine poly.10 (44.5 / 543 on poly.7,
  measured beside it; the earlier 36.1 did not reproduce); 64K starts with 674
  experts, 634 tok/s prefill on a 57,897-token prompt, 8.2 tok/s decode at depth.
- **Shape:** 40-layer hybrid GDN/full-attention diffusion MoE, 256 experts top-8, 35B/3B, 128K
  context, text only. It has no MTP/draft block.

## What the 2026 harness research says

These are different benchmarks, so do not add the percentages together. The direction is consistent:
the scaffold around a fixed model can move pass rates by tens of points.

| Evidence | What changed | Result |
|---|---|---|
| **SkillsBench** (86 tasks, 11 domains, 7 model configurations, 7,308 trajectories) | Curated agent skills (procedural knowledge, 2-3 focused modules) | **+16.2 pp average pass rate**; +4.5 pp on software engineering, +51.9 pp on healthcare; smaller models with skills can match larger models without them |
| **HarnessX / AEGIS** (15 model-benchmark configurations) | Typed harness primitives evolved from traces, model untouched | **+14.5 pp average, up to +44.0 pp; 14 of 15 configurations improved** |
| **local-harness-bench** (one Qwen3.8-Flash-Next, four coding harnesses, hidden tests + blind review) | Pi vs opencode vs mini-swe-agent vs deepseek-harness | Pi fastest; mini-swe-agent fewest tokens; **opencode highest quality but ~3x tokens**; deepseek-harness 7.5-8.8x tokens for the lowest score; only deepseek-harness tested every numbered requirement |
| **SkillsBench leaderboard, Oct 2026** | DeepSeek V4.1 Flash inside OpenHands with skills | **69.80%**, $0.09/run, 3m43s |
| **LFM2.5 / Ornith** model cards | Post-training inside OpenClaw, Hermes Agent, Pi and OpenCode | The harness is part of the training recipe, not an afterthought |
| **Clover on Kapitsa** (M5 Max, 4-bit, Oct-Nov 2026) | A tuned agent/engine harness around Clover | 304 tok/s decode, 5,981 tok/s prefill at 4K; not this laptop, but proof the scaffold around the same model matters |

**Caveats:** these are mostly self-reported or single-benchmark results; skills help differently by
domain; a harness that is best on one task can be worst on another (see deepseek-harness). Always
measure on your own fixed tasks.

## What to use with Clover here

### Harness

- **opencode** - best quality in the local-harness-bench and the environment this project already
  uses. It costs tokens; at 36 tok/s that matters.
- **mini-swe-agent** - fewest tokens, best fit for a 4 GB laptop when the loop is long.
- **Pi** - fastest; good for short iterations.
- **OpenHands** - the harness behind the DeepSeek Flash SkillsBench result; good for SWE-style tasks.
- **Claude Code / Codex-style clients** - the server already speaks Anthropic and OpenAI; point them
  at `http://127.0.0.1:8080/v1` (or `/v1/messages`).

For this machine, the practical default is **mini-swe-agent for long autonomous work, opencode for
quality-sensitive work, Pi for quick loops**. Do not use a token-hungry harness by default on a 4 GB
card.

### Tools

Keep the tool set small and strict:

- filesystem read/write and search;
- shell with a timeout and a working-directory guard;
- git diff/status/log;
- test runner and a linter;
- web search/fetch for current data;
- a browser/Playwright tool for screenshots, console errors and interaction checks;
- GPU/RAM/VRAM monitor (`nvidia-smi`, `ps`) so the agent sees the 4 GB limit.

Clover's BFCL 67.9 means roughly one tool call in three can be malformed or wrong on a hard
benchmark. Use **strict JSON schemas, one tool per step where possible, validate arguments, retry a
failed call with the error text**, and never let a tool call silently change files outside the task.

### Skills

SkillsBench found **2-3 focused modules** better than one comprehensive document. Start with:

1. **`repo-map`** - what this project is, the engines, where configs/docs/benchmarks live, which
   commands are safe.
2. **`build-test`** - exact commands: `./setup.sh`, `./run-clover-*.sh`, the 32K/64K configs,
   `./bench.sh --long`, `bench/speed/run.py`, `bench/quality/run.py`; what a pass looks like.
3. **`gpu-vram`** - 4 GB card, 31 GB RAM, `handy` can hold ~700 MiB, close it before a run; do not
   change context/quant without measuring.
4. **`bench-method`** - saved prompt, 8 runs, median and range, prefill vs decode, append-only logs.
5. **`web-design-review`** - for the Three.js page: check console errors, collision, touch controls,
   screenshots at 1280x720 and mobile, UI overlap, frame rate.
6. **`model-research`** - use web/HF/model cards, never the model's memory for releases after its
   cutoff; record the source and date.

Do not load all six at once. Load `repo-map` + one task skill; add `bench-method` only when measuring.

### Loop

For coding tasks, force the agent through:

1. **Inspect** the repository and restate the task.
2. **Plan** in 3-6 bullets and name the files to change.
3. **Edit** in small diffs.
4. **Test** (unit, build, browser).
5. **Review** its own diff against the requirements.
6. **Report** what changed, what passed, what is still uncertain.

For the Three.js prompt, add a **visual gate**: run the page in Playwright, capture a screenshot and
the console, then require a second pass if there is any console error, missing control, or object
intersection with the player. A code-only pass is not a pass for a visual task.

### Sampling and context

- Use **32K** for interactive coding; **64K** only for long documents, because decode falls to
  ~8 tok/s at 58K depth.
- Keep tool outputs trimmed; the conversation cache is 8 GB and the context is shared.
- Clover has no thinking switch. Do not ask for hidden chain-of-thought; ask for a short plan,
  the diff, and the test evidence.
- Temperature 0 for code edits and tests; a low non-zero value for design drafts if the same scene
  is generated several times.

## How to measure whether the harness works

Use the same four tasks every time:

1. a small bugfix in this repository with a hidden test;
2. a feature that touches two files and needs a test;
3. the single-file Three.js prompt, judged by screenshots + console + a checklist;
4. a research question that requires two web sources and a citation.

Record: pass/fail, tool-call success rate, tokens in/out, wall time, and the diff. Compare **plain
chat vs harness**, then **harness without skills vs harness with 2-3 skills**. Do not compare
different prompts or different context sizes.

The expected result is not "Clover becomes Qwen3.8"; it is that the same Clover solves more of
*your* tasks because the harness supplies procedure, tools and verification.

## The Three.js design harness (underwater pod test)

### Why a harness is necessary

The reference output (`sklad-test-0285.html`) is 1.8 MB / 6,298 lines and contains a bundled Three.js
r186 plus roughly 2,500 lines of scene code. Clover's first two answers on the bare prompt:

| Run | Output budget | Result | What failed |
| --- | ---: | --- | --- |
| 1 | 12,000 tok | 8,351 chars, stopped mid-code | the model spent the budget and never finished |
| 2 | 24,000 tok | 15,237 chars / 465 lines, complete | boot splash never hidden, NaN geometry, walls invisible from inside, props marked `noCollide`, nearly black spawn view, sparse exterior |

A 35B-A3B model can write a scene, but it should not spend its answer on the renderer, collision,
touch controls, resize, pause/reset/quality and 1,000 lines of boilerplate. The harness owns those.

A third design followed: **the harness also owns the geometry, and the model only names props for
fixed slots**. The reason is the shape of the failure above. One long answer has to keep the whole
room in mind while writing code, so it runs out before the details and the leftovers are floating,
sideways or unlit. Small decisions, made one zone at a time with maximum reasoning, have a much
better failure mode: the worst case is a sensible object in a slightly suboptimal slot.

### The staged loop

    ./run-clover-apex-i-nanoplus.sh                      # server on :8080
    .venv/bin/python tools/build_scene.py --out designs/underwater-v2 --effort xhigh

| Stage | Calls | What it produces |
| --- | ---: | --- |
| plan | 1 | concept, story, four colour palette, four beats, one focus line per zone |
| zones | 5 | slot → asset assignments for `port-side`, `starboard-side`, `bulkhead`, `overhead`, `exterior` |
| compile | 0 | `assets/scene.js` places chunks, collects colliders, dresses, merges |
| gate | 0 | headless Firefox: boot, console, draw calls, colliders, walk test, UI, screenshots |
| report | 0 | `report.md` with per-stage wall time/tokens, every slot, the verdict |

Every model call uses `reasoning_effort: xhigh`; the JSON shapes are short, so the budget goes into
deciding what belongs where instead of into typing. A zone answer that names an unknown slot, an
unknown asset, the wrong mount or an oversized asset is rejected with the exact reason and asked
once more; the slot keeps its default in the meantime, so a failure never leaves a hole.

### Files

- `assets/vendor/three.min.js` — Three.js r160 UMD, one inline script, no module resolution, no 404.
  r187 splits `three.module.js` from `three.core.js`; naive concatenation duplicates identifiers.
  The UMD build is deprecated but works and keeps the page a true single file.
- `assets/procedural.js` — the `POD` primitives: materials and the `cachedMat`/`cachedGlow` cache,
  rocks, coral, kelp, fish (instanced), bubbles, particles, pipes, consoles, lockers, seats, hatches,
  railings, light shafts, glass, animated canvas screens, gauges, status lamps, `sign()`, `halo()`,
  the lighting rig, collision helpers, and `compactWorld()` (one draw call per material).
- `assets/chunks.js` — the composite prop library, 37 chunks. A chunk is a fully detailed, correctly
  oriented prop assembled from the primitives: `locker-double` is a body, two doors, handles, vents,
  stencils, boots and a helmet. This is why one model choice yields 10–40 meshes of detail.
- `assets/scene.js` — the deterministic slot compiler. It reads the spec, checks mounts and sizes,
  places each chunk at the slot's position/facing/scale, collects floor colliders, adds the dressing
  that must not vary (ceiling cable runs, a pipe riser, hazard stripes, a deck stencil), then merges.
- `tools/scene_layout.py` — the authoritative layout: 16 interior slots and 12 water/exterior slots,
  five zones, size budgets, defaults, `fits()` and `validate_assignments()`. `check_defaults()`
  asserts that every slot's own fallback fits its budget; `build_scene.py` refuses to run when one
  does not, because the compiler cannot reject a default (it has to place something) and an
  oversized default silently teaches the model a wrong size. The CLI prints the same check first.
- `assets/chunks.json` — the manifest generated by `bun tools/gen_chunks_json.js`; the pipeline
  and the prompts read it so a prompt can never name an asset the browser does not have.
- `tools/build_scene.py` — the staged driver described above.
- `tools/browser_gate.py` — headless Firefox through geckodriver's WebDriver HTTP API. No
  Playwright, no Selenium, no Chromium: this machine has Firefox, geckodriver and Bun only.
- `tools/look_around.py` — eight fixed viewpoints for a contact sheet (front, port,
  starboard, rear, ceiling, floor, corner, console).
- `assets/framework.js` — the `HARNESS` runtime: renderer, camera, fog, env map, ACES tone mapping,
  shadows, practical lights, the pod shell (floor, glass ring, mullions, ceiling, bulkhead, wheel
  hatch, pipes, beacons, backing panels), the console bank and two seats, the exterior (seabed,
  caustics, rocks, reef, coral, kelp, fish schools, particles, vents, jellyfish, whale, submarine,
  light shafts), controls, collision, UI, boot and the `__POD` debug API.
- `templates/underwater-pod/index.template.html` — HTML/CSS shell, HUD, touch controls, boot
  fallback, `window.__LOG` console capture. Placeholders: `/*__THREE__*/`, `/*__ASSETS__*/`,
  `/*__CHUNKS__*/`, `/*__SCENE__*/`, `/*__FRAMEWORK__*/`, `/*__APP__*/`.

`assets/framework.js` no longer builds lockers, crates, railings, benches, tanks, a tool board, a
life ring, a first-aid box, a support cabinet or a pendant lamp: those are slots now. What it keeps
is the shell, the console bank, the seats and the exterior, because rebuilding those by hand is what
the model failed at.

### Measured on this laptop (browser uses the AMD iGPU, not the RTX 3050)

`framework-demo` at 1213×1025, high quality, before the slot harness existed:

| Change | Draw calls | Render cost |
| --- | ---: | ---: |
| first baseline | 971 | 282 ms/frame |
| remove `transmission` from the glass (it rerenders the scene) | 471 | 74 ms/frame |
| merge coral/kelp/fish, instance fish schools | 253 | 74 ms/frame |

The default slot layout, gate on 2026-11-17 after the framing/ceiling/lighting pass: **289 draw
calls, 88,230 triangles, 141 colliders, 28 chunks, 0 failed, 0 recovered, no console errors, 60 fps
in software GL**, boot 5.1 s measured by the gate (page load, frame sample and two screenshots
included). The v4 model run on the same assets: 290 draw calls, 88,274 triangles, 28 chunks, 0
failed, 0 recovered, 19 of 28 slots different from the defaults, **no asset repeated anywhere in
the station**.

Two rules follow: **never use `MeshPhysicalMaterial.transmission` for full-screen glass on this
laptop**, and keep draw calls near 300 by merging or instancing repeated assets. `compactWorld` is
what makes a 37-chunk library affordable; anything with `userData.tick` or `userData.dynamic` is
re-parented instead of merged so it keeps animating.

### Running it

    ./run-clover-apex-i-nanoplus.sh                      # or serve/server.py --config ... --port 8080

    # deterministic, no model calls: compile the defaults and gate them
    .venv/bin/python tools/build_scene.py --defaults --out designs/underwater-default

    # the real thing
    .venv/bin/python tools/build_scene.py --out designs/underwater-v2 --effort xhigh --max-tokens 9000

    # recompile the spec already in designs/underwater-v4 with the current assets,
    # then gate it: no model call, this is the way to ship an old run on new code
    .venv/bin/python tools/build_scene.py --out designs/underwater-v4 --gate-only

    # only some zones, the rest reused from a previous run
    .venv/bin/python tools/build_scene.py --reuse designs/underwater-v2 --zones exterior

    # what the model chose vs the layout defaults
    python3 tools/slot_diff.py designs/underwater-v4

    # eight fixed viewpoints + a contact sheet
    .venv/bin/python tools/look_around.py designs/underwater-v2/index.html --out designs/underwater-v2/views

    # one gate on its own
    python3 tools/browser_gate.py designs/underwater-v2/index.html --json designs/underwater-v2/gate.json

The gate needs geckodriver on `127.0.0.1:4444`; `browser_gate.py` starts it if it is missing. It
fails on: no boot, a visible splash, not exactly one canvas, any console error, more than 520 draw
calls, fewer than 30 colliders, fewer than 18 chunks, any failed chunk, less than 0.25 m of movement
in 1.4 s, walking through the console bank, or under 5 fps. A slot whose asset does not fit is
**recovered**: the default goes in and the report names it. That is reported separately from a
failed chunk, because one is a wrong model answer, the other is a broken asset.

Debug hooks in the page: `__POD.position`, `__POD.rotation`, `__POD.frames`,
`__POD.colliderCount`, `__POD.key(code,down)`, `__POD.step(dx,dz)`, `__POD.setView(yaw,pitch)`,
`__POD.setPosition(x,y,z)`, `__POD.reset()`, `__POD.pause(bool)`, `__POD.setQuality(0|1|2)`;
`__SCENE` reports `placed / defaults / failed / chunks / meshes`; `__LOG` holds console errors.

### What the harness guarantees, and what the model still owns

Guaranteed by the compiler: every prop is on its mount, faces the room, fits its size budget, has
collision if it is floor-mounted, uses the plan's palette, is merged, and is reported if it fails.
Guaranteed by the gate: the page boots, renders, moves and responds to Reset/Pause/Quality.

Two rules keep the room from repeating itself. Inside one zone the model may not name the same
asset twice; across zones the driver hands each zone a list of **assets already placed elsewhere**
and `validate_assignments(..., taken)` rejects a repeat by name ("console-wall is already placed at
wall-starboard; pick a different asset"). Water zones are exempt: a reef may legitimately hold two
rock clusters in different directions.

The framework also owns the details that raise every run's floor, because a per-run model choice
cannot be trusted with them: the eight framed window bays (thick pilasters, a sill ring with a lip,
bolt lines, gussets), the panelled ceiling (lighter disc, concentric and radial seams, eight dark
ribs with a trim lip, a hub downlight and a halo), the conduit that follows the wall instead of
crossing the room, the hatch beacons, the console bank, and the two oxblood seats. Seat colour is
**fixed** (`0x6b3138`), not palette-driven: using the plan's secondary colour produced pink and
green furniture across runs.

The HUD adds a station readout (DEPTH / PRESS / HDG / TRIM) that reads the camera each frame,
throttled to ~8 Hz. It is DOM, not scene geometry: it costs no draw calls and no GPU time.

Three rendering rules came out of looking at the shots, not from the code:

- **A near-black hull colour turns every prop into a silhouette.** The v4 plan chose `#141e28`;
  lockers and racks rendered as black holes against a lit room. `floorHex()` in `assets/scene.js`
  lifts the hull toward a slate until its relative luminance reaches 0.05, stopping at 75 % so the
  plan's dark mood survives. `#2f4249` (the default) is already above the floor.
- **Metals at full environment intensity clip to white.** Trim bands became light bars. `POD.mat()`
  now gives anything with metalness >= 0.45 an `envMapIntensity` of 0.5; dielectrics keep the map.
- **A horizontal pipe at ceiling height reads as a bar through the glass.** Conduit and cables
  follow the wall or drop down a window bay; nothing crosses the dome. Particles also get a round
  soft sprite, because a square dust mote 1 m from the camera looks like a floating white cube.

The model still owns the part that is actually a design decision: which object belongs in which
place, the palette, the story the room tells, and how the exterior is layered by direction. That is
the whole job, and it is the part a 35B model can do well in 40 tokens per slot.

### Compliance is part of the harness

The first Clover run with the framework in the system prompt and skills still ignored it: the model
wrote its own `WebGLRenderer`, scene, camera, lights and controls, appended a second canvas, and
then died on `document.getElementById('loading')` (an element from its pretraining, not the shell).
The page showed the boot error instead of a scene.

The fix is not a longer explanation. It is a short, explicit **contract at the end of the user
message** (recency wins) plus a hard reject in the tool. The slot harness takes that further: the
model's answer is *only* JSON, so the free-form failure has no way to happen. A slot that names an
asset the room cannot hold is rejected by name, and the default stays.

Do not assemble a rejected zone as if it were accepted: report it. A silently missing wall is worse
than a default wall.

### Status against the reference (2026-11-17)

The reference (`sklad-test-0285.html`) is still the better-looking page, and it should be said
plainly. What the harness now matches: a framed, riveted shell with a working-looking hatch, a
layered room with a console bank, seats that read as seats, a ceiling that is a surface rather than
a void, HUD readouts, and 60 fps with no console errors. What it does not match: the reference has
bloom, a stronger warm/cool split and a cinematic grade; its instrument panels are denser than 28
chunks can make them; and its exterior has more species and animation than twelve water slots give.
Those are the next levers, in that order, and each needs a measurement before it ships.

### What still separates this from the 1.8 MB reference

- **Interior density.** 28 chunks is a full room, but the reference has more layered wall panels,
  cable bundles and small stories. The next lever is more chunks per zone, not a longer answer.
- **Exterior composition.** The baseline has depth layers; the reference has more species and
  animation cycles. The exterior zone now has 12 slots and 12 water chunks, which is the first time
  the model can compose every direction instead of only the front glass.
- **Bloom/grade.** The reference's neon screens read better because of post-processing. The harness
  uses additive halos and a CSS vignette; a small bloom pass must be measured, because the iGPU
  cannot afford a naive full-res one.
- **Quality gate.** Speed only ships with the 22-prompt gate; a generated scene must also pass the
  visual checklist in `skills/visual-review/SKILL.md`. A clean console and a screenshot are the
  minimum, not the whole gate.
