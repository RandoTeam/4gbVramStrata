# Compatibility on this Linux PC: every official model and quant

This page is generated from the project's own check (`./setup.sh --check`) on the reference laptop:
RTX 3050 Laptop, 4 GB VRAM (3,770 MiB usable), Ryzen 5 5500U, 31 GB RAM, Ubuntu 26.04.
It is a **compatibility estimate**, not a download and not a benchmark: `--check` uses the same
`vram_beside_gb`/`ram_gb`/`arena_gb` estimates setup uses to choose a size. A model that says
"does not fit" needs more VRAM before its first expert, so no context/quant setting can fix it.
"starts with a small expert cache" means it starts, but most experts run on the CPU and it is slow.

## Summary

- **ДА**: 1
- **ДА, малый кэш**: 11
- **НЕТ**: 43
- **НЕ ПРОВЕРЯЛОСЬ**: 3

## Every official size

| Family | Model / quant | Download, GB | Engine | Verdict on this PC | Status |
|---|---|---:|---|---|---|
| Qwen3.8-Flash-Next | Q2_0 | 66.4 | `strata` | does not fit | **НЕТ** |
| Qwen3.8-Flash-Next | IQ2_XS | 68.0 | `strata` | does not fit | **НЕТ** |
| Qwen3.8-Flash-Next | IQ3_XXS | 75.8 | `strata` | does not fit | **НЕТ** |
| Qwen3.8-Flash-Next | IQ3_S | 83.6 | `strata` | does not fit | **НЕТ** |
| Qwen3.8-Flash-Next Coder | IQ1_M | 58.4 | `strata` | fits in the low-RAM mode (the GPU holds ~0% of its experts, the rest is read from the SSD as needed) | **ДА** |
| Swift 1.5 | IQ2_XS | 68.0 | `strata` | does not fit (48 GB RAM needed) | **НЕТ** |
| Swift 1.5 | IQ3_XXS | 75.8 | `strata` | does not fit (60 GB RAM needed) | **НЕТ** |
| Swift 1.5 | IQ3_S | 83.6 | `strata` | does not fit (62 GB RAM needed) | **НЕТ** |
| Qwen3.8-Flash-Next (Unsloth) | UD-IQ4_XS | 93.7 | `strata` | does not fit | **НЕТ** |
| GLM 5.3 Flash | 3.0BIT | 113.6 | `fourgbvram` | does not fit: it takes about 12 GB of VRAM before any expert, and this card has 4 GB | **НЕТ** |
| GLM 5.3 Flash | UD-IQ2_XXS | 101.8 | `fourgbvram` | does not fit: it takes about 12.5 GB of VRAM before any expert, and this card has 4 GB | **НЕТ** |
| GLM 5.3 Flash | REAP50-Q3_K_M | 78.8 | `fourgbvram` | does not fit: it takes about 11 GB of VRAM before any expert, and this card has 4 GB | **НЕТ** |
| Qwen3.8-Flash-Next (Unsloth) | UD-Q4_K_XL | 111.3 | `strata` | does not fit | **НЕТ** |
| Qwen3.8-Flash-Next (Unsloth) | UD-Q5_K_XL | 158.3 | `strata` | does not fit | **НЕТ** |
| Qwen3.8-Flash-Next (Unsloth) | UD-Q6_K_XL | 169.2 | `strata` | does not fit | **НЕТ** |
| Qwen3.8-Flash-Next (Unsloth) | Q8_0 | 188.2 | `strata` | does not fit | **НЕТ** |
| Qwen3.8-Flash-Next (NVFP4) | NVFP4 | 128.0 | `strata` | does not fit | **НЕТ** |
| Qwen3.8-Flash-Next (NVFP4) | NVFP4-NVIDIA | 128.0 | `strata` | does not fit | **НЕТ** |
| DeepSeek V4 Flash | DeepSeek V4 Flash UD-IQ2_XXS | 90.9 | `fourgbvram` | does not fit: it takes about 11.5 GB of VRAM before any expert, and this card has 4 GB | **НЕТ** |
| LFM2.5-24B-A2B | LFM2.5-24B-A2B UD-Q4_K_XL | 14.9 | `fourgbvram` | does not fit: it takes about 4.1 GB of VRAM before any expert, and this card has 4 GB | **НЕТ** |
| LFM2.5-24B-A2B | LFM2.5-24B-A2B UD-Q3_K_XL | 10.9 | `fourgbvram` | starts with a small expert cache: about 3.9 GB of this card go to the weights and caches, so little or no VRAM is left for experts (on a 4 GB card at 32K that is 0.2 to 0.6 GiB of experts; the rest of every answer is computed on the CPU) | **ДА, малый кэш** |
| LFM2.5-24B-A2B | LFM2.5-24B-A2B QAD-Q4_0 | 13.6 | `fourgbvram` | starts with a small expert cache: about 3.8 GB of this card go to the weights and caches, so little or no VRAM is left for experts (on a 4 GB card at 32K that is 0.2 to 0.6 GiB of experts; the rest of every answer is computed on the CPU) | **ДА, малый кэш** |
| LFM2.5-24B-A2B | LFM2.5-24B-A2B UD-Q6_K_XL | 21.9 | `fourgbvram` | does not fit: it takes about 4.4 GB of VRAM before any expert, and this card has 4 GB | **НЕТ** |
| LFM2.5-24B-A2B | LFM2.5-24B-A2B Q8_0 | 25.5 | `fourgbvram` | does not fit: it takes about 4.5 GB of VRAM before any expert, and this card has 4 GB | **НЕТ** |
| Flint 40B-A2.5B | Flint 40B-A2.5B UD-Q4_K_XL | 25.1 | `fourgbvram` | starts with a small expert cache: about 4.0 GB of this card go to the weights and caches, so little or no VRAM is left for experts (on a 4 GB card at 32K that is 0.2 to 0.6 GiB of experts; the rest of every answer is computed on the CPU) | **ДА, малый кэш** |
| Flint 40B-A2.5B | Flint 40B-A2.5B UD-Q3_K_XL | 18.5 | `fourgbvram` | starts with a small expert cache: about 3.8 GB of this card go to the weights and caches, so little or no VRAM is left for experts (on a 4 GB card at 32K that is 0.2 to 0.6 GiB of experts; the rest of every answer is computed on the CPU) | **ДА, малый кэш** |
| Flint 40B-A2.5B | Flint 40B-A2.5B UD-Q6_K_XL | 36.3 | `fourgbvram` | does not fit: it takes about 4.3 GB of VRAM before any expert, and this card has 4 GB | **НЕТ** |
| Flint 40B-A2.5B | Flint 40B-A2.5B Q8_0 | 42.3 | `fourgbvram` | does not fit: it takes about 4.3 GB of VRAM before any expert, and this card has 4 GB | **НЕТ** |
| Kolibri 1 | Kolibri 1 Q4_K_M | 47.5 | `fourgbvram` | does not fit: it takes about 4.1 GB of VRAM before any expert, and this card has 4 GB | **НЕТ** |
| Kolibri 1 | Kolibri 1 Q2_K | 28.6 | `fourgbvram` | does not fit: it takes about 4.1 GB of VRAM before any expert, and this card has 4 GB | **НЕТ** |
| Kolibri 1 | Kolibri 1 Q3_K_M | 37.5 | `fourgbvram` | does not fit: it takes about 4.1 GB of VRAM before any expert, and this card has 4 GB | **НЕТ** |
| Qwen3.6-35B-A3B | Qwen3.6-35B-A3B UD-Q3_K_M | 17.1 | `fourgbvram` | does not fit: it takes about 4.8 GB of VRAM before any expert, and this card has 4 GB | **НЕТ** |
| Qwen3.6-35B-A3B | Qwen3.6-35B-A3B UD-Q2_K_XL | 12.6 | `fourgbvram` | does not fit: it takes about 4.2 GB of VRAM before any expert, and this card has 4 GB | **НЕТ** |
| Qwen3.6-35B-A3B | Qwen3.6-35B-A3B UD-Q4_K_M | 22.7 | `fourgbvram` | does not fit: it takes about 4.7 GB of VRAM before any expert, and this card has 4 GB | **НЕТ** |
| Clover-35B-A3B-Preview | Clover-35B-A3B-Preview Q3_K_M | 16.8 | `fourgbvram` | starts with a small expert cache: about 3.4 GB of this card go to the weights and caches, so little or no VRAM is left for experts (on a 4 GB card at 32K that is 0.2 to 0.6 GiB of experts; the rest of every answer is computed on the CPU) | **ДА, малый кэш** |
| Clover-35B-A3B-Preview | Clover-35B-A3B-Preview APEX-I-NANOPLUS | 12.6 | `fourgbvram` | starts with a small expert cache: about 3.6 GB of this card go to the weights and caches, so little or no VRAM is left for experts (on a 4 GB card at 32K that is 0.2 to 0.6 GiB of experts; the rest of every answer is computed on the CPU) | **ДА, малый кэш** |
| Clover-35B-A3B-Preview | Clover-35B-A3B-Preview Q4_K_M | 21.2 | `fourgbvram` | starts with a small expert cache: about 3.5 GB of this card go to the weights and caches, so little or no VRAM is left for experts (on a 4 GB card at 32K that is 0.2 to 0.6 GiB of experts; the rest of every answer is computed on the CPU) | **ДА, малый кэш** |
| Ornith 1.5 35B-A3B | Ornith 1.5 35B-A3B APEX-I-COMPACT | 17.4 | `fourgbvram` | does not fit: it takes about 4.2 GB of VRAM before any expert, and this card has 4 GB | **НЕТ** |
| Ornith 1.5 35B-A3B | Ornith 1.5 35B-A3B APEX-I-MINI | 14.4 | `fourgbvram` | starts with a small expert cache: about 3.9 GB of this card go to the weights and caches, so little or no VRAM is left for experts (on a 4 GB card at 32K that is 0.2 to 0.6 GiB of experts; the rest of every answer is computed on the CPU) | **ДА, малый кэш** |
| Ornith 1.5 35B-A3B | Ornith 1.5 35B-A3B APEX-I-QUALITY | 23.7 | `fourgbvram` | does not fit: it takes about 4.4 GB of VRAM before any expert, and this card has 4 GB | **НЕТ** |
| Gemma 4 26B-A4B | Gemma 4 26B-A4B UD-Q3_K_M | 13.2 | `fourgbvram` | does not fit: it takes about 5.8 GB of VRAM before any expert, and this card has 4 GB | **НЕТ** |
| Gemma 4 26B-A4B | Gemma 4 26B-A4B UD-Q2_K_XL | 11.0 | `fourgbvram` | does not fit: it takes about 4.6 GB of VRAM before any expert, and this card has 4 GB | **НЕТ** |
| Gemma 4 26B-A4B | Gemma 4 26B-A4B UD-Q4_K_M | 17.4 | `fourgbvram` | does not fit: it takes about 5.3 GB of VRAM before any expert, and this card has 4 GB | **НЕТ** |
| Gemma 4 26B-A4B | Gemma 4 26B-A4B QAT-UD-Q4_K_XL | 14.7 | `fourgbvram` | does not fit: it takes about 4.1 GB of VRAM before any expert, and this card has 4 GB | **НЕТ** |
| Tiel Coder 35B-A3B | Tiel Coder 35B-A3B UD-Q3_K_XL | 17.2 | `fourgbvram` | does not fit: it takes about 4.7 GB of VRAM before any expert, and this card has 4 GB | **НЕТ** |
| Tiel Coder 35B-A3B | Tiel Coder 35B-A3B UD-IQ3_XXS | 13.6 | `fourgbvram` | does not fit: it takes about 4.4 GB of VRAM before any expert, and this card has 4 GB | **НЕТ** |
| Tiel Coder 35B-A3B | Tiel Coder 35B-A3B UD-Q4_K_XL | 22.7 | `fourgbvram` | does not fit: it takes about 4.8 GB of VRAM before any expert, and this card has 4 GB | **НЕТ** |
| MiniCPM-V 4.7 35B-A3B | MiniCPM-V 4.7 35B-A3B Q4_K_M | 21.2 | `fourgbvram` | starts with a small expert cache: about 3.4 GB of this card go to the weights and caches, so little or no VRAM is left for experts (on a 4 GB card at 32K that is 0.2 to 0.6 GiB of experts; the rest of every answer is computed on the CPU) | **ДА, малый кэш** |
| MiniCPM-V 4.7 35B-A3B | MiniCPM-V 4.7 35B-A3B mix_q3gud_im | 15.5 | `fourgbvram` | starts with a small expert cache: about 3.4 GB of this card go to the weights and caches, so little or no VRAM is left for experts (on a 4 GB card at 32K that is 0.2 to 0.6 GiB of experts; the rest of every answer is computed on the CPU) | **ДА, малый кэш** |
| MiniCPM-V 4.7 35B-A3B | MiniCPM-V 4.7 35B-A3B Q6_K | 28.5 | `fourgbvram` | starts with a small expert cache: about 3.4 GB of this card go to the weights and caches, so little or no VRAM is left for experts (on a 4 GB card at 32K that is 0.2 to 0.6 GiB of experts; the rest of every answer is computed on the CPU) | **ДА, малый кэш** |
| Ornith 1.5 122B | Ornith 1.5 122B UD-Q3_K_XL | 59.8 | `fourgbvram` | does not fit: it takes about 8.5 GB of VRAM before any expert, and this card has 4 GB | **НЕТ** |
| Ornith 1.5 122B | Ornith 1.5 122B UD-Q2_K_XL | 44.5 | `fourgbvram` | does not fit: it takes about 8.5 GB of VRAM before any expert, and this card has 4 GB | **НЕТ** |
| Ornith 1.5 122B | Ornith 1.5 122B UD-IQ3_XXS | 49.5 | `fourgbvram` | does not fit: it takes about 8.5 GB of VRAM before any expert, and this card has 4 GB | **НЕТ** |
| Ornith 1.5 122B | Ornith 1.5 122B UD-Q4_K_XL | 79.7 | `fourgbvram` | does not fit: it takes about 8.5 GB of VRAM before any expert, and this card has 4 GB | **НЕТ** |
| Ornith 1.5 122B | Ornith 1.5 122B Q8_0 | 132.6 | `fourgbvram` | does not fit: it takes about 8.5 GB of VRAM before any expert, and this card has 4 GB | **НЕТ** |
| Preview: Qwen3.6-35B-A3B on Strata | UD-Q4_K_XL | ~22.9 | `strata` | not covered by `--check`; preview needs 32 GB RAM | **НЕ ПРОВЕРЯЛОСЬ** |
| Preview: Qwen3.6-35B-A3B on Strata | UD-Q6_K_XL | ~32.6 | `strata` | not covered by `--check`; preview needs 44 GB RAM | **НЕ ПРОВЕРЯЛОСЬ** |
| Preview: Qwen3.6-35B-A3B on Strata | Q8_0 | ~37.8 | `strata` | not covered by `--check`; preview needs 52 GB RAM | **НЕ ПРОВЕРЯЛОСЬ** |

