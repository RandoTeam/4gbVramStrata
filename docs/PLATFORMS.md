# Platforms: what this project builds, what CI proves, and what it does not

One table, checked on 2026-11-21 against the two workflows in `.github/workflows/` and the source itself. Every cell
says what stands behind it: a CI run, a measurement, or nothing yet.

**The rule that makes this page worth reading:** *compiles in CI*, *runs on the hardware* and *ships as a download* are
three different states, and a release only ever claims the third when the second is true (docs/RELEASE.md). This fork
has one machine: an RTX 3050 Laptop, 4 GB, x86-64 Linux. Everything else is a compile or nothing.

## The matrix

| Platform | Backend | Compiles in CI | Started on real hardware | Ships as a download |
| --- | --- | :---: | --- | :---: |
| **Linux x86-64** | CUDA 13 | ✅ `cuda13` job, 16m | ✅ **measured on this laptop** | ✅ |
| **Linux x86-64** | CUDA 12 (Pascal/Volta) | ✅ `cuda12` job, 14m — *first ever on 2026-11-21* | ❌ no such card here | ❌ |
| **Linux x86-64** | HIP (gfx1100, gfx1201) | ✅ `hip` job, 7m — *first ever* | ❌ no AMD card here | ❌ |
| **Windows x86-64** | CUDA 13 | ❌ **impossible on GitHub's runners** (no CUDA toolkit in the images, see below) | ⚠️ measured before poly.10 | ✅ (prebuilt `.exe` per release) |
| **Windows x86-64** | HIP | ❌ same reason | ❌ | ❌ |
| **macOS arm64** | Metal | ✅ `metal` job on macos-26, 1m — *first ever* | ❌ no Mac here | ❌ |
| **Linux aarch64** | CUDA 13 | ✅ `aarch64` job on `ubuntu-24.04-arm`, 5m50s — *first ever on 2026-11-21* | ❌ no ARM machine here | ❌ |
| **Linux x86-64** | SYCL (Intel Arc) | ❌ not a backend of this engine | ❌ | ❌ |
| **Android** | — | ❌ **not possible, and not a build problem** | ❌ | ❌ |
| **Any** | CPU only | ❌ the engine's target does not exist without a GPU backend | — | ❌ |

### What the CI jobs actually run

`.github/workflows/backends.yml`, four jobs, each configuring with the release's own lines from `setup.py`:

| Job | Runner | Configure | Proves |
| --- | --- | --- | --- |
| `cuda13` | `nvidia/cuda:13.0.2-devel-ubuntu24.04` | `sm_75;86;89;120` | the shipped CUDA path compiles for the cards the release names |
| `cuda12` | `nvidia/cuda:12.9.1-devel-ubuntu24.04` | `sm_60;61;70;86` + `STRATA_EXPERIMENTAL_SM60=ON` | `--cuda 12` compiles at all |
| `hip` | `rocm/dev-ubuntu-24.04:7.2.4-complete` | `gfx1100;gfx1201`, `STRATA_ENABLE_CUDA=OFF` | the AMD engine compiles |
| `metal` | `macos-26` | every target, `METAL_CPP_DIR` + `STRATA_GGML_DIR` | the Metal kernels and the parity tests compile |

They found three defects in their first hours, all real: a CUDA-only constant (`CU_MEM_LOCATION_TYPE_HOST`) in the
4 GB host-KV fallback that HIP does not define, an `MTLGPUFamilyMetal4` name only the macOS 26 SDK has, and the Metal
tree needing a llama.cpp checkout that a fresh clone does not carry. All three are fixed. Compiling still proves only
compiling.

## Windows CUDA: why CI cannot build it, in one paragraph

GitHub's `windows-2025` image has Visual Studio 2022 and no CUDA toolkit (checked in its own published
`Windows2025-Readme.md`: no NVIDIA entry). Unlike Ubuntu, there is no container that supplies MSVC + `nvcc` on Windows
the way `nvidia/cuda` does on Linux, so a Windows CUDA job cannot exist here. **What Windows does cover** is the setup
suite: 784 tests green on `windows-latest` (`.github/workflows/checks.yml`). The Windows engine itself is built on the
maintainer's PC with `setup.py`, as `docs/RELEASE.md` says. And a CUDA-less Windows build is not an alternative:
`strata-fourgbvram` is registered only under `STRATA_ENABLE_CUDA OR STRATA_ENABLE_HIP` (CMakeLists.txt:2054), so such a
configure produces `strata_kernels_cpu` and `strata_spec` and **not the engine** - it would report green for
compiling nothing. Both were tried in the first draft of the workflow and removed.

## Linux aarch64: three lines away, and honest about it

`nvidia/cuda:13.0.2-devel` publishes an `arm64` image and GitHub hosts `ubuntu-24.04-arm` runners, so a job is
possible. What stops the build is three x86-only constructs in the engine's own sources, found by reading them:

