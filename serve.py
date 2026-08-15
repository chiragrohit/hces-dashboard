"""
Serve the HCES dashboard locally.
Run: python serve.py
Then open: http://localhost:8080
Routes:
  /                -> dashboard overview (index.html)
  /people|/households|/spending|/schemes (aliases /demographics, /consumption)
  /details?id=...  -> chart detail page (chart + raw data + CSV)
  /explore         -> guided query explorer (DuckDB over parquet)
  /metadata        -> data catalog (metadata.html)
  /api/tables      -> catalog JSON for explorer pickers
  /api/query       -> POST {"sql": "SELECT ..."} read-only DuckDB over parquet
"""
import http.server
import json
import os
import re
import duckdb

PORT = 8080
BASE = os.path.dirname(os.path.abspath(__file__))
DASH = os.path.join(BASE, "web_dashboard")
PARQUET = os.path.join(BASE, "hces_parquet")

DASHBOARD_PATHS = {"/", "/people", "/households", "/spending", "/schemes", "/consumption", "/demographics"}
PAGES = {"/metadata": "metadata.html", "/details": "detail.html", "/explore": "explorer.html"}

# ---- read-only DuckDB over the parquet files ----
CON = duckdb.connect()
CON.execute("SET memory_limit='2GB'")
_TABLE_VIEWS = {}
for f in sorted(os.listdir(PARQUET)):
    if f.endswith(".parquet"):
        view = f[:-8]  # strip .parquet
        _TABLE_VIEWS[view] = f
        path = os.path.join(PARQUET, f).replace("'", "''")
        CON.execute(f'CREATE OR REPLACE VIEW "{view}" AS SELECT * FROM read_parquet(\'{path}\')')

_BAD = re.compile(r"\b(insert|update|delete|drop|create|alter|copy|attach|detach|pragma|set|export|import|grant|revoke|vacuum)\b", re.I)

# per-table weight normalization: raw SUM(Multiplier) -> national estimate
SCALES = {}
for view in _TABLE_VIEWS:
    try:
        raw = CON.execute(f'SELECT SUM(Multiplier) FROM "{view}"').fetchone()[0]
        if raw:
            target = 1428000000 if "individual" in view else 304000000
            SCALES[view] = round(target / raw, 8)
    except Exception:
        pass

def run_query(sql):
    """Validate + run a read-only SELECT. Returns (columns, rows)."""
    stripped = sql.strip().rstrip(";").strip()
    if not re.match(r"^(select|with)\b", stripped, re.I):
        raise ValueError("Only SELECT queries are allowed.")
    if _BAD.search(stripped):
        raise ValueError("That query type is not allowed.")
    if ";" in stripped:
        raise ValueError("Only one statement at a time.")
    cur = CON.execute(f"SELECT * FROM ({stripped}) LIMIT 5000")
    cols = [d[0] for d in cur.description]
    return cols, [list(r) for r in cur.fetchall()]


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # local dev: never let the browser serve stale JS/HTML/JSON
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in DASHBOARD_PATHS:
            self.path = "/index.html"
        elif path in PAGES:
            self.path = "/" + PAGES[path]
        elif path == "/api/tables":
            try:
                data = json.load(open(os.path.join(DASH, "data", "metadata.json"), encoding="utf-8"))
                self._json(200, {"tables": data["tables"], "scales": SCALES})
            except Exception as e:
                self._json(500, {"error": str(e)})
            return
        return super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] != "/api/query":
            self.send_error(404)
            return
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0)) or 0))
            cols, rows = run_query(str(body.get("sql", "")))
            self._json(200, {"columns": cols, "rows": rows})
        except Exception as e:
            self._json(400, {"error": str(e)})

    def _json(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)


os.chdir(DASH)
print(f"HCES Dashboard running at http://localhost:{PORT}", flush=True)
print("  /              Overview", flush=True)
print("  /details?id=   Chart detail page", flush=True)
print("  /explore       Query explorer", flush=True)
print("  /metadata      Data catalog", flush=True)
print("  /api/query     POST read-only DuckDB over hces_parquet", flush=True)
print("Press Ctrl+C to stop", flush=True)

# Fail loudly if the port is already taken instead of silently double-binding
class LockedServer(http.server.HTTPServer):
    allow_reuse_address = False

httpd = LockedServer(("", PORT), Handler)
try:
    httpd.serve_forever()
except KeyboardInterrupt:
    print("\nStopped.")