## Profiles of the models that may start

These are the families whose smallest/estimated-fitting quants are in the table above. "May start" is
setup's estimate; only Clover has been run end-to-end on this PC. Dates and benchmarks are from the
model cards and this repository's [MODELS-4GB.md](MODELS-4GB.md).

### Clover-35B-A3B-Preview (DiffuSpace)

- **Released:** 28-30 October 2026, DiffuSpace's first model.
- **Base:** Qwen3.6-35B-A3B, trained further by DiffuSpace; a **block-diffusion** language model.
- **Layers / architecture:** 40 layers, hybrid Gated DeltaNet / full-attention MoE; 256 routed experts,
  top-8, one shared expert; 35B total / ~3B active; 128K context; text only.
- **Knowledge:** inherits Qwen3.6-35B-A3B; no separate cutoff is stated.
- **Benchmarks (launch post):** SWE-Verified 73.6, Terminal-Bench 2.1 51.7, GPQA Diamond 83.8,
  MMLU-Pro 84.8, ZebraLogic 95.8, BFCL-v4 67.9.
- **Estimated to start here:** Q3_K_M (16.8 GB), APEX-I-NANOPLUS (12.6), Q4_K_M (21.2).
  **Actually verified:** APEX-I-NANOPLUS works at 32K and 64K.

