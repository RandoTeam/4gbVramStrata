#!/bin/sh
# Build the development engine (the 131K tree, CUDA) on Linux into build-131k, then copy it beside the installed one
# as engine-fourgbvram/strata-fourgbvram-131k.  The Windows equivalent was tools/build_131k.bat.
#
#   ./tools/build_131k.sh                 # detect the card's compute capability (sm_86 for an RTX 3050)
#   STRATA_CUDA_ARCHS=86 ./tools/build_131k.sh
#   NVCC=/usr/local/cuda-13.3/bin/nvcc ./tools/build_131k.sh
#
# The normal way to build the engine is still ./setup.sh: this script is for a developer build of another target/arch.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$ROOT"

CMAKE=${CMAKE:-}
NINJA=${NINJA:-}
if [ -z "$CMAKE" ] && [ -x .venv/bin/cmake ]; then CMAKE=.venv/bin/cmake; fi
if [ -z "$NINJA" ] && [ -x .venv/bin/ninja ]; then NINJA=.venv/bin/ninja; fi
CMAKE=${CMAKE:-$(command -v cmake || true)}
NINJA=${NINJA:-$(command -v ninja || true)}
if [ -z "$CMAKE" ] || [ -z "$NINJA" ]; then
  echo "[ERROR] cmake and ninja are needed: run ./setup.sh once, or install them (pip install cmake ninja)" >&2
  exit 1
fi

ARCHS=${STRATA_CUDA_ARCHS:-}
if [ -z "$ARCHS" ]; then
  ARCHS=$(nvidia-smi --query-gpu=compute_cap --format=csv,noheader 2>/dev/null | head -1 | tr -d '. ')
fi
if [ -z "$ARCHS" ]; then
  echo "[ERROR] could not read the GPU's compute capability; set STRATA_CUDA_ARCHS (for example 86)" >&2
  exit 1
fi

NVCC=${NVCC:-$(command -v nvcc || true)}
if [ -z "$NVCC" ]; then
  for c in /usr/local/cuda*/bin/nvcc /opt/cuda*/bin/nvcc; do
    [ -x "$c" ] && NVCC=$c
  done
fi
if [ -z "$NVCC" ] || [ ! -x "$NVCC" ]; then
  echo "[ERROR] nvcc was not found: install the CUDA Toolkit (./setup.sh installs it when it has to)" >&2
  exit 1
fi

echo "==================================================="
echo "Building strata-fourgbvram (131K tree) with CUDA on Linux"
echo "  nvcc:  $NVCC"
echo "  archs: $ARCHS"
echo "  build: build-131k"
echo "==================================================="

"$CMAKE" -B build-131k -G Ninja \
  -DCMAKE_MAKE_PROGRAM="$NINJA" \
  -DCMAKE_BUILD_TYPE=Release \
  -DSTRATA_ENABLE_CUDA=ON \
  -DSTRATA_BUILD_TESTS=OFF \
  -DCMAKE_CUDA_ARCHITECTURES="$ARCHS" \
  -DCMAKE_CUDA_COMPILER="$NVCC" \
  -DSTRATA_MMQ_KQUANTS=ON \
  -DSTRATA_Q6K_EXPERTS=ON

"$NINJA" -C build-131k strata-fourgbvram

mkdir -p engine-fourgbvram
cp build-131k/strata-fourgbvram engine-fourgbvram/strata-fourgbvram-131k
chmod +x engine-fourgbvram/strata-fourgbvram-131k
echo "[SUCCESS] engine-fourgbvram/strata-fourgbvram-131k"
