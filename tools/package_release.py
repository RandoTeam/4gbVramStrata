#!/usr/bin/env python3
"""Build a 4gbVramStrata release archive for Linux x86-64 (.tar.gz) or Windows x86-64 (.zip).

The archive contains the user entrypoints (setup.sh / START-HERE.bat, setup.py, server, web UI, tools, docs),
engine-fourgbvram/ (strata-fourgbvram[.exe], strata-vision[.exe], and BUILD.json), and the engine sources because
setup.source_hash() checks them at startup: without the sources a user checkout would treat BUILD.json as stale and
recompile.  Tests, benchmark records, the paper, local build folders, and quarantined files (_attic/) stay out.

    python tools/package_release.py                               # current OS defaults
    python tools/package_release.py --platform linux-x64          # dist/4gbVramStrata-v<version>-linux-x64.tar.gz
    python tools/package_release.py --platform windows-x64        # dist/4gbVramStrata-v<version>-windows-x64.zip
    python tools/package_release.py --check                       # verify required files, write nothing
    python tools/package_release.py --check --no-engine           # verify source tree only (CI)

The version comes from CMakeLists.txt (`project(strata VERSION x.y.z)`).
"""
from __future__ import annotations

import argparse
import os
import re
import shutil
import sys
import tarfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

COMMON_FILES = [
    "setup.py", "fourgbvramstrata.py", "chat.py",
    "requirements.txt", "LICENSE", "README.md",
]
PLATFORM_FILES = {
    "linux-x64": ["setup.sh", "update.sh", "bench.sh"],
    "windows-x64": ["START-HERE.bat", "SETUP.bat", "UPDATE.bat", "BENCH.bat"],
}
TREES = ["serve", "tools", "data", "docs", "bench/quality", "bench/speed"]
SOURCES = ["CMakeLists.txt", "cmake", "src", "include", "third_party/ggml", "third_party/strata-ggml",
           "third_party/zstd-dec", "ref/tqp", "tools/vision"]
SKIP_DIRS = {"__pycache__", ".pytest_cache", "paper", "superpowers"}
SKIP_NAMES = {"test_setup_golden.json"}
SKIP_PREFIXES = ("test_",)
BASE_SKIP_SUFFIXES = ("_test.py", ".pyc", ".pyo", ".tmp", ".obj", ".exp", ".lib", ".pdb", ".log")


def default_platform() -> str:
    return "windows-x64" if os.name == "nt" or sys.platform == "win32" else "linux-x64"


def version() -> str:
    text = (ROOT / "CMakeLists.txt").read_text(encoding="utf-8")
    m = re.search(r"project\(\s*strata\s+VERSION\s+([0-9.]+)", text)
    if not m:
        raise SystemExit("CMakeLists.txt has no project(strata VERSION x.y.z)")
    return m.group(1)


def wanted(rel: Path, platform: str) -> bool:
    if any(part in SKIP_DIRS for part in rel.parts):
        return False
    name = rel.name
    if name in SKIP_NAMES or name.startswith(SKIP_PREFIXES) or name.endswith(BASE_SKIP_SUFFIXES):
        return False
    if platform == "linux-x64" and name.endswith(".bat"):
        return False
    return True


def tree_files(tree: str, platform: str = "linux-x64") -> list[Path]:
    base = ROOT / tree
    out: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for name in sorted(filenames):
            rel = Path(dirpath, name).relative_to(ROOT)
            if wanted(rel, platform):
                out.append(rel)
    return out


def source_files() -> list[Path]:
    """Every file under SOURCES, unfiltered: setup.source_hash() covers all of them."""
    out: list[Path] = []
    for part in SOURCES:
        base = ROOT / part
        if base.is_file():
            out.append(Path(part))
        elif base.is_dir():
            out += [p.relative_to(ROOT) for p in sorted(base.rglob("*")) if p.is_file()]
    return out