### Flint 40B-A2.5B (Recursive)

- **Released:** 21 October 2026.
- **Base:** trained **from scratch** by Recursive; not a fine-tune.
- **Layers / architecture:** 49 layers (2 dense + 47 MoE); 35 sliding-window layers (513 tokens) and
  14 full-attention layers; 256 routed experts, top-6, plus a shared expert; 39.8B total / ~2.5B active;
  262,144-token context; vocabulary 150,144; text.
- **Knowledge cutoff:** **June 2026** (stated).
- **Benchmarks:** Terminal-Bench 2.1 54.9, SWE-bench Pro v2 89.7, SWE-bench Verified 74.2.
- **Estimated to start here:** UD-Q3_K_XL (18.5 GB), UD-Q4_K_XL (25.1). Not yet run here.

### LFM2.5-24B-A2B (Liquid AI)

- **Released:** 12 October 2026.
- **Base:** LFM2.5-24B-A2B-Base, Liquid AI's own on-device MoE.
- **Layers / architecture:** 40 layers (30 double-gated short-convolution + 10 GQA); 64 experts,
  top-4; 24B total / ~2B active; 131,072-token context; 128K vocabulary; always-on reasoning
  (`<think>` in the chat template); 36T training tokens (~33T pre-training, 2T mid-training,
  300B long-context).
