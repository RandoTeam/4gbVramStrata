#!/bin/sh
# Build the development engine (CUDA) on Linux and copy it into engine-fourgbvram/strata-fourgbvram.
#
#   ./tools/build_dev.sh                  # detect the card's compute capability (sm_86 for an RTX 3050)
#   STRATA_CUDA_ARCHS=86 ./tools/build_dev.sh
#   NVCC=/usr/local/cuda-13.3/bin/nvcc ./tools/build_dev.sh
#
# The normal way to build the engine is ./setup.sh; this script is for local incremental builds and dev testing.
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

BUILD_DIR=${STRATA_BUILD_DIR:-}
if [ -z "$BUILD_DIR" ]; then
  if [ -d build-131k ] && [ ! -d build-dev ]; then BUILD_DIR=build-131k; else BUILD_DIR=build-dev; fi
fi

echo "==================================================="
echo "Building strata-fourgbvram (dev) with CUDA on Linux"
echo "  nvcc:  $NVCC"
echo "  archs: $ARCHS"
echo "  build: $BUILD_DIR"
echo "==================================================="

"$CMAKE" -B "$BUILD_DIR" -G Ninja \
  -DCMAKE_MAKE_PROGRAM="$NINJA" \
  -DCMAKE_BUILD_TYPE=Release \
  -DSTRATA_ENABLE_CUDA=ON \
  -DSTRATA_BUILD_TESTS=OFF \
  -DCMAKE_CUDA_ARCHITECTURES="$ARCHS" \
  -DCMAKE_CUDA_COMPILER="$NVCC" \
  -DSTRATA_MMQ_KQUANTS=ON \
  -DSTRATA_Q6K_EXPERTS=ON

"$NINJA" -C "$BUILD_DIR" strata-fourgbvram

mkdir -p engine-fourgbvram
cp "$BUILD_DIR/strata-fourgbvram" engine-fourgbvram/strata-fourgbvram
chmod +x engine-fourgbvram/strata-fourgbvram
echo "[SUCCESS] engine-fourgbvram/strata-fourgbvram"
