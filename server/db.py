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


def run_paged(con, views, table, filters=None, page=1, per=50, cols=None):
    """Paginated raw-data read of one registered table.

    filters is a {column: value} dict of equality filters (raw survey codes).
    Column names are validated against the live schema; values are SQL-escaped.
    Returns (columns, rows, total). Rows are limited to one page, so large
    tables (millions of rows) transfer only the visible slice.
    """
    if table not in views:
        raise ValueError(f"Unknown table: {table}")
    page = max(1, int(page))
    per = max(1, min(int(per), config.QUERY_ROW_LIMIT))
    schema = {c[0]: c[1] for c in con.execute(f'DESCRIBE SELECT * FROM "{table}"').fetchall()}
    if cols:
        cols = [c.strip() for c in cols.split(",") if c.strip()]
        unknown = [c for c in cols if c not in schema]
        if unknown:
            raise ValueError(f"Unknown columns: {', '.join(unknown)}")
    else:
        cols = list(schema)
    where = []
    for col, val in (filters or {}).items():
        if col not in schema:
            raise ValueError(f"Unknown filter column: {col}")
        where.append(f'"{col}" = \'{str(val).replace(chr(39), chr(39) * 2)}\'')
    cond = (" WHERE " + " AND ".join(where)) if where else ""
    sel = ", ".join(f'"{c}"' for c in cols)
    total = con.execute(f'SELECT COUNT(*) FROM "{table}"{cond}').fetchone()[0]
    cur = con.execute(
        f'SELECT {sel} FROM "{table}"{cond} LIMIT {per} OFFSET {(page - 1) * per}'
    )
    columns = [d[0] for d in cur.description]
    return columns, [list(r) for r in cur.fetchall()], total


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
