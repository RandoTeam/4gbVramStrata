# Community benchmark on NVIDIA GeForce RTX 3050 Laptop GPU

Measured on 2026-11-12 with `tools/strata_bench.py` (suite 1, 3 runs per test, medians with ranges). Speeds are the engine's own timings; first-token times are measured by the client over HTTP. Speed only: no correctness check was run.

## Hardware and software

- GPU and VRAM: NVIDIA GeForce RTX 3050 Laptop GPU, 4 GiB VRAM
- CPU: AMD Ryzen 5 5500U with Radeon Graphics (6 cores, 12 threads); installed RAM: 30.7 GiB; storage: not measured
- OS: Linux 7.0.0-43-generic; GPU driver: 595.99.02; CUDA: 13.2
- 4gbVramStrata: project 0.1.45, commit 50afe409; engine 0.1.45
- Background workloads and power limits: not recorded

## Model and configuration

- Model and quantization: clover-35b-a3b-preview-apex-i-nanoplus-Q8_0
- Context: 32768 tokens; parallel slots: 1
- Settings: the install's own configuration, unchanged; thinking off for the suite; temperature 0

```text
strata-fourgbvram --model Clover-35B-A3B-Preview.APEX-I-NanoPlus-V2.1.gguf --max-context 32768 --expert-profile expert-profile.txt --conversation-cache-mib auto --tail-skip 6 --no-graphs --kv q8_0
```

## Method

Run by `python tools/strata_bench.py --long` against the HTTP API of a 4gbVramStrata server (started by the benchmark from the install configuration); model loading is not timed. One warm-up chat and a 1K prompt are discarded first. Every prompt starts with a unique tag, so the conversation cache cannot help the fresh-prompt tests.

- short chat: the three questions of `tools/ab_engine.py`, up to 100 new tokens, 3 runs
- 4K / 16K prompts: generated word lists sized by a calibration request, 24 new tokens, 3 fresh prompts each
- agent session: system prompt and four tools, then 5 turns that each add about 1500 words of a project file and continue from the model's own earlier answers (the way agent clients resend a conversation), 64 new tokens per turn, 3 sessions; the cache numbers come from the answer's usage (`cached_tokens`) and timings (`prompt_n`)
- concurrency (when run): N requests sent at the same moment, total tokens over the wall time of the burst, latency over all requests

## Results

| Configuration | Actual prompt tokens | Reused tokens | Generated tokens | Runs | Prompt tok/s median and range | Decode tok/s median and range | TTFT seconds median and range |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| short chat | 46 (43-51) | 0 | 100 (100-100) | 9 | not measured | 38.7 (34.8-44.0) | 0.66 (0.61-0.73) |
| 4K prompt, fresh | 4019 (4019-4019) | 0 (0-0) | 24 cap | 3 | 718.3 (718.2-720.0) | not measured | 5.61 (5.59-5.61) |
| 16K prompt, fresh | 16058 (16058-16058) | 0 (0-0) | 24 cap | 3 | 703.4 (698.7-703.4) | not measured | 22.86 (22.85-23.02) |
| 32K prompt, fresh | 31294 (31294-31294) | 0 (0-0) | 24 cap | 3 | 668.2 (667.5-670.3) | not measured | 46.90 (46.72-46.95) |
| agent session, follow-up turns | 14594 (14594-14627) at the last turn | see below | up to 64 | 3 | see below | 33.1 (22.2-42.3) | 6.23 (4.29-6.81) |

Ranges are the lowest and highest of the runs; `Runs` counts requests that returned a token.

### Agent session (conversation cache)

Cache hit over the follow-up turns: 68.6 % (68.5-68.6); earlier-turn tokens read again per session: 5 (5-5) (earlier turns that the cache did not hold; the 13758 (13758-13760) new tokens of the files are read once); first turn (nothing cached) first token: 2.24 s (2.23-2.42).

| Turn (run 1) | Prompt tokens | Reused | Read | Prompt tok/s | First token (s) | Decode tok/s |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 609 | 0 | 609 | 255.1 | 2.422 | 36.8 |
| 1 | 3575 | 629 | 2946 | 576.0 | 5.126 | 33.8 |
| 2 | 5250 | 3630 | 1620 | 374.4 | 4.338 | 33.1 |
| 3 | 8686 | 5301 | 3385 | 499.2 | 6.795 | 30.9 |
| 4 | 11649 | 8734 | 2915 | 471.1 | 6.201 | 28.5 |
| 5 | 14594 | 11697 | 2897 | 445.6 | 6.515 | 25.2 |

Per-request data: `results.json`. Engine log lines from the start: `engine-log-excerpt.txt` (when this run started the server).

## Correctness and limitations

Not measured: this is a speed suite. The conversation uses the model's own replies, so token counts differ a little between runs. Machine details come from the server, `nvidia-smi`/`rocm-smi` and the OS; background load and power limits are not recorded. Total time of the suite: 399 s.
