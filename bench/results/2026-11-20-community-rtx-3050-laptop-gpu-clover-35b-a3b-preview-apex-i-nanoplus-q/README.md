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
| short chat | 46 (43-51) | 0 | 100 (100-100) | 9 | not measured | 46.0 (42.5-50.5) | 0.60 (0.56-0.65) |
| 4K prompt, fresh | 4019 (4019-4019) | 0 (0-0) | 24 cap | 3 | 731.2 (730.9-731.6) | not measured | 5.51 (5.50-5.51) |
| 16K prompt, fresh | 16058 (16058-16058) | 0 (0-0) | 24 cap | 3 | 709.8 (708.2-712.0) | not measured | 22.66 (22.57-22.71) |
| 32K prompt, fresh | 31294 (31294-31294) | 0 (0-0) | 24 cap | 3 | 668.5 (667.3-669.7) | not measured | 46.84 (46.79-46.96) |
| agent session, follow-up turns | 14727 (14726-14740) at the last turn | see below | up to 64 | 3 | see below | 34.7 (24.4-46.5) | 6.21 (4.39-6.91) |

Ranges are the lowest and highest of the runs; `Runs` counts requests that returned a token.

### Agent session (conversation cache)

Cache hit over the follow-up turns: 68.7 % (68.7-68.7); earlier-turn tokens read again per session: 5 (5-5) (earlier turns that the cache did not hold; the 13896 (13896-13896) new tokens of the files are read once); first turn (nothing cached) first token: 2.08 s (2.06-2.22).

| Turn (run 1) | Prompt tokens | Reused | Read | Prompt tok/s | First token (s) | Decode tok/s |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 609 | 0 | 609 | 279.0 | 2.217 | 42.1 |
| 1 | 3713 | 629 | 3084 | 604.3 | 5.116 | 38.0 |
| 2 | 5383 | 3763 | 1620 | 370.4 | 4.394 | 35.5 |
| 3 | 8817 | 5432 | 3385 | 503.3 | 6.742 | 33.9 |
| 4 | 11781 | 8866 | 2915 | 478.7 | 6.103 | 27.8 |
| 5 | 14727 | 11830 | 2897 | 447.9 | 6.483 | 24.4 |

Per-request data: `results.json`. Engine log lines from the start: `engine-log-excerpt.txt` (when this run started the server).

## Correctness and limitations

Not measured: this is a speed suite. The conversation uses the model's own replies, so token counts differ a little between runs. Machine details come from the server, `nvidia-smi`/`rocm-smi` and the OS; background load and power limits are not recorded. Total time of the suite: 387 s.
