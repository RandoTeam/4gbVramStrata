# Community benchmark on NVIDIA GeForce RTX 3050 Laptop GPU

Measured on 2026-11-20 with `tools/strata_bench.py` (suite 1, 3 runs per test, medians with ranges). Speeds are the engine's own timings; first-token times are measured by the client over HTTP. Speed only: no correctness check was run.

## Hardware and software

- GPU and VRAM: NVIDIA GeForce RTX 3050 Laptop GPU, 4 GiB VRAM
- CPU: AMD Ryzen 5 5500U with Radeon Graphics (6 cores, 12 threads); installed RAM: 30.7 GiB; storage: not measured
- OS: Linux 7.3.0-10-generic; GPU driver: 615.71.09; CUDA: not read
- 4gbVramStrata: project 0.1.45, commit b798306b; engine 0.1.45
- Background workloads and power limits: not recorded

## Model and configuration

- Model and quantization: clover-35b-a3b-preview-apex-i-nanoplus-Q8_0
- Context: 32768 tokens; parallel slots: 1
- Settings: the install's own configuration, unchanged; thinking off for the suite; temperature 0

```text
strata-fourgbvram.poly7.bin --model Clover-35B-A3B-Preview.APEX-I-NanoPlus-V2.1.gguf --max-context 32768 --expert-profile expert-profile.txt --conversation-cache-mib auto --tail-skip 6 --no-graphs --kv q8_0
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
| short chat | 46 (43-51) | 0 | 100 (100-100) | 9 | not measured | 43.5 (40.0-48.6) | 0.61 (0.58-0.67) |
| 4K prompt, fresh | 4019 (4019-4019) | 0 (0-0) | 24 cap | 3 | 718.8 (714.4-727.1) | not measured | 5.60 (5.53-5.64) |
| 16K prompt, fresh | 16058 (16058-16058) | 0 (0-0) | 24 cap | 3 | 699.2 (698.4-700.2) | not measured | 23.00 (22.95-23.03) |
| 32K prompt, fresh | 31294 (31294-31294) | 0 (0-0) | 24 cap | 3 | 668.0 (667.8-672.6) | not measured | 46.88 (46.60-46.93) |
| agent session, follow-up turns | 14629 (14586-14631) at the last turn | see below | up to 64 | 3 | see below | 34.3 (23.6-44.7) | 6.24 (4.29-6.83) |

Ranges are the lowest and highest of the runs; `Runs` counts requests that returned a token.

### Agent session (conversation cache)

Cache hit over the follow-up turns: 68.6 % (68.5-68.6); earlier-turn tokens read again per session: 5 (5-5) (earlier turns that the cache did not hold; the 13758 (13758-13760) new tokens of the files are read once); first turn (nothing cached) first token: 2.18 s (2.18-2.36).

| Turn (run 1) | Prompt tokens | Reused | Read | Prompt tok/s | First token (s) | Decode tok/s |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 609 | 0 | 609 | 261.6 | 2.362 | 39.9 |
| 1 | 3575 | 629 | 2946 | 582.1 | 5.072 | 38.2 |
| 2 | 5245 | 3625 | 1620 | 380.1 | 4.292 | 35.3 |
| 3 | 8676 | 5291 | 3385 | 496.9 | 6.827 | 34.3 |
| 4 | 11640 | 8725 | 2915 | 471.9 | 6.192 | 27.8 |
| 5 | 14586 | 11689 | 2897 | 450.8 | 6.441 | 23.6 |

Per-request data: `results.json`. Engine log lines from the start: `engine-log-excerpt.txt` (when this run started the server).

## Correctness and limitations

Not measured: this is a speed suite. The conversation uses the model's own replies, so token counts differ a little between runs. Machine details come from the server, `nvidia-smi`/`rocm-smi` and the OS; background load and power limits are not recorded. Total time of the suite: 391 s.
