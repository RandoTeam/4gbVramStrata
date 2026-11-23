# Quality on a 4 GB card

Speed is not worth much if the answers get worse. This page is the smoke test the project runs after a change that
touches speed: **twenty-two prompts across nine domains**, greedy, scored pass or fail. It is deliberately shallow — it
catches an answer that is empty, off-topic, in the wrong language, refuses, repeats the question, or returns code that
does not run. It is not a benchmark and it does not score quality.

## How it runs

```sh
# the server must already run with the model loaded
python bench/quality/run.py --model local --repeat 2 --out bench/quality/results/clover.json
```

The prompts are `bench/quality/prompts.json`; the checks are in `bench/quality/run.py`: `contains`, `contains_all`,
`json_keys`, `json_array_len`, `json_calls`, `runs_python`, `fib8`, `comma_count`, `word_count`, `max_words`,
`russian_list`, `palindrome_code`. `--max-tokens` defaults to 1200 because both models write a reasoning block first, and
a small budget ends the answer inside it. `--repeat 2` asks every prompt twice: greedy answers can still move, because
the expert cache moves. A row is `ok` only if every attempt passes; `FLAKY` means one attempt failed and one passed.
`--no-long` leaves the long-context prompt out, `--only id,id` runs a few.

Four checks are worth naming:

- **`runs_python`** takes the answer's Python block, `exec`s it, calls the function it asked for and compares the
  results as JSON — so a `tuple` and a `list` match, and code that does not run fails. **That executes the model's code
  in the runner's own process:** run the gate on a machine where that is acceptable, or `--no-long` and skip that
  prompt.
- **`json_calls`** scans balanced `{...}` objects (nested `arguments` included), reads each call's `name`, and requires
  the three expected tool names in order.
- **`needle_3facts`** builds a long document (about 18,000 tokens of filler) with one fact near the start, one in the
  middle and one near the end, and asks for all three at the end.
- **`json_array_len`** wants exactly three objects with two keys each.

## Result, 2026-11-03

The shipped settings (`--tail-skip 6 --no-graphs --kv q8_0` on Clover, `--prompt-batch 512 --expert-swaps 32
--no-graphs` on Flint), 32K context, two attempts per prompt, on the engine built from this commit:

| Model | Passed every attempt | Notes |
| --- | ---: | --- |
| Clover APEX-I-NANOPLUS | **22 of 22** | every domain, including code that runs, the tool loop and the three-fact long context |
| Flint UD-Q3_K_XL | **21 of 22** | lost the Russian instruction |

**Re-run on the poly.10 engine, 2026-11-20:** Clover APEX-I-NANOPLUS, the same settings, two attempts per prompt,
**22 of 22** again (every prompt passed both attempts; `bench/quality/results/local.json`). The engine update moved no
answer the gate can see.

### Gemma 4 26B-A4B QAT-UD-Q4_K_XL, 2026-11-20: 21 of 22

The same gate, the config setup wrote (`--max-context 32768 --expert-profile … --draft-model
mtp-gemma-4-26B-A4B-it-Q8_0.gguf`), two attempts per prompt, on the poly.10 engine:
**21 of 22** (`bench/quality/results/gemma-qat-q4-k-xl.json`).

| Prompt | Result |
| --- | ---: |
| 21 prompts — arithmetic, logic, JSON, code that runs, Russian, German, Spanish, the three facts across ~18K tokens | ok 2/2 |
| `tool_loop` | **0/2** |

The one failure is the model and not the engine: asked to *read* `src/main.c`, then `grep` it, then `write_file` the
result — three calls in order — Gemma answers with **two** calls, `grep` and `write_file`, both attempts:

```json
{"name": "grep", "arguments": {"pattern": "TODO", "path": "src/main.c"}}
{"name": "write_file", "arguments": {"path": "notes/todo.md", "text": "result_of_grep"}}
```

It folded the read into the grep, which is a legitimate plan for a human and not the call sequence the prompt asked
for. Clover, on the same gate, emits all three. This is the fourth family to lose a prompt here and the first whose
failure is a planning choice rather than an instruction it could not follow.

### v0.2.19-poly.1 engine, 2026-11-23: Clover, Gemma 4 and Inkling 2 Mini

Measured on the locally compiled `v0.2.19-poly.1` engine (`dc0c4abf9`, SHA-256 `274a7e4d3fb0ed2e…`), two attempts per prompt:

| Model | Result file | Passed every attempt | Long prompt (`needle_3facts`) | Failed prompt |
| --- | --- | ---: | --- | --- |
| **Clover APEX-I-NANOPLUS** | `bench/quality/results/clover-v0219.json` | **22 of 22** | 2/2 (13,722 tokens read at 742.6 tok/s) | none |
| **Gemma 4 26B-A4B QAT-UD-Q4_K_XL** | `bench/quality/results/gemma4-v0219.json` | **21 of 22** | 2/2 (13,333 tokens read at 520.3 tok/s) | `tool_loop` 0/2 (folds `read_file` into `grep`) |
| **Inkling 2 Mini UD-Q4_K_XL** | `bench/quality/results/inkling-ud-q4-k-xl.json` | **21 of 22** | 2/2 (15,323 tokens read at 279.5 tok/s) | `tool_loop` 0/2 (hit `--max-tokens 2000` inside `reasoning_content`, 6,989 / 6,832 chars) |