- **Knowledge:** no cutoff stated; the card recommends retrieval/web search for knowledge-heavy use.
- **Benchmarks:** SWE-bench Verified 51.0, GPQA Diamond 74.42, MATH-500 96.04, IFEval 96.75,
  LiveClaw 48.09, BFCLv4 65.01, AutomationBench 27.69.
- **Estimated to start here:** UD-Q3_K_XL (10.9 GB), QAD-Q4_0 (13.6). UD-Q4_K_XL does not fit.
  Not yet run here.

### Ornith 1.5 35B-A3B (ornith-ai)

- **Released:** 23 August 2026.
- **Base:** Ornith-1.0, itself built on Qwen3.5 and Gemma 4 with continued pre-training, mid-training
  and post-training; Ornith 1.5 adds a self-improvement loop and RL.
- **Layers / architecture:** 40 trunk layers + 1 MTP draft layer; 30 Gated DeltaNet (linear attention)
  + 10 full-attention; 256 routed experts, top-8, plus a shared expert; 35B total / ~3B active;
  262,144-token context.
- **Knowledge:** no separate cutoff stated; inherited from the Qwen3.5/Gemma 4 base.
- **Benchmarks (card):** SWE-bench Verified 79.0, SWE-bench Pro 59.6, SWE-bench Multilingual 71.4,
  Terminal-Bench 2.1 67.8-68.5, GPQA Diamond 89.2, HLE 25.6/33.4, ClawEval 72.5; AIME and
  LiveCodeBench not published. Reproducibility is disputed in community reports.
