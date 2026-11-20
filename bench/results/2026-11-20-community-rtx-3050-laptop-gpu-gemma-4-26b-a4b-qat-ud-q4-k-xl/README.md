# Community benchmark on NVIDIA GeForce RTX 3050 Laptop GPU

Measured on 2026-11-20 with `tools/strata_bench.py` (suite 1, 3 runs per test, medians with ranges). Speeds are the engine's own timings; first-token times are measured by the client over HTTP. Speed only: no correctness check was run.

## Hardware and software

- GPU and VRAM: NVIDIA GeForce RTX 3050 Laptop GPU, 4 GiB VRAM
- CPU: AMD Ryzen 5 5500U with Radeon Graphics (6 cores, 12 threads); installed RAM: 30.7 GiB; storage: not measured
- OS: Linux 7.3.0-10-generic; GPU driver: 615.71.09; CUDA: not read
- 4gbVramStrata: project 0.1.45, commit 345f7c10; engine 0.1.45
- Background workloads and power limits: not recorded

## Model and configuration

- Model and quantization: gemma-4-26b-a4b-qat-ud-q4_k_xl
- Context: 32768 tokens; parallel slots: 1
- Settings: the install's own configuration, unchanged; thinking off for the suite; temperature 0

```text
strata-fourgbvram --model gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf --max-context 32768 --expert-profile expert-profile.txt --draft-model mtp-gemma-4-26B-A4B-it-Q8_0.gguf
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
| short chat | 48 (45-53) | 0 | 100 (100-100) | 9 | not measured | 35.2 (32.2-39.5) | 0.93 (0.88-0.98) |
| 4K prompt, fresh | 4101 (4101-4101) | 0 (0-0) | 24 cap | 3 | 692.2 (690.7-695.2) | not measured | 5.96 (5.95-5.97) |
| 16K prompt, fresh | 16390 (16390-16390) | 0 (0-0) | 24 cap | 3 | 501.4 (500.6-501.7) | not measured | 32.74 (32.73-33.18) |
| 32K prompt, fresh | 32006 (32006-32006) | 0 (0-0) | 24 cap | 3 | 286.4 (285.9-287.2) | not measured | 111.83 (111.52-112.92) |
| agent session, follow-up turns | 14932 (14927-14933) at the last turn | see below | up to 64 | 3 | see below | 16.2 (10.1-33.1) | 8.41 (4.57-12.16) |

Ranges are the lowest and highest of the runs; `Runs` counts requests that returned a token.

### Agent session (conversation cache)

Cache hit over the follow-up turns: 67.3 % (67.3-67.3); earlier-turn tokens read again per session: 292 (287-293) (earlier turns that the cache did not hold; the 14279 (14279-14279) new tokens of the files are read once); first turn (nothing cached) first token: 2.01 s (1.98-2.03).

| Turn (run 1) | Prompt tokens | Reused | Read | Prompt tok/s | First token (s) | Decode tok/s |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 396 | 0 | 396 | 199.3 | 2.03 | 34.6 |
| 1 | 3598 | 389 | 3209 | 601.7 | 5.352 | 33.1 |
| 2 | 5345 | 3591 | 1754 | 385.6 | 4.565 | 26.5 |
| 3 | 8857 | 5338 | 3519 | 421.0 | 8.382 | 16.2 |
| 4 | 11872 | 8850 | 3022 | 316.7 | 9.572 | 12.9 |
| 5 | 14933 | 11865 | 3068 | 255.0 | 12.057 | 10.1 |

Per-request data: `results.json`. Engine log lines from the start: `engine-log-excerpt.txt` (when this run started the server).

## Correctness and limitations

Not measured: this is a speed suite. The conversation uses the model's own replies, so token counts differ a little between runs. Machine details come from the server, `nvidia-smi`/`rocm-smi` and the OS; background load and power limits are not recorded. Total time of the suite: 698 s.
