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


@app.function(
    volumes={"/data": volume.with_mount_options(read_only=True)},
    secrets=[secret],
    scaledown_window=900,
)
@modal.concurrent(max_inputs=100)
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
        cfg = llm.ask_question(str(body.get("question", "")), api_key, model, tables, scales)
        return {"config": cfg}

    return web
