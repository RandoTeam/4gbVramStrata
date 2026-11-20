"""bench/speed/run.py reads only what this run appended to the model's log.

The offset it takes is a byte count (`Path.stat().st_size`), so the read that follows must be in bytes too. It
was a `read_text()[start:]`, which slices a string of *characters*: the log's own lines carry the config's paths, and
this repository's paths hold Cyrillic ("Документы"), so the byte count is larger than the character count and the
slice came out empty. Every run then ended with "no serve line in <log>", which is how Gemma 4's first measurement
was lost.

    python -m unittest tools.test_speed_log_offset
"""
from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("speed_run", ROOT / "bench" / "speed" / "run.py")
RUN = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUN)

SERVE_LINE = ("strata serve: prompt 1921 tokens = 0 reused + 1921 read in 3847 ms (499.3 tok/s), "
              "128 generated in 3621 ms (35.4 tok/s), drafts accepted 92 of 103")


def appended(log: Path, start: int) -> str:
    """The read bench/speed/run.py does after a run: bytes from `start` on."""
    with open(log, "rb") as fh:
        fh.seek(start)
        return fh.read().decode("utf-8", "replace")


class LogOffset(unittest.TestCase):
    def test_a_path_with_cyrillic_still_finds_the_new_line(self):
        with tempfile.TemporaryDirectory() as t:
            log = Path(t) / "Документы" / "strata-gemma4.log"
            log.parent.mkdir()
            log.write_text("[strata] engine started: .../Документы/.../gemma.gguf --serve\n"
                           + SERVE_LINE + "\n", encoding="utf-8")
            start = log.stat().st_size          # what run.py records before it starts the server
            with open(log, "a", encoding="utf-8") as fh:
                fh.write(SERVE_LINE + "\n")
            fresh = appended(log, start)
            self.assertEqual(len(RUN.SERVER_LINE.findall(fresh)), 1, fresh)
            self.assertEqual(RUN.SERVER_LINE.findall(fresh)[0][7], "35.4")

    def test_the_byte_and_character_counts_differ_here(self):
        """The premise of the test above: a Cyrillic path makes the byte offset larger than the character one."""
        with tempfile.TemporaryDirectory() as t:
            log = Path(t) / "log"
            log.write_text("путь /Документы/OpenCode\n", encoding="utf-8")
            raw = log.read_bytes()
            self.assertGreater(len(raw), len(raw.decode("utf-8")))


if __name__ == "__main__":
    unittest.main()