- **Estimated to start here:** APEX-I-MINI (14.4 GB). Not yet run here.

### MiniCPM-V 4.7 35B-A3B (OpenBMB)

- **Released:** 12 October 2026.
- **Base:** the first MoE in the MiniCPM-V series; Qwen3.6-like 40-layer MoE with its own vision
  encoder (27 layers); not a fine-tune of Qwen3.6.
- **Layers / architecture:** 35.21B total / ~3B active; 40 layers, 256 experts top-8, one MTP layer;
  mixed 4x/16x visual-token compression; text, images, video; 3 GB on-device demo on an iPhone.
- **Knowledge:** no cutoff stated.
- **Benchmarks (vendor, vision):** MMBench 91.7, MMStar 80.7, MMMU 80.2, OCRBench 91.2.
  SWE/AIME/GPQA not published.
- **Estimated to start here:** Q4_K_M (21.2 GB), mix_q3gud_im (15.5), Q6_K (28.5), all with a small
  expert cache. The vision path on 4 GB is not measured.

### Qwen3.8-Flash-Next Coder IQ1_M (ISTA-DASLab)

- **Released:** base Qwen3.8-Flash-Next 26-27 August 2026; Coder compression updated 17 October 2026.
- **Base:** Qwen3.8-Flash-Next (176.9B parameters); the Coder keeps 256 of each layer's 512 experts,
  chosen on code/agentic/image data, and stores the retained weights at 3.5 bpw.
