"""Compatibility wrapper around tools/package_release.py."""
from pathlib import Path
import sys

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

from package_release import (  # noqa: E402, F401
    ROOT,
    SOURCES,
    TREES,
    engine_files,
    main,
    source_files,
    tree_files,
    version,
)


if __name__ == "__main__":
    raise SystemExit(main())
