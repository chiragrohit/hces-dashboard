"""HCES API on Modal.

Vercel hosts the static dashboard and proxies /api/* here (see
web_dashboard/vercel.json). This app serves only the JSON API; it reuses
the existing server package (db / llm / catalog / config) unchanged.

Dev:      modal serve deploy/modal_app.py
Deploy:   modal deploy deploy/modal_app.py   (from repo root)
"""
import os
import pathlib
import sys

import modal

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("duckdb", "fastapi[standard]")
    .add_local_dir(str(REPO_ROOT / "server"), "/root/server")
)

app = modal.App(os.environ.get("MODAL_APP_NAME", "hces-api"), image=image)
volume = modal.Volume.from_name("hces-parquet", create_if_missing=True)
secret = modal.Secret.from_name("hces-opencode-key")

PARQUET_DIR = "/data/hces_parquet"
METADATA_JSON = "/data/metadata.json"

# --------------------------------------------------------------------------
# Rate limiting (in-memory, per container). Sliding window per client IP;
# the real IP arrives via x-forwarded-for set by the Vercel proxy. Per-
# container state means the real ceiling is ~(limits x containers); good
# enough to stop abuse, cheap, zero dependencies.
#   ponytail: per-container counters, add a shared store (volume/redis)
#   if distributed abuse ever outruns a handful of containers.
# --------------------------------------------------------------------------
from collections import defaultdict, deque
import time

LIMITS = {  # kind: (per-minute, window_s, per-day, window_s)
    "/api/ask": (5, 60, 200, 86400),        # LLM calls cost money
    "/api/query": (20, 60, 5000, 86400),    # SQL can burn compute
    "/api/rows": (60, 60, 60000, 86400),
    "/api/tables": (60, 60, 60000, 86400),
    "/": (60, 60, 60000, 86400),
}
_wins = defaultdict(lambda: defaultdict(deque))  # key -> {window_s: deque}
ASK_DAILY_CAP = 400  # per container; the /api/ask per-IP day cap is 200
_ask_day = {"date": "", "count": 0}


def _client_ip(request):
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _limited(key, kind):
    per_min, win_s, per_day, day_s = LIMITS.get(kind, LIMITS["/api/query"])
    now = time.time()
    for window, cap, w in ((win_s, per_min, 60), (day_s, per_day, 86400)):
        dq = _wins[key][w]
        while dq and dq[0] <= now - window:
            dq.popleft()
        if len(dq) >= cap:
            return True
        dq.append(now)
    return False


def _ask_cap_open():
    today = time.strftime("%Y-%m-%d")
    if _ask_day["date"] != today:
        _ask_day.update(date=today, count=0)
    if _ask_day["count"] >= ASK_DAILY_CAP:
        return False
    _ask_day["count"] += 1
    return True


if __name__ == "__main__":
    # Run with plain python (no Modal):  python deploy/modal_app.py
    _wins.clear()
    for _ in range(5):
        assert not _limited("check-ip|/api/ask", "/api/ask"), "first 5 must pass"
    assert _limited("check-ip|/api/ask", "/api/ask"), "6th ask in a minute must be limited"
    assert not _limited("other-ip|/api/ask", "/api/ask"), "other IP unaffected"
    _wins.clear()  # fresh container / new day
    assert not _limited("check-ip|/api/ask", "/api/ask"), "fresh window re-admits"
    _ask_day.update(date=time.strftime("%Y-%m-%d"), count=ASK_DAILY_CAP)
    assert not _ask_cap_open(), "cap reached today stays closed"
    _ask_day.update(date="2000-01-01", count=ASK_DAILY_CAP)
    assert _ask_cap_open(), "day cap resets on a new day"
    print("rate limiter self-check: OK")


@app.function(
    volumes={"/data": volume.with_mount_options(read_only=True)},
    secrets=[secret],
    scaledown_window=900,
)
@modal.concurrent(max_inputs=8)  # bound per-container burst; rate limits stop floods
@modal.asgi_app()
def api():
    from fastapi import FastAPI, Request
    from fastapi.middleware.cors import CORSMiddleware

    sys.path.insert(0, "/root")
    from server import catalog, config, db, llm

    web = FastAPI(title="HCES API")
    web.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @web.middleware("http")
    async def _rate_limit(request, call_next):
        from fastapi.responses import JSONResponse
        kind = request.url.path if request.url.path in LIMITS else "/api/query"
        if _limited(_client_ip(request) + "|" + kind, kind):
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please wait a minute and try again."},
                headers={"Retry-After": "60"},
            )
        return await call_next(request)

    # Startup (once per container): open DuckDB to compute the weight scales,
    # then close; data requests open their own short-lived connection so many
    # concurrent requests in one container stay safe.
    con, views = db.open_connection(PARQUET_DIR)
    scales = db.compute_scales(con, views)
    con.close()
    tables = catalog.load_metadata(path=METADATA_JSON)["tables"]
    api_key, model = config.zen_credentials()

    def fresh_con():
        return db.open_connection(PARQUET_DIR)

    @web.get("/")
    def root():
        return {"ok": True, "tables": len(tables)}

    @web.get("/debug")
    def debug():
        return {
            "has_key": bool(os.environ.get("OPENCODE_API_KEY", "")),
            "key_len": len(os.environ.get("OPENCODE_API_KEY", "")),
        }

    @web.get("/api/tables")
    def api_tables():
        return {"tables": tables, "scales": scales}

    @web.get("/api/rows")
    def api_rows(request: Request, table: str = "", page: int = 1, per: int = 50, cols: str = ""):
        filters = {k: v for k, v in request.query_params.items()
                   if k not in ("table", "page", "per", "cols")}
        con, views = fresh_con()
        try:
            columns, rows, total = db.run_paged(con, views, table, filters, page, per, cols)
            return {"columns": columns, "rows": rows, "total": total, "page": page, "per": per}
        except ValueError as e:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail=str(e))
        finally:
            con.close()

    @web.post("/api/query")
    def api_query(body: dict):
        con, views = fresh_con()
        try:
            columns, rows = db.run_query(con, str(body.get("sql", "")))
            return {"columns": columns, "rows": rows}
        except ValueError as e:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:  # bad SQL (bad column, syntax, …) -> friendly 400
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail=f"Query failed: {e}")
        finally:
            con.close()

    @web.post("/api/ask")
    def api_ask(body: dict):
        if not _ask_cap_open():
            from fastapi import HTTPException
            raise HTTPException(status_code=429, detail="Daily ask limit reached — try again tomorrow.")
        cfg = llm.ask_question(str(body.get("question", "")), api_key, model, tables, scales)
        return {"config": cfg}

    return web
