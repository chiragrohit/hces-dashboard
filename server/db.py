"""Read-only DuckDB access over the parquet files.

Responsibilities:
- open a connection with every .parquet file registered as a view
- compute weight-normalization scales (sane tables only)
- validate and run read-only SELECT queries

Everything here is a pure function of its arguments, so it can be tested
independently of the HTTP layer.
"""
import os
import re

import duckdb

from . import config

_BAD_SQL = re.compile(
    r"\b(insert|update|delete|drop|create|alter|copy|attach|detach|pragma|set|export|import|grant|revoke|vacuum)\b",
    re.I,
)


def open_connection(parquet_dir=config.PARQUET, memory_limit=config.MEMORY_LIMIT):
    """Open DuckDB and register every parquet file as a view. Returns (con, views)."""
    con = duckdb.connect()
    con.execute(f"SET memory_limit='{memory_limit}'")
    views = register_views(con, parquet_dir)
    return con, views


def register_views(con, parquet_dir):
    """Create a view per .parquet file. Returns {view_name: filename}."""
    views = {}
    for filename in sorted(os.listdir(parquet_dir)):
        if filename.endswith(".parquet"):
            view = filename[:-8]
            path = os.path.join(parquet_dir, filename).replace("'", "''")
            con.execute(f'CREATE OR REPLACE VIEW "{view}" AS SELECT * FROM read_parquet(\'{path}\')')
            views[view] = filename
    return views


def compute_scales(con, views, max_ratio=200.0):
    """Map raw SUM(Multiplier) to a national-estimate scale per table.

    Only tables whose weighted total is a sane multiple of the national
    estimate (one row per person/household, ~85-96x inflated) get a scale.
    Multi-row tables (food, consumption items) are hundreds to thousands of
    times national, so their SUM(Multiplier) is meaningless - excluded.
    """
    scales = {}
    for view in views:
        try:
            raw = con.execute(f'SELECT SUM(Multiplier) FROM "{view}"').fetchone()[0]
        except Exception:
            continue
        if not raw:
            continue
        target = config.POPULATION_ESTIMATE if "individual" in view else config.HOUSEHOLD_ESTIMATE
        if 0.1 <= raw / target <= max_ratio:
            scales[view] = round(target / raw, 8)
    return scales


def run_query(con, sql, row_limit=config.QUERY_ROW_LIMIT):
    """Validate + run a read-only SELECT. Returns (columns, rows)."""
    stripped = sql.strip().rstrip(";").strip()
    if not re.match(r"^(select|with)\b", stripped, re.I):
        raise ValueError("Only SELECT queries are allowed.")
    if _BAD_SQL.search(stripped):
        raise ValueError("That query type is not allowed.")
    if ";" in stripped:
        raise ValueError("Only one statement at a time.")
    cur = con.execute(f"SELECT * FROM ({stripped}) LIMIT {row_limit}")
    columns = [d[0] for d in cur.description]
    return columns, [list(r) for r in cur.fetchall()]
