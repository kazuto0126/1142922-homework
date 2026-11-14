# 本機測試用的小網頁伺服器：不讓瀏覽器快取，改完 js 重新整理就生效。
# 用法：python serve.py [port] [資料夾]
import functools
import http.server
import sys

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
root = sys.argv[2] if len(sys.argv) > 2 else "publish/wwwroot"


class NoCache(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".wasm": "application/wasm", ".js": "text/javascript", ".mjs": "text/javascript"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(NoCache, directory=root)).serve_forever()
