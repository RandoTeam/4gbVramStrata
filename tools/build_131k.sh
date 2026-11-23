#!/bin/sh
# Compatibility wrapper around tools/build_dev.sh.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
exec sh "$ROOT/tools/build_dev.sh" "$@"
