<div align="center">

# 4gbVramStrata

**Run 35B and 40B mixture-of-experts models on a laptop with a 4 GB graphics card.**

No cloud · No API key · Nothing leaves the machine

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)
[![VRAM](https://img.shields.io/badge/VRAM-4%20GB-76B900?style=for-the-badge&logo=nvidia&logoColor=white)](#measured-on-a-4-gb-laptop)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%C2%B7%20Ubuntu%2026.04-E95420?style=for-the-badge&logo=ubuntu&logoColor=white)](#install)
[![Engine](https://img.shields.io/badge/Donor%20engine-v0.1.45--poly.10-2E7D32?style=for-the-badge)](docs/BENCH-4GB.md)
[![Quality gate](https://img.shields.io/badge/Quality%20gate-22%2F22%20%C2%B7%2021%2F22-1F6FEB?style=for-the-badge)](docs/QUALITY-4GB.md)
[![💖 Support](https://img.shields.io/badge/💖_Support_the_Developer-Donate-FF69B4?style=for-the-badge)](#support-the-solo-developer)

---

<p align="center">
  <a href="#measured-on-a-4-gb-laptop"><b>Measured</b></a> •
  <a href="#the-models"><b>Models</b></a> •
  <a href="#install"><b>Install</b></a> •
  <a href="#use-it"><b>Use it</b></a> •
  <a href="#how-it-works"><b>How it works</b></a> •
  <a href="#benchmarks"><b>Benchmarks</b></a> •
  <a href="#support-the-solo-developer"><b>Support</b></a> •
  <a href="#credits-and-license"><b>Credits and license</b></a>
</p>

</div>

---

> [!IMPORTANT]
> **Built for the card nobody else targets.** [PolyStrata](https://github.com/VecSzn/PolyStrata) states **8 GB or
> more** for its mixture-of-experts models and 12 GB for Qwen3.8-Flash-Next; [Strata](https://github.com/Niko1221/Strata)
> was measured on 12 GB and larger cards. Both are excellent, and both were tuned where the model nearly fits in VRAM.
> This fork follows the same engine line and re-measures it on one **4 GB** laptop — so every number here comes from
> that laptop, with its log, rather than inherited from a workstation through a fork.

> [!TIP]
> **Already own the hardware?** A 35B model answers at **43 tokens/s** on a 4 GB RTX 3050 Laptop — one card, 32 GB of
> RAM, no second GPU and no cloud. [Skip to the numbers ↓](#measured-on-a-4-gb-laptop)

---

## Why this exists

A 35B mixture-of-experts model has about 35 billion parameters but uses only 3 billion of them for any one token. The
rest sit still. That is the opening this project takes: keep the whole model in the PC's memory, keep the few experts
that the next token needs in the graphics card, and let the CPU compute what does not fit.

**A 4 GB card is enough, because it never has to hold the model — only the hottest slice of it.**

That argument is easy to write and hard to prove. So this fork does the boring part: it measures. Every speed row is a
saved prompt, eight runs on a quiet machine, and a line in an append-only log with the engine's SHA-256. A claim that
did not reproduce is marked as not reproduced beside the number that replaced it, never quietly rewritten. What the
gate found is in [docs/QUALITY-4GB.md](docs/QUALITY-4GB.md).

## Measured on a 4 GB laptop

Reference machine: **RTX 3050 Laptop (4 GB, `sm_86`), Ryzen 5 5500U (6 cores, 12 threads), 32 GB DDR4-3200**, on
Ubuntu 26.04 with a locally compiled engine (CUDA 13.3). The Windows rows are kept as history. **A chat request to the
server — what a person actually uses** — is a saved prompt of about 1,900 tokens that ends in a question, 128 new
tokens, 32K context, eight runs on a quiet machine. Median, with the range:

| Model | File | Reads the prompt | **Answers** | Experts in VRAM |
| --- | ---: | ---: | ---: | ---: |
| Clover-35B-A3B-Preview APEX-I-NANOPLUS | 12.6 GB | **546 tokens/s** | **43.2 tokens/s** | 791–895 of 10,240 |
| Gemma 4 26B-A4B QAT-UD-Q4_K_XL | 14.7 GB | **524 tokens/s** | **39.0 tokens/s** | 178 of 3,840 |
| Clover APEX-I-NANOPLUS, Windows 11 (history) | 11.7 GB | 449 tokens/s | 38.1 tokens/s | 529 of 10,240 |
| Flint 40B-A2.5B UD-Q3_K_XL, Windows 11 (history) | 17.2 GB | 331 tokens/s | 21.9 tokens/s | 518 of 12,032 |

**Three findings worth your time, each with the reason:**

- **Gemma 4 starts here even though the installer calls it too big.** 25 of its 30 attention layers keep a 1,024-token
  sliding window, so its caches cost 0.84 GiB at 32K — not the 5.5 GiB a dense count gives. That is the whole
  difference between "does not fit" and 39 tokens/s. ([the arithmetic](docs/BENCH-4GB.md#gemma-4-26b-a4b-qat-ud-q4-k-xl-2026-11-20-the-third-model-and-the-one-setup-said-was-too-big))
- **Depth is where a small card really loses.** Gemma reads a 32K-deep prompt at 286 tokens/s against Clover's 668,
  because its expert cache *shrinks* to 100 experts while Clover's grows to 1,019. A 26B model that caches a tenth as
  many experts does not survive a long conversation on 4 GB, and no setting fixed that. ([why](docs/BENCH-4GB.md))
- **The two engines measure the same.** The fork's update to the donor's newest engine cost nothing measurable here
  (44.5 against 43.2 tokens/s, inside the range), which is stated openly rather than sold as a win.
  ([the pairs](docs/BENCH-4GB.md#poly7--poly10-2026-11-20-the-engine-updated-the-numbers-did-not-move))

This table is a ~1,900-token prompt with a **32K context setting**, not a 32K-deep prompt. The depth test is
`./bench.sh --long`: it reads about 32,000 tokens at 4K, 16K and 32K and answers 24 tokens at each depth
([the suite](docs/BENCH-4GB.md)). On this laptop the 32K row is the slow one.

Every number, its log, the settings measured one at a time, what a conversation costs as it grows to 32K, and what was
**not** measured: **[docs/BENCH-4GB.md](docs/BENCH-4GB.md)**.

## The models

Twelve models, each from the vendor's own GGUF or a well-known quantizer's. **Three are measured on 4 GB here**; the
rest are listed with what the installer estimates for this card. Details, quant sizes, vendor scores and sources:
**[docs/MODELS-4GB.md](docs/MODELS-4GB.md)**.

| Model | Parameters | Smallest file | On a 4 GB card |
| --- | --- | ---: | --- |
| **Clover-35B-A3B-Preview** (DiffuSpace) | 35B / 3B active | 13 GB | ✅ **measured**, 43.2 tokens/s |
| **Gemma 4 26B-A4B QAT** (Google) | 26B / 3.8B active | 15 GB | ✅ **measured**, 39.0 tokens/s at 32K |
| **Flint 40B-A2.5B** (Recursive) | 40B / 2.5B active | 18 GB | ✅ **measured**, 21.9 tokens/s |
| **LFM2.5-24B-A2B** (Liquid AI) | 24B / 2B active | 11 GB | 🟡 should start; not run here |
| **Ornith 1.5-35B-A3B** (ornith-ai) | 35B / 3B active | 14 GB | 🟡 the smallest size should start; not run here |
| **MiniCPM-V 4.7 35B-A3B** (OpenBMB) | 35B / 3B active | 16 GB | 🟡 should start; not run here |
| **Qwen3.6-35B-A3B** (Qwen) | 35B / 3B active | 13 GB | ❌ 4.2 GB before any expert |
| **Tiel Coder 35B-A3B** (peculiar-ragdoll) | 35B / 3B active | 14 GB | ❌ 4.4 GB before any expert |
| **Kolibri 1** (Aleph Alpha) | 78B / 3.5B active | 29 GB | ❌ 4.1 GB before any expert |
| **GLM 5.3 Flash** (Zhipu) | 320B / 18B active | 79 GB | ❌ needs a 32 GB card |
| **DeepSeek V4 Flash** (DeepSeek) | 284B / 13B active | 91 GB | ❌ needs a 32 GB card |
| **Qwen3.8-Flash-Next** (Qwen) | 125B / 6B + 51B n-gram | 58 GB | ❌ needs a 12 GB card and 32 GB of RAM |

"Before any expert" is what a size takes in VRAM for its dense weights, attention caches and buffers. A card that has
that much left over starts, with a smaller expert cache. **That estimate is a floor, not a verdict** — Gemma 4 is
listed as 4.1 GB and runs here anyway, because its caches are far smaller than the estimate assumes. The table's honest
version, with every official quant of every model against this exact PC, is
**[docs/COMPATIBILITY-LINUX.md](docs/COMPATIBILITY-LINUX.md)**.

## Install

**Linux:** Ubuntu 22.04 / 24.04 / 26.04 or Debian 12 / 13, 64-bit. An NVIDIA RTX 20 series card or newer, driver 580
or newer. 16 GB of RAM runs the smaller models, 32 GB the ones measured above. Python 3.10 or newer: `./setup.sh`
installs what is missing, including the CUDA Toolkit when it has to compile the engine.

```bash
git clone https://github.com/RandoTeam/4gbVramStrata.git
cd 4gbVramStrata
./setup.sh
```

1. On the first run `./setup.sh` checks the PC, offers the models that fit, downloads one, writes its run config and
   starts the server.
2. Later runs start what is installed. `./setup.sh --setup` asks again — another model, another size, another context.
   Setup writes a `run-<model>.sh` per installed model: one command, no questions.
3. For a start with no questions: `./run-clover-apex-i-nanoplus.sh`.

Unlike the Windows release there is no prebuilt Linux engine: setup compiles `strata-fourgbvram` once for your card
(5–20 minutes). Nothing else needs a compiler.

This repository is **Linux-only**. The original public fork,
[RandoTeam/4gbVramStrata](https://github.com/RandoTeam/4gbVramStrata), keeps the Windows launchers and the prebuilt
Windows engine.

## Use it

The server speaks both API dialects at once, so most tools work by changing one address:

| | |
| --- | --- |
| OpenAI | `http://127.0.0.1:8080/v1` — `/chat/completions`, `/completions`, `/models`, tool calls, streaming |
| Anthropic | `http://127.0.0.1:8080/v1/messages` — what Claude Code speaks |
| Web app | `http://127.0.0.1:8080` — chat, model switch, live monitor |
| MCP | [docs/MCP_SERVER.md](docs/MCP_SERVER.md) — install, start, stop and switch from an AI assistant |

Any API key works (a local server checks none). Point an agent at the address and it behaves like a hosted model, with
two differences: it is slower on the first token of a long prompt, and it lives on your desk.

## How it works

The engine (`strata-fourgbvram`, in `src/fourgbvram/`) reads the model's GGUF file in place. The dense weights, the
attention caches and one slot per cached expert live in VRAM; every other expert stays in the file, which the operating
system caches in RAM. Each token routes to a handful of experts per layer. The engine copies the ones it does not hold
into the slots of the ones it uses least, over PCIe, while the answer is being written — that copy is the price of a
small card, and most of this project's work is making it cheaper and spending it on the right experts.

A second engine, `strata` (`src/`, `include/`), runs Qwen3.8-Flash-Next and comes unchanged from Strata.

## Benchmarks

| Page | What it answers |
| --- | --- |
| [docs/BENCH-4GB.md](docs/BENCH-4GB.md) | How fast, with which settings, on which prompt — and what did not reproduce |
| [docs/MEMORY-4GB.md](docs/MEMORY-4GB.md) | Where the bytes live: VRAM, RAM and SSD, per model and per token |
| [docs/QUALITY-4GB.md](docs/QUALITY-4GB.md) | The 22-prompt gate run after every speed change, and what it caught |
| [docs/COMPATIBILITY-LINUX.md](docs/COMPATIBILITY-LINUX.md) | Every official model and quant against this 4 GB Linux PC |
| [docs/INDEX.md](docs/INDEX.md) | Which page answers what, and which numbers are ours rather than inherited |

## Something went wrong?

- **The card seems to be the problem.** Another program is using the VRAM: close browsers with hardware acceleration,
  other model servers, anything with a GPU view. One model at a time on 4 GB.
- **The answer is much slower than the table above.** The expert cache started empty (a card just under the size) or
  another process took the VRAM. The start prints how many experts it holds; the log of the last run is
  `strata-<model>.log` beside the program.
- **The start failed, or a port is taken.** [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) has the table; the first
  lines of `strata-<model>.log` usually name the cause. To free the card:
  `./stop-server.sh` stops this folder's server and engine.

## Support the solo developer

Everything here — the engine tuning, the installer, the server, twelve models' compatibility work and every number
with its log — is done by **one person on one laptop**. There is no company, no cloud bill and no paid tier: the whole
point is that the hardware you already own is enough.

If this project saves you an upgrade you were about to buy, a contribution pays for the one thing that makes these
numbers trustworthy — **time on the reference card, disks for the model files, and the electricity of measuring instead
of guessing.**

**T-Bank** (SBP / cards, Russia and CIS): [www.tbank.ru/cf/9YuuZydrQlI](https://www.tbank.ru/cf/9YuuZydrQlI) ·
**Kaspi Bank** (Kazakhstan): `+7 707 390-30-49` · **Crypto** (USDT TRC-20, BTC, ETH): [DONATION.md](DONATION.md)

**[Every address, and what a contribution buys →](DONATION.md)**

What it does **not** buy: priority, private builds, or influence over a measurement. A number here changes when a run
says so, and not before.

**Support the projects this fork stands on, too.** They are maintained by one person each, and this fork exists only
because of them — if you can fund one project, fund the upstream first:

- **Strata** by [Niko1221](https://github.com/Niko1221) — [GitHub Sponsors](https://github.com/sponsors/Niko1221) ·
  [Buy Me a Coffee](https://buymeacoffee.com/strataengine)
- **[PolyStrata](https://github.com/VecSzn/PolyStrata)** by [VecSzn](https://github.com/VecSzn) — the engine line this
  fork follows

## Credits and license

**This fork stands on two projects, and neither is a dependency to be hidden:**

- **[PolyStrata](https://github.com/VecSzn/PolyStrata)** by **[VecSzn](https://github.com/VecSzn)** — the engine line
  this fork follows (`v0.1.45-poly.10`). Its MoE execution model, the expert cache, the server and the installer design
  are theirs. This fork's update to their newest engine is merged commit for commit, and whenever their change does not
  help on 4 GB, that is written down instead of spun.
- **[Strata](https://github.com/Niko1221/Strata)** by **[Niko1221](https://github.com/Niko1221)** — the project that
  [PolyStrata](https://github.com/VecSzn/PolyStrata) is itself built on. The second engine (`strata`, which runs
  Qwen3.8-Flash-Next), the installer, the server and the web app come from here.

Without those two projects this fork would be a wish. What this fork adds is the part they do not do: **a 4 GB target,
and the measurement discipline to prove it** — a saved prompt, eight runs, an append-only log, a 22-prompt gate before
any speed claim, and a page that says which numbers were measured here and which were inherited.

**Models keep their own licenses, and this repository redistributes none of them.** Setup downloads each file from its
author on first run. The licences as stated by the authors, checked on 2026-11-20:

| Model | The author's licence |
| --- | --- |
| Clover-35B-A3B-Preview ([DiffuSpace](https://huggingface.co/maternion/Clover-35B-A3B-Preview-GGUF)) | Apache-2.0 |
| Gemma 4 26B-A4B ([unsloth](https://huggingface.co/unsloth/gemma-4-26B-A4B-it-qat-GGUF)) | Apache-2.0 |
| Ornith 1.5 35B-A3B ([mudler](https://huggingface.co/mudler/Ornith-1.5-35B-A3B-APEX-MTP-GGUF)) | Apache-2.0 |
| Qwen3.8-Flash-Next ([Qwen](https://huggingface.co/unsloth/Qwen3.8-Flash-Next-GGUF)) | its own terms ("other") — read them before use |

The other models in the table are listed by `setup.py` with their download sources; their repositories state their own
terms, and this project does not relicense them.

**MIT.** The engine, this fork's changes and this documentation are under the [MIT License](LICENSE), which carries the
copyright of both donor projects and of this fork. Security reports:
[SECURITY.md](SECURITY.md).