Notice Inkling 2 Mini ran at `--max-tokens 2000` per the reasoning-budget rule and still spent all 2,000 completion tokens inside thinking on `tool_loop` before emitting visible JSON tool calls; all other 21 prompts (arithmetic, logic, executable Python, single `tool_call`, JSON schema, Russian/German/Spanish, constraints, and all three needles across 15K tokens) passed 2/2.

**The long-context prompt is why the engine fix in this session mattered.** Before it, `needle_3facts` (about 18,000
tokens) ended the request with `cudaGraphInstantiate: out of memory` — the 400 that stopped the first gate run at
prompt 22 of 22. With the recording falling back to plain launches it passes 2/2.

**The one failure is real and it is Flint's.** Asked in Russian to list three reasons a laptop can run slowly, Flint
repeated the instruction back (both attempts that run). The same request at temperature 0 in other runs gave a correct
numbered list once, a greeting ("Привет, дорогой, друг!") once, and a short story about an author's pseudonym once —
four runs, four behaviours: **Flint's Russian instruction-following is unstable in content, not in language.** Clover
answered it correctly in every run.

One of those Flint runs (the one under a full CUDA build on the same PC) came back as byte-level mojibake — the
instruction's UTF-8 bytes rendered as if they were CP1251. Re-encoding it and decoding as UTF-8 gave the instruction
again, with a few characters lost. It did not reproduce: the same request, same settings, later gave proper Cyrillic
twice and a story twice. The pack's tokenizer round-trips that prompt byte for byte, so the tokenizer is not the
source; a byte-level BPE model that loses the thread can emit byte tokens, and that is the likeliest explanation. It is
written down as not reproduced.

Everything else passed for both: arithmetic with exact results, the logic traps (roses, shortest), a palindrome
function written correctly (two different idioms), a list-comprehension result, JSON with the asked keys, a JSON tool
call, a three-call tool loop, a Python function that was executed and checked, German and Spanish, an eight-word
sentence, exactly five primes, a one-sentence summary, the capital of Australia, the Fibonacci sequence in either
convention (0- or 1-based), and three facts spread through ~18,000 tokens of context.

## The 8-bit attention cache: the suite and a needle at 20K (2026-11-03)

`--kv q8_0` (`clover_moe`, now setup's default for Clover on a card of 6 GB or less) stores the K and V caches in
Q8_0 blocks, so their arithmetic is not fp16's. Two checks:

| | fp16 | q8_0 |
| --- | ---: | ---: |
| the sixteen prompts, 2 attempts each, Clover | **16 of 16** | **16 of 16** |
| a code placed at 15% of a 20,033-token prompt, 2 asks | **2 hits** | **2 hits** |
| time to the first answer of that needle | 79.0 s | **38.5 s** |

The needle is the check that matters for a quantized cache: a long prompt with a unique line at 15% depth ("the
calibration code for bay seven is ZUBROVKA-7741") and one question. Both formats returned `ZUBROVKA-7741` on both
asks, which is a retrieval hit, not a paraphrase. It is one needle at one depth, not a retrieval benchmark: the suite
still lacks a multi-fact needle and a 32K one.

Note what the suite does *not* see: on the same run, fp16 Clover answered the Russian prompt with an irrelevant answer
about a rabbit needing rest — on-topic Cyrillic, wrong content, and the check passed it. The checks are that shallow by
design; they catch empty, off-topic, wrong-language and refusals, not a plausible wrong answer.

## A penalty that counted the prompt (fixed 2026-11-03)

`--penalty-last-n` (repeat, frequency and presence penalties) counted the **prompt's** last tokens as if they were the
reply's: the sampler's history was the whole sequence. A client that sets a penalty — coding agents do — could see a
new task avoid the words of the old one; Strata measured the previous JSON coming back in 13 of 32 seeds with the
prompt counted and 4 of 32 without (#4590). Ours had the same bug in both the single-request and the batch paths.

It is fixed: the penalties count the reply's own tokens. `STRATA_PENALTY_PROMPT=1` restores the old window for
comparison. Measured with a prompt that names a colour fourteen times and then asks for it, greedy,
`penalty_last_n=512 penalty_freq=2`: the old window answered "Answer with a single word or phrase without any
additional text" — the colour itself was penalised — and the reply-only window answered "Answer: teal." Same weights,
same settings, one variable. It is a smoke test of the window, not a benchmark: the model does not reliably answer
with one word in either.

**Nothing changes when no penalty is set** (the engine's default is `penalty_last_n = 0`), so the speed numbers and the
sixteen-prompt suite are unaffected; the suite is re-run with each engine build anyway.

## What this does and does not cover

- **Covers:** does the model still answer the question, in the right language, with the asked shape; does code it
  writes run; does it call the tools in the right order; does it find three facts across ~18K tokens.
- **Does not cover:** reasoning depth, multi-turn consistency, retrieval over 32K, a tool loop that has to run for
  real, and anything where a wrong answer looks plausible. Those are what a fuller gate would add.
- **A failure is a prompt to look, not a verdict:** two of the first runs "failed" only because a correct palindrome
  used `split()` instead of `replace()` and because Fibonacci was 0-based. The checks were widened; the answers were
  right. The v2 gate found two of its own bugs the same way: `math_change` expected 6.40 for a sum that is 11.40 (the
  model was right, the check was not), and `json_calls` read a nested `arguments` object as a broken JSON object.

## Next

- Run this suite after every speed change and compare the pass counts, per model.
- Add the domains it lacks: a 32K-token needle with several facts, a tool loop over three calls, a Python snippet that
  must run.
- Give Flint's Russian prompt a second form to see whether the instability is the language or the instruction shape.
