# AGENTS.md — how to work in this repository

**`RandoTeam/4gbVramStrata`**, public, a fork of [Strata](https://github.com/Niko1221/Strata). It runs large
mixture-of-experts models on a 4 GB laptop. The engine is [PolyStrata](https://github.com/VecSzn/PolyStrata)'s
`v0.1.45-poly.10`, built for CUDA 13 (`sm_75`–`sm_120`). The plan is `.local/ROADMAP.md` (git-ignored, never published);
this file is the contract.

## The machine, and the two models this fork is about

**This repository is the Linux fork** (Ubuntu 26.04, CUDA 13.3, driver 595), on the same laptop that produced the
Windows numbers below: RTX 3050 Laptop 4 GB (`sm_86`), Ryzen 5 5500U (6 cores, 12 threads), 30 GB usable RAM. Every
command in this file is the Linux one. The public [RandoTeam/4gbVramStrata](https://github.com/RandoTeam/4gbVramStrata)
keeps the Windows launchers and the prebuilt Windows engine; do not add `.bat` entry points here.

| Model | File | Chat, tokens/s | Reads the prompt | What setup writes |
| --- | ---: | ---: | ---: | --- |
| Clover-35B-A3B-Preview APEX-I-NANOPLUS | 12.6 GB | **38.1** Windows / **43.2** Linux | 449 Windows / 546 Linux tokens/s | `--tail-skip 6 --no-graphs`, `--kv q8_0` on cards of 6 GB or less |
| Gemma 4 26B-A4B QAT-UD-Q4_K_XL | 14.7 GB | **39.0** Linux | 524 tokens/s | `--max-context 32768 --draft-model`, no `--no-graphs` |
| Flint 40B-A2.5B UD-Q3_K_XL | 17.2 GB | **21.9** Windows | 331 tokens/s | `--prompt-batch 512 --expert-swaps 32 --no-graphs` |

Windows numbers measured 2026-11-03 on the saved prompt `bench/speed/prompt.txt` (about 1,900 tokens, a question at the
end), 8 runs, quiet machine, engine `a37654f5f940047f…`. The Linux Clover row is the same task on 2026-11-20 with the
poly.10 engine (`cf0e29415ce7b486…`), 8 runs; the poly.7 binary beside it (`285f20e579b6bc19…`) wrote 44.5 over 11
runs, so the 36.1 of 2026-11-12 is marked not reproduced beside it in `docs/BENCH-4GB.md`; the full 32K suite is
`bench/results/`. The marginal cost of a token is 32.9 ms (Clover) and 46.2 ms (Flint) — that is what a long answer
pays.

**A 32K context is not a 32K prompt.** The headline chat row uses a ~1,900-token prompt with the context set to 32768;
the depth test is `./bench.sh --long`, which reads ~32,000 tokens and answers 24. Never call the first one a 32K test.

**`docs/BENCH-4GB.md` is the only page where this fork's speed numbers live.** Numbers on other hardware (RTX 5090, an
8 GB laptop, AMD, Intel, Mac) are inherited from the donors: useful for how the engine works, not evidence for this
laptop.

## Run it, the way a user does

    .venv/bin/python serve/server.py --engine strata --config strata-clover-apex-i-nanoplus.json --port 8080
    # or: ./run-clover-apex-i-nanoplus.sh
    # then http://127.0.0.1:8080/ ; Ctrl+C (or SIGTERM) stops the engine

`run-clover.sh` and `run-flint.sh` are local conveniences for the same command and are git-ignored, as are the
`strata-*.json` run configs: a fresh clone gets its config from setup, not from git. Start one model at a time — both
use port 8080 and the same card. On Linux the engine is this server's child; `./setup.sh` and the run script stop it
with the server. If a run is killed with `SIGKILL`, remove the orphan engine (`pkill -f engine-fourgbvram/strata-fourgbvram`)
before the next start.

Every reply appends one line to `strata-<model>.log`: prompt tokens read, at what speed, answer tokens written, at what
speed, and how many draft guesses were kept. Over the API, a small `max_tokens` is spent on the reasoning block before
the visible answer starts: use 2000 and up.

## Measure it — the only accepted way

    .venv/bin/python bench/speed/run.py --config strata-clover-apex-i-nanoplus.json --model clover --task chat --runs 8
    ./bench.sh --long --runs 3                                  # the full suite: 4K, 16K and a 32,000-token prompt
    .venv/bin/python bench/quality/run.py --model local --repeat 2   # the 22-prompt gate; server already running

- **`chat` is a request through the server; `raw` is the engine continuing the text.** Different tasks, different
  speeds. Never mix them into one number, and never publish `raw` as the answer speed.
- A comparison is **interleaved, in one session, on the binary that ships, with the expert profile fixed**.
- **Never measure while a build or another heavy job runs.** The same gate read 27.5 tokens/s quiet and 15.9 during a
  CUDA build; that mistake cost a day and a false regression report.
- **Never delete or truncate a log.** `bench/speed/runs.log` is append-only; the server logs are evidence.
- Every number names its prompt, binary, settings, number of runs and task. A number that did not reproduce is marked
  "not reproduced" beside the number that replaced it, never quietly rewritten.

## Build, test, release

    ./setup.sh                                # normal engine: builds strata-fourgbvram for this card with CUDA
    ./tools/build_131k.sh                     # dev engine: CUDA, sm_86 (detected), into build-131k
    ninja -C build-131k strata-fourgbvram     # incremental, with .venv/bin/ninja
    .venv/bin/python tools/make_fourgbvram_release.py OUT_DIR   # portable engine; needs a clean tree
    .venv/bin/python -m unittest discover -s tools -p "test_setup_*.py"   # 741 tests, no GPU and no downloads
    .venv/bin/python tools/brand_names.py --check
    .venv/bin/python tools/package_release_131k.py     # the Linux tarball; --check verifies the allowlist

The release notes' table moves with `docs/BENCH-4GB.md`, and the tarball is rebuilt from the commit that changed a number.

## Speed only ships with quality

A speed change goes out only with the 22-prompt gate (`bench/quality/`): arithmetic, logic, code that must run, a
three-call tool loop, Russian/German/Spanish, instruction-following, and three facts across about 18K tokens. Current:
**Clover 22/22, Flint 21/22** — the one failure is the Russian instruction, which is unstable in Flint itself (four
different behaviours across four runs, recorded in `docs/QUALITY-4GB.md`). **Gemma 4 QAT-UD-Q4_K_XL 21/22** on
2026-11-20: the one failure is `tool_loop`, where it folds `read_file` into `grep` and returns two calls instead of
the three the prompt asks for.

## The work, in order

1. **Lendable prompt scratch.** The batch scratch is 429 MiB at `--prompt-batch 1024` and 88 MiB at 64; lending it to
   the expert cache between requests is the measured prize: +13% decode at a short context. Engine change, no quality
   loss, and the biggest single lever left.
2. **Per-layer overhead.** 32.9 ms for 40 layers is about 0.8 ms a layer, far more than the maths costs. Profile before
   optimizing; CUDA graphs were tried and were slower here.
3. **Flint.** No 8-bit KV path and no flash-attention / tensor-core decode kernels (Clover has both), and its expert hit
   rate is 19% against Clover's 29%. That is where its 46 ms per token goes.
4. **Qwen3.8-Flash-Next Q2_0** only after these two are where they should be.

## Design harness (auxiliary, not the engine)

`tools/build_scene.py` generates the single-file Three.js underwater pod used as the design test:
plan → five zone calls that fill named slots with JSON → deterministic compile → headless-Firefox
gate. The model writes no HTML, CSS or JS; `tools/scene_layout.py` owns the slot geometry,
`assets/chunks.js` owns the 37 props, `assets/scene.js` compiles them. `designs/` is git-ignored.
None of this changes the engine, the configs or the numbers above.

## Donors

`VecSzn/PolyStrata` (`upstream`) is the line the engine comes from; `Niko1221/Strata` (`strata-upstream`) moves faster
and is the lab where ideas appear first; `jesdga95/basalt` is method only (Blackwell NVFP4, cannot build for `sm_86`).
At the start of a session run `gh release list` for each, take **mechanisms rather than numbers**, and never present a
donor's platform win (Linux, several cards, Blackwell, 128 GB) as ours. A candidate goes into `.local/ROADMAP.md` as
one line — mechanism, expected effect, how it would be measured — before any code is written.

## Do not

- Do not port Strata 0.2.x (multi-GPU, Mac) or add DFlash2 on 4 GB: 0.7 GB of drafter is about 660 expert slots.
- Do not quote inherited pages (`docs/DETAILS.md`, `docs/BACKENDS.md`, `docs/AMD_HIP.md`, `docs/INTEL.md`, …) as
  evidence for this laptop; their numbers were measured on a 5090, an 8 GB laptop, AMD, Intel or Mac.
- Do not call a change an improvement without the gate and a saved-prompt measurement.
- Do not edit a published number in place — mark it as not reproduced and put the new one beside it.