- **Layers / architecture:** 48 layers, 512 experts, top-10 active in the base; the Coder has 256 of
  512 experts per layer; 58.4 GB transformer + 28.8 GB n-gram shard; text.
- **Knowledge:** base card does not state a cutoff; external trackers list August 2025.
- **Benchmarks:** Coder SWE-bench Verified 79.20 and LiveCodeBench v6 87.43 (BF16 base 82.80 / 87.43;
  retains 95.7% / 100%). Weaker outside code.
- **Estimated to start here:** IQ1_M only, in the main engine's low-RAM mode. **Not verified**; on this
  4 GB card the main engine's output head is likely to fail as it did for Q2_0.

## Ranking for a one-shot Three.js / frontend task

The task in question is not SWE-bench: one prompt must produce a complete, good-looking
single-file `index.html` with Three.js, first-person controls, collision, touch UI and a dense
scene. The evidence below mixes coding-agent benchmarks, frontend preference arenas and a few
independent Three.js tests; treat the order as a judgement, not a single score.

### 1. Qwen3.8-Flash-Next Coder IQ1_M - best ability, worst availability here

- **Code:** SWE-bench Verified 79.20, LiveCodeBench v6 87.43 (95.7% / 100% of the BF16 base).
  The base Qwen3.8-Flash-Next is **#8 overall and #3 among open models on Code Arena WebDev**
  (frontend score ~1648), and there are multiple public one-shot Three.js demos with it.
- **Design:** the only family here with a strong public WebDev Arena result; the Coder kept
  vision/spatial calibration from the base. Best odds of a polished, complete first answer.
- **Catch:** the main-engine low-RAM estimate is the only reason it is on the "may start" list,
  and on this 4 GB card the output head is likely to fail as it did for Q2_0. Not verified.

### 2. Ornith 1.5 35B-A3B - strongest runnable coding/agent model

- **Code:** SWE-bench Verified 79.0, SWE-bench Pro 59.6, Terminal-Bench 2.1 67.8-68.5.
- **Design/Three.js:** an independent Three.js one-shot suite scored it **15/30**, against
  Qwen3.6-35B 13/30 and Qwen3.8-27B 24/30. So it is a solid agentic coder but not a designer
  at the Qwen3.8 level.
- **Verdict:** best all-round choice among the models that setup says can start here, especially
  for code and multi-step work; visuals may need iteration.

### 3. Flint 40B-A2.5B - excellent coding agent, not a frontend designer

- **Code:** SWE-bench Pro v2 89.7, SWE-bench Verified 74.2, Terminal-Bench 2.1 54.9,
  LiveCodeBench v6 80.3. Trained from scratch, 262K context.
