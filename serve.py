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
import urllib.request
import urllib.error
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

# ---- optional "ask in English" via OpenCode Zen -------
def _load_env():
    env = {}
    p = os.path.join(BASE, ".env")
    if os.path.exists(p):
        for line in open(p, encoding="utf-8"):
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env

_ENV = _load_env()
ZEN_KEY = os.environ.get("OPENCODE_API_KEY", _ENV.get("OPENCODE_API_KEY", "")).strip()
ZEN_MODEL = os.environ.get("ZEN_MODEL", _ENV.get("ZEN_MODEL", "deepseek-v4-flash")).strip()
ZEN_URL = "https://opencode.ai/zen/v1/chat/completions"
_NUM_TYPES = {"BIGINT", "INTEGER", "DOUBLE", "FLOAT", "DECIMAL", "HUGEINT", "UBIGINT", "SMALLINT"}


def _catalog_context(tables):
    parts = []
    for t in tables:
        parts.append(f"- {t['table']} | {t.get('description') or ''} | {t['rows']:,} rows")
        for c in t["columns"]:
            kind = "number" if c["type"] in _NUM_TYPES else "text"
            bits = [c["name"], kind]
            if c.get("meaning"):
                m = c["meaning"]
                if isinstance(m, dict):
                    pairs = ", ".join(f"{k}={v}" for k, v in list(m.items())[:12])
                    bits.append("codes: " + pairs)
                else:
                    bits.append("means: " + str(m))
            if kind == "text" and c.get("values") and c["distinct"] and c["distinct"] <= 50:
                vals = ", ".join(str(v["value"]) for v in c["values"][:8])
                bits.append(f"values: {vals}")
            parts.append("    " + " | ".join(bits))
    return "\n".join(parts)


_SYS = """You turn a plain-English question into a chart config for a household survey dashboard.
Return ONLY a JSON object, no markdown, no prose. Shape:
{"table":"...","dim":"...","dim2":"","measure":"...","agg":"sum|avg|count|count_distinct","sector":"","state":"","title":"..."}

Rules:
- table: one of the table names below.
- dim: a TEXT column to split the chart by (Sector, State, age group, gender, cooking fuel, etc.). Use the exact names given.
- dim2: a second TEXT column for a grouped chart, or "" when not needed.
- measure: a NUMBER column to show, or "Multiplier" for a weighted count of people/households (use for "how many ..."), or "count" for a row count.
- agg: "sum" for totals (always "sum" with Multiplier), "avg" for averages, "count" for row counts, "count_distinct" for distinct counts.
- sector: "Rural" or "Urban" (or the exact code 1/2 as listed) only when the question is about one sector, else "".
- state: the exact state/UT value only when the question names one, else "".
- title: a short plain-English title, max 8 words.
Never invent a column name. Survey codes often mean words (for example Sector 1=Rural, 2=Urban).

Tables and columns:

CATALOG"""


def _extract_json(text):
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("Model did not return JSON.")
    return json.loads(text[start:end + 1])


