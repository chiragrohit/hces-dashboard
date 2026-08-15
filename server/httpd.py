"""HTTP server: static files, routing and JSON APIs.

create_httpd() wires the DuckDB connection, weight scales and catalog into
the Handler class attributes, then returns a threaded server. The server
package owns no global state until create_httpd() is called, so tests can
build a server against any directory/port.
"""
import http.server
import json
import os
from urllib.parse import parse_qs, urlparse

from . import config
from . import db
from . import llm
from .catalog import load_metadata
from .config import zen_credentials


class Handler(http.server.SimpleHTTPRequestHandler):
    """Serves static files from web_dashboard/ plus the JSON APIs.

    Runtime wiring (db connection, scales, catalog, LLM credentials) is
    attached as class attributes by create_httpd().
    """

    db = None
    scales = {}
    metadata = {}
    views = {}
    api_key = ""
    zen_model = config.DEFAULT_ZEN_MODEL

    def end_headers(self):
        # local dev: never let the browser serve stale JS/HTML/JSON
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path in config.DASHBOARD_PATHS:
            self.path = "/index.html"
        elif path in config.PAGES:
            self.path = "/" + config.PAGES[path]
        elif path == "/api/tables":
            try:
                self._json(200, {"tables": self.metadata["tables"], "scales": self.scales})
            except Exception as e:
                self._json(500, {"error": str(e)})
            return
        elif path == "/api/rows":
            try:
                q = parse_qs(parsed.query)
                table = q.get("table", [""])[0]
                page = q.get("page", ["1"])[0]
                per = q.get("per", ["50"])[0]
                cols = q.get("cols", [""])[0]
                # every other query param is a raw-code equality filter
                filters = {k: v[0] for k, v in q.items()
                           if k not in ("table", "page", "per", "cols")}
                columns, rows, total = db.run_paged(
                    self.db, self.views, table, filters, page, per, cols)
                self._json(200, {"columns": columns, "rows": rows, "total": total,
                                 "page": int(page), "per": int(per)})
            except ValueError as e:
                self._json(400, {"error": str(e)})
            except Exception as e:
                self._json(500, {"error": str(e)})
            return
        elif path.startswith("/metadata/") and len(path) > len("/metadata/"):
            # /metadata/<table> -> raw-data browser; JS reads the name from the URL
            self.path = "/dataset.html"
        return super().do_GET()

    def do_POST(self):
        path = self.path.split("?")[0]
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0)) or 0))
        except Exception:
            self._json(400, {"error": "Bad JSON body"})
            return
        if path == "/api/query":
            try:
                columns, rows = db.run_query(self.db, str(body.get("sql", "")))
                self._json(200, {"columns": columns, "rows": rows})
            except Exception as e:
                self._json(400, {"error": str(e)})
        elif path == "/api/ask":
            try:
                cfg = llm.ask_question(
                    str(body.get("question", "")), self.api_key, self.zen_model,
                    self.metadata["tables"], self.scales,
                )
                self._json(200, {"config": cfg})
            except Exception as e:
                self._json(500, {"error": str(e)})
        else:
            self.send_error(404)

    def _json(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)


def create_httpd(port=config.PORT, parquet_dir=config.PARQUET):
    """Open the DB, load the catalog, wire the Handler, return a server."""
    con, views = db.open_connection(parquet_dir)
    scales = db.compute_scales(con, views)
    metadata = load_metadata()
    api_key, model = zen_credentials()

    # SimpleHTTPRequestHandler serves from os.getcwd() in this Python
    # version, so the process cwd must be the dashboard directory.
    os.chdir(config.DASH)

    Handler.db = con
    Handler.scales = scales
    Handler.metadata = metadata
    Handler.views = views
    Handler.api_key = api_key
    Handler.zen_model = model

    class LockedServer(http.server.ThreadingHTTPServer):
        # Fail loudly if the port is taken instead of silently double-binding
        allow_reuse_address = False

    return LockedServer(("", port), Handler)