| Where | What | State |
| --- | --- | --- |
| `src/fourgbvram/engine.cpp` | `#include <immintrin.h>` with nothing from it used but one `_mm_pause()` | **fixed 2026-11-21**: `src/fourgbvram/spin.hpp` gives `spin_pause()` as `_mm_pause` on x86, the `yield` instruction on aarch64, and nothing elsewhere |
| `src/fourgbvram/cpu_experts.cpp` | the same, three `_mm_pause()` calls | **fixed**, same header |
| `src/fourgbvram/stage_copy.hpp` | SSE2 streaming stores | **already portable**: guarded behind `__SSE2__ || _M_X64 || _M_IX86_FP`, falls back to `memcpy` |
| `src/kernels/cpu/*.cpp` (AVX2/AVX-512) | 11 files with real intrinsics | **does not block this engine**: `strata-fourgbvram` links `strata_fourgbvram_mmq`, `strata_kernels` (CUDA), `strata_spec` and `ggml-cpu` - **not** `strata_kernels_cpu`, which is the second engine's (`strata_qwen35`) and `strata_engine`'s |

**The job answered it on 2026-11-21 (run 44897805629): the whole engine compiles for arm64, in 5m50s.** Its first
run is also what found the last blocker, which was not in this fork's engine at all: four files of the donor's core
(`graph.cpp`, `session.cpp`, `mtp.cpp`, `verify.cpp`) included `<immintrin.h>` for exactly two intrinsics, `_mm_pause`
and `_mm_sfence`. `include/strata/core/cpu_hint.hpp` now maps that pair per architecture - PAUSE and SFENCE on x86,
`yield` and `dmb ishst` on aarch64, a release fence elsewhere - and the four files call it. This table's rule still
applies: **compiled, not run.** No ARM machine has started a model, so the row stays out of "ships as a download".

## Android: not a build target, and the reason is hardware

Asked directly, so answered directly: **an Android port of this engine is not possible, and this is not about tooling.**

- **The engine's entire premise is CUDA.** `strata-fourgbvram` reads a model from the GGUF, keeps the dense weights and
  a slice of experts in **CUDA VRAM**, and swaps the rest over **PCIe**, with `cuMemCreate`/`cuMemMap` and the CUDA
  driver API throughout (the HIP build is a shim over the same calls). Android phones have Adreno, Mali or PowerVR
  GPUs: **no CUDA, no ROCm, no PCIe link to a discrete card**. There is nothing for the engine to be a 4 GB version of.
- **What Android does have is `llama.cpp`**, with a CPU/NEON backend and OpenCL/Adreno work upstream. A phone's model
  would be an app around *that* - a different engine, a different memory model (unified memory, no expert cache to
  swap into), and a different project.
- **Neither donor does it.** Strata's tree has `app/desktop/src-tauri/icons/android/**` - launcher icons for a Tauri
  build of its **desktop** app - and no Android engine, kernel or backend anywhere. The engine line this fork follows,
  [PolyStrata](https://github.com/VecSzn/PolyStrata), mentions Android in neither its README nor its docs.
- **What this fork could offer a phone** is not an engine but a **server**: the API on `127.0.0.1:8080` speaks OpenAI
  and Anthropic, so an Android app can talk to a 4 GB laptop over the local network. That is a real, small piece of
  work - a client, not a port - and it belongs in its own project.

If the goal is "run a model on the phone itself", the honest answer is: that is `llama.cpp`'s Android path, not this
engine, and this project should not pretend otherwise.

## What is missing in this table, on purpose

- **Intel Arc / SYCL**: `setup.py --backend sycl` exists and `sycl/` is a separate CMake project. It builds **the
  donor's `strata` engine**, not `strata-fourgbvram` - `grep -rn fourgbvram sycl/` returns nothing - so it is not a
  backend of this engine and gets no row above the fold.
- **RISC-V, PowerPC, s390**: ggml has kernels for them; this engine's VMM path is CUDA's, so they are not candidates.
- **Two or more cards**: `--layer-split` exists and is the donor's; this fork has one card and has never run it.

## The next steps this page implies, in order of value

1. **A Windows CUDA build that CI can trust** - honestly: not possible on hosted runners. The alternative is a
   self-hosted Windows runner, which is a machine this project does not have. Until then the Windows row stays
   "shipped, not re-measured" and says so.
2. ~~**The aarch64 patch**~~ - **done on 2026-11-21**: the job compiles the whole engine for arm64 in 5m50s, which is
   still not "runs". Next would be a distribution that ships it, and that needs an ARM machine to start a model on.
3. **A 6 GB or AMD card in the loop** would let HIP and the 6 GB row leave the estimate column. That is hardware, not
   code.
