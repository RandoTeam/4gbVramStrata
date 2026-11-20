"""Every page this server serves is sent with Cache-Control: no-cache.

The chat page was the one file that was not, and a browser may keep such a page and show it again without asking the
server. That is not theoretical here: the tab that opened 127.0.0.1:8080 on 2026-11-20 kept llama.cpp's WebUI from an
earlier program on the same port, so the page looked like the wrong application while the chat underneath was this
server's. The static files beside it (`/web/app.js`, `/web/tokens.css`) already said no-cache.

    python -m unittest serve.test_page_cache_header
"""
from __future__ import annotations

import unittest
import urllib.request
from pathlib import Path

import serve.server as server

ROOT = Path(__file__).resolve().parents[1]


class PageCacheHeaders(unittest.TestCase):
    """A real server on a real socket: what a browser is told, not what a test's own handler echoes."""

    @classmethod
    def setUpClass(cls):
        tok = server.ByteTokenizer()
        engine = server.MockEngine(tok, "ok")
        cls.svc = server.Service(engine, tok,
                                 server.ChatTemplate(Path(__file__).parent / "chat_template.jinja"))
        cls.http = server.serve(cls.svc, port=0)
        cls.base = f"http://127.0.0.1:{cls.http.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()

    def header(self, path: str) -> str | None:
        with urllib.request.urlopen(self.base + path, timeout=10) as answer:
            self.assertEqual(answer.status, 200)
            return answer.headers.get("Cache-Control")

    def test_the_chat_page_says_no_cache(self):
        self.assertEqual(self.header("/"), "no-cache")

    def test_the_static_files_say_no_cache(self):
        for path in ("/web/app.js", "/web/tokens.css"):
            with self.subTest(path=path):
                self.assertEqual(self.header(path), "no-cache")

    def test_the_page_is_this_projects_own(self):
        """The other half of the confusion: the page a fresh request gets must name the fork, not the donor."""
        with urllib.request.urlopen(self.base + "/", timeout=10) as answer:
            body = answer.read().decode("utf-8", "replace")
        self.assertIn("<title>4gbVramStrata</title>", body)


if __name__ == "__main__":
    unittest.main()