def _validate_cfg(cfg, tables):
    tbl = next((t for t in tables if t["table"] == cfg.get("table")), None)
    if not tbl:
        raise ValueError("Model returned an unknown table.")
    cols = {c["name"]: c for c in tbl["columns"]}

    def is_dim(n):
        c = cols.get(n)
        return c and c["type"] not in _NUM_TYPES and c["name"] != "Multiplier" and (c["distinct"] or 0) <= 300

    dim = cfg.get("dim") if is_dim(cfg.get("dim")) else None
    if not dim:
        for guess in ("Sector", "State"):
            if is_dim(guess):
                dim = guess
                break
        if not dim:
            dim = next((c["name"] for c in tbl["columns"] if is_dim(c["name"])), None)
    if not dim:
        raise ValueError("No categorical column to chart in this table.")

    dim2 = cfg.get("dim2") if (cfg.get("dim2") and cfg.get("dim2") != dim and is_dim(cfg.get("dim2"))) else ""

    meas = (cfg.get("measure") or "").strip()
    agg = (cfg.get("agg") or "sum").lower()
    if meas in ("count", "COUNT_STAR", "rows"):
        meas, agg = "COUNT_STAR", "count"
    elif meas == "Multiplier":
        meas, agg = ("Multiplier", "sum") if tbl["table"] in SCALES else ("COUNT_STAR", "count")
    else:
        c = cols.get(meas)
        if not (c and c["type"] in _NUM_TYPES):
            meas, agg = "COUNT_STAR", "count"
        elif agg not in ("sum", "avg", "count_distinct"):
            agg = "sum"

    sector = ""
    if cfg.get("sector") and "Sector" in cols:
        sv = str(cfg["sector"]).strip()
        allowed = [str(v["value"]) for v in cols["Sector"].get("values", [])]
        if sv in allowed:
            sector = sv
        elif sv.lower().startswith("rural"):
            sector = "Rural" if "Rural" in allowed else "1"
        elif sv.lower().startswith("urban"):
            sector = "Urban" if "Urban" in allowed else "2"

    state = ""
    if cfg.get("state") and "State" in cols:
        sv = str(cfg["state"]).strip()
        if sv in [str(v["value"]) for v in cols["State"].get("values", [])]:
            state = sv

    title = str(cfg.get("title") or "").strip()[:80] or f"{dim} by {meas}"
    return {"table": tbl["table"], "dim": dim, "dim2": dim2, "measure": meas, "agg": agg,
            "sector": sector, "state": state, "title": title}


def ask_llm(question):
    if not ZEN_KEY:
        raise RuntimeError("No OPENCODE_API_KEY set. Add OPENCODE_API_KEY=sk-... to .env and restart serve.py.")
    data = json.load(open(os.path.join(DASH, "data", "metadata.json"), encoding="utf-8"))
    body = {
        "model": ZEN_MODEL,
        "messages": [
            {"role": "system", "content": _SYS.replace("CATALOG", _catalog_context(data["tables"]))},
            {"role": "user", "content": question},
        ],
        "temperature": 0,
    }
    req = urllib.request.Request(ZEN_URL, data=json.dumps(body).encode("utf-8"),
                                 headers={"Content-Type": "application/json",
                                          "Authorization": "Bearer " + ZEN_KEY,
                                          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
                                          "Accept": "application/json"},
                                 method="POST")
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            resp = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            msg = json.loads(raw).get("error", {}).get("message", raw)
        except Exception:
            msg = raw
        raise RuntimeError(f"Zen API error {e.code}: {msg[:220]}")
    content = resp["choices"][0]["message"]["content"]
    return _validate_cfg(_extract_json(content), data["tables"])


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
        path = self.path.split("?")[0]
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0)) or 0))
        except Exception:
            self._json(400, {"error": "Bad JSON body"})
            return
        if path == "/api/query":
            try:
                cols, rows = run_query(str(body.get("sql", "")))
                self._json(200, {"columns": cols, "rows": rows})
            except Exception as e:
                self._json(400, {"error": str(e)})
        elif path == "/api/ask":
            try:
                cfg = ask_llm(str(body.get("question", "")))
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


os.chdir(DASH)
print(f"HCES Dashboard running at http://localhost:{PORT}", flush=True)
print("  /              Overview", flush=True)
print("  /details?id=   Chart detail page", flush=True)
print("  /explore       Query explorer", flush=True)
print("  /metadata      Data catalog", flush=True)
print("  /api/query     POST read-only DuckDB over hces_parquet", flush=True)
print("  /api/ask       POST natural-language -> chart (OPENCODE_API_KEY in .env)", flush=True)
print("Press Ctrl+C to stop", flush=True)

# Fail loudly if the port is already taken instead of silently double-binding
class LockedServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = False

httpd = LockedServer(("", PORT), Handler)
try:
    httpd.serve_forever()
except KeyboardInterrupt:
    print("\nStopped.")
