"""The ready-made strata-fourgbvram for Linux and Windows: the engine and the image encoder strata-vision, built for
other PCs (STRATA_PORTABLE: ggml's CPU code for AVX2) and for every card from RTX 20 to RTX 50 with CUDA 13.x.  They
are packed with a BUILD.json under the name setup.py asks the latest release for (fourgbvram_asset()), which carries
the source_hash() of their source.

Run it on a clean checkout of the commit the release is made from, with setup's Python:

    .venv/bin/python tools/make_fourgbvram_release.py OUT_DIR          # Linux -> .tar.gz
    .venv\\Scripts\\python.exe tools\\make_fourgbvram_release.py OUT_DIR  # Windows -> .zip

and upload OUT_DIR/strata-fourgbvram-{linux-x64-*.tar.gz,windows-x64-*.zip} to that release.  The build folders stay
in OUT_DIR, so a second run compiles what changed."""
import hashlib
import io
import json
import subprocess
import sys
import tarfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import setup  # noqa: E402

ARCHS = [75, 80, 86, 89, 120]   # RTX 20, A100 and A-series, RTX 30, RTX 40, RTX 50


def main() -> int:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    out = Path(sys.argv[1]).resolve()
    # the hash covers every file under these paths, so a file git does not have would name a source no clone has
    dirty = subprocess.run(["git", "-C", str(ROOT), "status", "--porcelain", "--ignored", "--",
                            *setup.ENGINE_SOURCES, *setup.VISION_SOURCES], capture_output=True, text=True).stdout
    if dirty.strip():
        sys.exit("the engine sources are not those of a commit:\n" + dirty)
    nvcc, cuda_v = setup.find_nvcc()
    if nvcc is None or cuda_v < (13, 0):
        sys.exit(f"a CUDA 13.x nvcc is needed; found {cuda_v}")
    vcvars = setup.find_vcvars(cuda_v) if setup.WIN else None
    if setup.WIN and vcvars is None:
        sys.exit(f"Visual Studio vcvars64.bat is needed for CUDA {cuda_v[0]}.{cuda_v[1]}")
    defs = ["-DCMAKE_CUDA_ARCHITECTURES=" + ";".join(f"{a}-real" for a in ARCHS), f"-DCMAKE_CUDA_COMPILER={nvcc}",
            *setup.toolkit_root_defs(nvcc), "-DSTRATA_PORTABLE=ON"]
    fourgbvram, vis = out / "build-fourgbvram", out / "build-vision"   # GBs of CUDA objects for five cards: on OUT_DIR's disk
    for d in (fourgbvram, vis):
        d.mkdir(parents=True, exist_ok=True)
    setup.cmake_build(ROOT, fourgbvram, "strata-fourgbvram", ["-DSTRATA_ENABLE_CUDA=ON", "-DSTRATA_BUILD_TESTS=OFF", *defs],
                      vcvars, fourgbvram / "build.bat")
    setup.cmake_build(ROOT / "tools" / "vision", vis, "strata-vision", [f"-DLLAMA_DIR={setup.get_llama_cpp(vision=True)}",
                                                                        "-DSTRATA_VISION_CUDA=ON", *defs],
                      vcvars, vis / "build.bat")
    vexe = vis / "bin" / setup.VEXE
    if not vexe.is_file():
        sys.exit(f"missing built image encoder: {vexe}")
    src = setup.source_hash(setup.ENGINE_SOURCES)
    meta = {"source": "release", "version": setup.source_version(), "archs": ARCHS, "cuda": f"{cuda_v[0]}.{cuda_v[1]}",
            "src": src, "vision": "gpu", "vision_src": setup.source_hash(setup.VISION_SOURCES)}
    out.mkdir(parents=True, exist_ok=True)
    z = out / setup.fourgbvram_asset()
    if setup.WIN:
        with zipfile.ZipFile(z, "w", zipfile.ZIP_DEFLATED) as f:
            f.write(fourgbvram / setup.FOURGBVRAM_EXE, setup.FOURGBVRAM_EXE)
            f.write(vexe, setup.VEXE)
            f.writestr("BUILD.json", json.dumps(meta, indent=1))
    else:
        with tarfile.open(z, "w:gz") as f:
            f.add(fourgbvram / setup.FOURGBVRAM_EXE, setup.FOURGBVRAM_EXE, recursive=False)
            f.add(vexe, setup.VEXE, recursive=False)
            info = tarfile.TarInfo("BUILD.json")
            data = json.dumps(meta, indent=1).encode()
            info.size, info.mode = len(data), 0o644
            f.addfile(info, io.BytesIO(data))
    print(f"{z}\n  {z.stat().st_size:,} bytes, sha256 {hashlib.sha256(z.read_bytes()).hexdigest()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
