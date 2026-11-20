# Releasing 4gbVramStrata

The contract for every release this fork publishes. It exists because a release is where a speed claim, a platform
claim and a half-built binary do the most damage: a number that was not measured, or an engine built from another
commit than the one it names, is a wrong thing downloaded a thousand times.

AGENTS.md says what may be claimed; this page says how a release is cut, which platforms are built, and what must be
true before an asset is uploaded.

## Where this contract comes from

Two donor projects set the bar, and this fork follows their shape rather than inventing one:

| | What they ship | What this fork ships, and why |
| --- | --- | --- |
| [Strata](https://github.com/Niko1221/Strata) 0.2.17 | 34 assets: the app for Linux (`AppImage`), Windows (`setup.exe`), macOS (`dmg`); engines per backend — `cuda12`, `cuda13`, `hip-halo`, `hip-rx6000`, `hip-rx7900`, `hip-rx9070`, `sycl`, `metal`; `linux-aarch64` as well; `.sig` for each and a signed feed | The same shape, minus what this fork cannot test. **Every asset we publish, we build and run ourselves** — a downloaded engine we never started is a guess with a version number |
| [PolyStrata](https://github.com/VecSzn/PolyStrata) poly.10 | **1** asset: `strata-poly-windows-x64-<src>.zip`; Linux is compiled by setup on the user's PC | This is the line our engine comes from, and its single asset is why this fork exists: a 4 GB user compiles once and measures themselves |

**The rule that follows:** build what we can run, say "compile from source" everywhere else. No asset is published
for a platform this project has not started on. A missing download is a 20-minute wait; a wrong download is a bug
report nobody can reproduce.

## The platform matrix

`src/fourgbvram/` compiles for CUDA, HIP and Metal, and `setup.py --backend` offers `cuda`, `hip` and `sycl`. The matrix
below is that capability filtered by what this project has a machine to verify on.

| Platform | Backend | Ships as | Status |
| --- | --- | --- | --- |
| **Linux x86-64** | CUDA 13 | engine `.tar.gz` + the installer tarball | **Built and measured here** — this is the reference platform |
| **Linux x86-64** | CUDA 12 | engine `.tar.gz` | **Configured here, never built by this fork.** `setup.py --cuda 12` builds into `build-fourgbvram-cuda12` and adds `-DSTRATA_EXPERIMENTAL_SM60=ON`; no Pascal or Volta card has run it |
| **Linux x86-64** | HIP (RX 7900 / RX 9070 / RX 6000 / Strix Halo) | engine `.tar.gz` per card family | **Not shipped yet, and not built here.** The target `strata-fourgbvram` is registered under `STRATA_ENABLE_HIP` too, so the sources are meant to build; this fork has no AMD card, so it has never compiled or started the HIP engine. Say "build from source", do not ship it |
| **Windows x86-64** | CUDA 13 | engine `.zip` + the installer zip | **Shipped, not re-measured since poly.10.** Built on a Windows PC (no cross-compile from Linux: MSVC, `vcvars64.bat` and the CUDA toolkit are the release's tools) |
| **Windows x86-64** | HIP | engine `.zip` | **Not shipped**: same reason as Linux HIP |
| **Linux aarch64** | CUDA 13 | engine `.tar.gz` | **Not shipped**: no ARM machine here. Strata ships it; we do not |
| **macOS arm64** | Metal | engine `.tar.gz` | **Not shipped**: `metal/` has this fork's `src/fourgbvram/` port, but nothing has run it on a Mac. Strata ships a `dmg`; that is its app, not our engine |
| Intel (SYCL) | SYCL | — | **Not shipped**: `setup.py` offers it; it is the donor's, unverified here |

A row moves to "shipped" only with the run that justifies it written down: a card, a model, a context, a speed and its
log. That is not bureaucracy — it is the only way "works on Linux and Windows" stays true.

## What a release must contain

1. **The engine, built from the commit the release is named for.** `BUILD.json` carries `src` = `source_hash()` of
   `CMakeLists.txt`, `cmake/`, `src/`, `include/`, `third_party/ggml`. `setup.py` refuses a ready-made engine whose
   hash is not its own checkout's, so a stale asset cannot be installed by accident.
2. **The name is the contract.** `strata-fourgbvram-<platform>-<arch>-<src>.{zip,tar.gz}` — the name
   `setup.fourgbvram_asset()` asks for. An asset under another name is never found.
3. **CUDA architectures of the build, named** in the release notes (`sm_75`, `sm_86`, `sm_89`, `sm_120`; the
   CUDA 12 asset would add `sm_60`–`sm_70` with the experimental flag — none has been built by this fork yet).
4. **The installer tarball** for the platform (`setup.sh` / `START-HERE.bat`, `setup.py`, `serve/`, `tools/` setup
   runs, `docs/` a user reads, and the engine's source — `setup.source_hash()` walks it, so a tarball without it
   makes setup recompile).
5. **The tag** `v<VERSION>-lowvram-4gb-<qualifier>` on exactly the commit that was built, pushed to all remotes.
6. **The numbers**, moved with [BENCH-4GB.md](BENCH-4GB.md): a release that changes a speed claim is rebuilt from the
   commit that changed the number.
7. **What is not measured**, said in the notes: the platform, the card, the model. "Not re-measured since poly.10" is
   a sentence a release may carry; silence is not.

## The order of work

    # 1. the tree is clean and the tests pass, on the platform being released
    git status --porcelain          # nothing uncommitted: the tag must name the built commit
    .venv/bin/python -m unittest discover -s tools -p "test_setup_*.py"
    .venv/bin/python tools/brand_names.py --check
    .venv/bin/python tools/rename_fourgbvram.py --check

    # 2. the gate: a release that moves a speed or a setting ships with it
    ./bench.sh --long --runs 3                     # 4K / 16K / 32K, fresh prompts
    .venv/bin/python bench/speed/run.py --config strata-<model>.json --model <name> --task chat --runs 8
    .venv/bin/python bench/quality/run.py --model local --repeat 2      # 22 prompts, two attempts each

    # 3. the engine and the tarball
    .venv/bin/python tools/make_fourgbvram_release.py OUT_DIR      # portable engine + BUILD.json
    .venv/bin/python tools/package_release_131k.py --check         # allowlist: what is missing or left out
    .venv/bin/python tools/package_release_131k.py                 # dist/…-linux-x64.tar.gz

    # 4. the tag, on the commit that was built
    git tag -a v<VERSION>-lowvram-4gb-<qualifier> -m "<what this release is, the numbers, the gate>"
    git push <remote> v<VERSION>-lowvram-4gb-<qualifier>

    # 5. the release note: the table from docs/BENCH-4GB.md, the platforms built, and what was not measured

## Two rules that have already cost this project a day

- **Never measure while a build runs.** The same gate read 27.5 tokens/s quiet and 15.9 during a CUDA build.
- **A number that did not reproduce is marked beside the number that replaced it**, never rewritten in place. The
  release note inherits that rule: if a release contradicts a published figure, the note says so.

## What is deliberately not here

- **No CI that builds engines.** A hosted runner has no 4 GB card, so it cannot produce a number; and a CUDA build
  for `sm_86` on a shared runner proves only that it compiles, which `tools/build_131k.sh` proves locally in less
  time. What CI is for here is the part that does catch bugs without a card: the 784 `test_setup_*` tests, the brand
  and rename checks, and `package_release_131k.py --check`. That is a `linux.yml` this fork can add without pretending
  to measure anything — see the next section.
- **No signed feeds, no `.sig`.** Strata signs its assets; this fork does not. `setup.py` checks a downloaded engine
  against the size and SHA-256 GitHub's release API publishes for that asset, and `verify_engine_archive` states what
  that does not cover in its own docstring: a digest proves the bytes are the ones GitHub released, not that they are
  honest. A hash pinned in `setup.py` per release is the only thing that closes that, at a commit per release, and
  Strata's `.sig` files are the stronger version of the same idea. Neither exists here yet, and `docs/RELEASE.md`
  says so rather than calling a checksum a signature.
- **No cross-compilation.** A Windows engine is built on Windows. `tools/build_131k.bat` used to exist here and was
  removed as stale; when a Windows asset is rebuilt, it is rebuilt with `setup.py` on a Windows PC, by the same
  configure line, and its `BUILD.json` names the commit.
