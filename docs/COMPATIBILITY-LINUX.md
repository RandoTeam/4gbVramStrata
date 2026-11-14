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

