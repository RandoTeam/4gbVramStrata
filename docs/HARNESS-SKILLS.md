# Harness, tools and skills for the model we have

**What is installed here:** Clover-35B-A3B-Preview APEX-I-NANOPLUS, 12.6 GB, 32K and 64K run
configs. Qwen3.8 was removed after the Linux test; Flint and Ornith are not installed. So this page
is about making **Clover** better, not about another download.

## What Clover already does

- **Agentic/tool use:** BFCL-v4 **67.9**, τ³ Overall **65.3**, τ³ Banking **14.4** (DiffuSpace
  launch data). It is not a weak tool user; the banking score is the weak spot.
- **Coding/reasoning:** SWE-bench Verified 73.6, Terminal-Bench 2.1 51.7, GPQA 83.8, MMLU-Pro 84.8,
  ZebraLogic 95.8.
- **On this laptop:** 32K APEX works at 36.1 tok/s chat / 543 tok/s prefill; 64K starts with 674
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