def engine_files(engine: Path, platform: str = "linux-x64") -> list[Path]:
    if not engine.is_dir():
        return []
    win = platform == "windows-x64"
    out: list[Path] = []
    for p in sorted(engine.iterdir()):
        if not p.is_file():
            continue
        if p.name == "BUILD.json":
            out.append(Path("engine-fourgbvram", p.name))
        elif win and p.name in ("strata-fourgbvram.exe", "strata-vision.exe"):
            out.append(Path("engine-fourgbvram", p.name))
        elif not win and not p.name.endswith(".exe") and p.name.startswith(("strata-fourgbvram", "strata-vision")):
            out.append(Path("engine-fourgbvram", p.name))
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--platform", choices=("linux-x64", "windows-x64"), default=default_platform(),
                    help="target release platform (default: current OS)")
    ap.add_argument("--check", action="store_true", help="list problems, write nothing")
    ap.add_argument("--no-engine", action="store_true",
                    help="check the tree only: do not require the compiled engine in --engine DIR (CI has no card to "
                         "build one). Every other required file is still checked")
    ap.add_argument("--engine", default=str(ROOT / "engine-fourgbvram"),
                    help="folder with strata-fourgbvram[.exe], strata-vision[.exe], and BUILD.json "
                         "(default: engine-fourgbvram/)")
    ap.add_argument("--out", default=str(ROOT / "dist"), help="output folder for the staged directory and archive")
    a = ap.parse_args(argv)

    ver = version()
    release_name = f"4gbVramStrata-v{ver}-{a.platform}"
    dist = Path(a.out).resolve()
    stage = dist / release_name
    win = a.platform == "windows-x64"
    archive_path = dist / f"{release_name}.{'zip' if win else 'tar.gz'}"

    req_files = PLATFORM_FILES[a.platform] + COMMON_FILES
    missing = [f for f in req_files if not (ROOT / f).is_file()]
    plan = [Path(f) for f in req_files if (ROOT / f).is_file()]
    for tree in TREES:
        if not (ROOT / tree).is_dir():
            missing.append(tree + "/")
        plan += tree_files(tree, a.platform)
    missing += [s + ("/" if (ROOT / s).is_dir() else "") for s in SOURCES if not (ROOT / s).exists()]
    plan += source_files()
    plan = list(dict.fromkeys(plan))                 # tools/vision arrives from TREES and SOURCES alike

    eng_dir = Path(a.engine)
    eng = engine_files(eng_dir, a.platform)
    if not a.no_engine:
        exe_name = "strata-fourgbvram.exe" if win else "strata-fourgbvram"
        vexe_name = "strata-vision.exe" if win else "strata-vision"
        if not any(p.name == exe_name or (not win and p.name.startswith("strata-fourgbvram")) for p in eng):
            missing.append(f"{eng_dir.name}/{exe_name}")
        if not any(p.name == vexe_name or (not win and p.name.startswith("strata-vision")) for p in eng):
            missing.append(f"{eng_dir.name}/{vexe_name}")
        if not any(p.name == "BUILD.json" for p in eng):
            missing.append(f"{eng_dir.name}/BUILD.json")

    print(f"release: {release_name}")
    print(f"files:   {len(plan)} from the tree (the engine's sources included), {len(eng)} from {eng_dir.name}/")
    if missing:
        print("missing:")
        for m in missing:
            print(f"  ! {m}")
        if a.check:
            return 1
        raise SystemExit("a required file is missing: fix the tree (or pass --engine DIR) and run again")
    if a.check:
        print("ok: every required file is present")
        return 0

    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir(parents=True)
    for rel in plan + eng:
        src = ROOT / rel if rel.parts[0] != "engine-fourgbvram" else eng_dir / rel.name
        dst = stage / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)

    archive_path.parent.mkdir(parents=True, exist_ok=True)
    if win:
        with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for p in sorted(stage.rglob("*")):
                if p.is_file():
                    zf.write(p, p.relative_to(dist).as_posix())
    else:
        with tarfile.open(archive_path, "w:gz", compresslevel=6) as tf:
            for p in sorted(stage.rglob("*")):
                if p.is_file():
                    tf.add(p, p.relative_to(dist), recursive=False)
    print(f"ready: {archive_path} ({archive_path.stat().st_size / 2**20:.1f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