- **Design/frontend:** independent testing liked the HTML/CSS structure but found a visible CSS
  sizing bug in a landing page; it is a coding model first.
- **Verdict:** strong for code-heavy scenes and logic; less reliable for a polished first-shot
  visual composition.

### 4. MiniCPM-V 4.7 35B-A3B - vision helps design, code ceiling is lower

- **Code:** independent llm-bench run: **Code 63.8**, Agent 89.1, Quality 79.4; it produced a
  playable single-file HTML game in that test.
- **Design:** vision/OCR/UI understanding is its strength (MMMU 80.2, OCRBench 91.2), useful for
  screenshot-to-UI work; complex 3D code is below the top three.
- **Verdict:** good for visual/UI tasks and image-guided design, not the first pick for a large
  collision-heavy Three.js scene.

### 5. Clover-35B-A3B-Preview - creative, but the weakest engineering evidence

- **Code:** SWE-bench Verified 73.6 suggests capability, but on DaBench its **coding score was
  10 and overall 30** (instruction 53, structured 43, agents 20); Qwen3.8-Flash-Next scored 42
  overall there. Different harnesses disagree, so treat it as inconsistent.
- **Design:** DaBench has Clover showcases (portfolio, boat game, snake), so it can produce
  aesthetic output; one-shot completeness and collision/UI logic are the risk.
- **Verdict:** actually runs on this PC, but for a complex one-shot frontend it is below the
  coding-first models.

### 6. LFM2.5-24B-A2B - fastest, but not a complex frontend model

- **Code:** SWE-bench Verified 51.0; on DaBench it loses **72 of 77** differing cases to
  Qwen3.8-Flash-Next.
- **Design:** no meaningful frontend/design evidence; its strength is agentic tool use
  (LiveClaw 48.09, AutomationBench 27.69), not large single-file 3D scenes.
- **Verdict:** good for fast tool-driven tasks, last for this Three.js prompt.

### Practical order on this 4 GB PC

1. **Clover APEX-I-NANOPLUS** - the only one actually verified to run; use it if you need a
   working setup today.
2. **Ornith 1.5 APEX-I-MINI** - best estimated runnable coding ability; needs a download and a
   real start test.
3. **Flint UD-Q3_K_XL** - next estimated runnable coding agent.
4. **MiniCPM-V mix_q3gud_im** - if the task is visual/image-guided.
5. **LFM2.5 UD-Q3_K_XL** - fastest, weakest for this task.
6. **Qwen3.8 Coder IQ1_M** - highest ability, but likely will not start on 4 GB.

## What was actually run, not just estimated

| Model | Result |
|---|---|
| **Clover-35B-A3B-Preview APEX-I-NANOPLUS** | **Works** on this PC. 32K: 784 experts in VRAM, chat 36.1 tok/s (34.2–44.3), prefill 543 tok/s. 64K: 674 experts, 57,897-token prompt read at 634 tok/s, decode 8.2 tok/s at depth. |
| **Qwen3.8-Flash-Next Q2_0** | **Does not start** on 4 GB. Low-RAM mode, 31 GB RAM. At 32K/16K/8K it fails at the native output head or prompt scratch; MTP needs 675 MiB for its 512 experts and cannot fit. Files were removed after the test. |
| **Gemma 4 26B-A4B QAT-UD-Q4_K_XL** | **Does not fit**: 4.1 GB VRAM before any expert at 32K, and 64K is worse. Not downloaded. |

## Uncensored / abliterated variants

These are **not** part of `setup.py` or this project's official support. There is no single
"uncensored" version per family, and their GGUF architectures and quant sets are community-made.
A real audit needs, for each candidate: the HF repository, the exact GGUF, its architecture accepted
by the engine, and a download. That is a separate, much larger pass; it cannot be answered by
`--check`. The official matrix above is therefore the complete answer for supported models.

## How to regenerate this page

```bash
./setup.sh --check
```

