# Models: what runs on 4 GB, what waits, and what a new architecture costs

The inventory behind the README's model table. Every "measured" line points at the run that proves it; everything else
is an estimate from the installer's own numbers and says so.

## Why there is so much left to do

Twelve families ship in `setup.py`, and **this fork has measured three of them**: Clover APEX-I-NANOPLUS, Gemma 4
QAT-UD-Q4_K_XL and Flint UD-Q3_K_XL (the last on Windows, before poly.10). The rest are the donor's list, and what this
fork knows about them is what `setup.py` estimates — which has already been wrong once in the optimistic direction
(Gemma 4: "does not fit", 4.1 GB, and it runs at 32K).

The order below is not alphabetical and not the README's: it is **what teaches the most per hour of this card's time**.

## The list, with what is actually known

| Family | Size here | What this fork knows | Next step |
| --- | --- | --- | --- |
| **Clover APEX-I-NANOPLUS** | 12.6 GB | **Measured.** 43.2 tok/s, 546 tok/s read, 32K, 22/22 gate, 64K starts | keep as the reference |
| **Gemma 4 QAT-UD-Q4_K_XL** | 14.7 GB | **Measured.** 39.0 tok/s, 524 tok/s read, 32K, 21/22 gate; 64K fails | the vision encoder (untested) |
| **Flint UD-Q3_K_XL** | 17.2 GB | Measured on **Windows, before poly.10**: 21.9 tok/s | re-measure on Linux poly.10, then `--kv q8_0` (poly.8 added it, never tried here) |
| **Ornith 1.5 APEX-I-MINI / -COMPACT / -QUALITY** | 14.4 / 17.4 / 23.7 GB | **Nothing.** `qwen35moe`, the architecture Clover proves; `--kv q8_0` applies | **highest value**: three sizes of a proven architecture, and a draft block in the file |
| **LFM2.5-24B-A2B** | 10.9 GB | Nothing. The installer says "starts with a small expert cache" | cheap: the smallest file of the twelve |
| **MiniCPM-V 4.7 35B-A3B** | 16 GB | Nothing. Installer says it should start; reads pictures | after Ornith |
| **Qwen3.6-35B-A3B** | 13 GB | Nothing. Installer says 4.2 GB before any expert, i.e. no | worth one start attempt: it is Clover's and Ornith's base architecture |
| **Tiel Coder 35B-A3B** | 14 GB | Nothing. Installer says 4.4 GB, i.e. no | same: `qwen35moe`, one attempt |
| **Kolibri 1** | 29 GB | Nothing. 78B, 4.1 GB before any expert | unlikely; low priority |
| **Ornith 1.5 122B** | 82.6 GB | Nothing. A community run exists on an RX 7900 XTX at 128K (6,213 of 12,544 experts in VRAM) | not on 4 GB |
| **Qwen3.8-Flash-Next** | 58 GB | Nothing. Runs on the **second engine** (`strata`, 12 GB+) | out of scope for this card |
| **GLM 5.3 Flash / DeepSeek V4 Flash** | 79 / 91 GB | Nothing. Need a 32 GB card | out of scope |

**The rule from `docs/RELEASE.md` applied to models:** a row says "measured" only with a run behind it, and "should
start" is an estimate from `setup.py`, never a claim. A model whose start attempt failed gets the exact line, as Gemma's
64K did.

## GPT-OSS: the one this fork would add itself

Your idea, and the numbers say it is a real one, so here is what it would take rather than a yes:

**What the file itself says** (read from `ggml-org/gpt-oss-20b-GGUF`'s own header on 2026-11-21, not from a blog):

| | gpt-oss-20b |
| --- | ---: |
| architecture | `gpt-oss` (llama.cpp: `LLM_ARCH_OPENAI_MOE`), **not** in this engine's dispatch |
| layers / experts / used | 24 / 32 per layer / **4** |
| dense weights, head included | **1.79 GiB** |
| routed experts | 9.48 GiB (11.27 GiB total for the MXFP4 file) |
| attention | 8 KV heads, 64-wide, **sliding window 128** |
| KV per token | 48 KiB — **1.5 GiB at 32K**, 384 MiB at 8K |
| expert profile | 4 of 32 used: **96 expert slots a token** (24 layers × 4) |
| context trained | 131,072 (YaRN ×32 from 4,096) |

**The arithmetic for 4 GB:** 1.79 (dense) + 1.5 (KV at 32K) = 3.29 of 3.68 usable GiB, leaving **0.39 GiB for
experts** — 43% of Clover's 0.9 GiB at 32K and a quarter of Gemma's 1.55 GiB. At 8K it is 2.17 GiB and **1.52 GiB for
experts**, which is Gemma's territory at a shorter context. So:

- **gpt-oss-20b at 8K: plausible**, and a fair comparison against Gemma 4 at 32K would be a different claim.
- **gpt-oss-20b at 32K: starts with almost no expert cache** — the situation `setup.py` calls "a small expert cache",
  which is where this card is slowest.
- **gpt-oss-120b: no.** 63 GB in MXFP4; its dense part alone will not fit.

**What adding the architecture costs**, measured from the tree rather than guessed: an architecture is a
`load_geometry()` + `load_layer()` pair plus the attention and FFN kernels it needs — `lfm2moe.cpp` is 430 lines,
`qwen35.cpp` 746, `gemma4.cpp` 961. It also touches `src/fourgbvram/engine.cpp:1700` (one dispatch line), the
arch→code map in `setup.py` (`FOURGBVRAM_GGUF_ARCHS`), and its own tests. And it needs `--kv int8`-class handling if
its sliding window is to be exploited the way Gemma's is.

**What decides whether it is worth it** — in this order, each step cheap:
1. Does the engine's `Moe`/FFN machinery already cover a 32-expert, 4-used router (`shared` vs `mixed` layers)? If the
   layer is a `qwen35moe`-shaped mixture, the port may be small; if it has OpenAI's own per-head structures, it is a
   real job.
2. Does the sliding window of 128 make its KV cheaper than the 48 KiB/token suggests at depth? Gemma's 1,024-row
   window is why it fits at 32K at all; 128 rows would be far cheaper, which changes the arithmetic above in the
   model's favour.
3. Therefore: **read `gpt-oss`'s tensor names and its llama.cpp graph before writing any code**, the way this fork read
   Gemma's header before downloading it. That is the next step, and it costs an hour, not a week.

## What is not on this page

- Vision encoders: Gemma's (`mmproj`, 1.19 GB, 2.4 GB of VRAM warm) and Ornith's (0.9 GB) are untested here. Neither
  fits beside a model at 32K; both are a separate measurement.
- `docs/COMPATIBILITY-LINUX.md` carries the per-quant verdict of every official model against this PC. It is generated
  from `setup.py`'s estimates, and Gemma showed how optimistic in both directions those can be.
