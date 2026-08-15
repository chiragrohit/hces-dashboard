"""
Generate a data catalog (metadata.json) from the HCES parquet files.
For each table: schema, row count, null %, distinct counts, and the
actual category values for low-cardinality columns.
Run: python generate_metadata.py  (from the project root)
"""
import json
import os

import duckdb

from pipeline_common import WEB, PARQUET_DIR, TABLE_MAP

os.makedirs(WEB, exist_ok=True)

con = duckdb.connect()

# Holistic code map extracted from the official HCES 2023-24 questionnaire
# (see extract_code_map.py): column meanings, per-table consumption item
# codes, state codes, and notes for identifiers/quantities.
CODE_MAP_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                             "hces-code", "code_map.json")
with open(CODE_MAP_PATH, encoding="utf-8") as _f:
    _code_map = json.load(_f)
CODE_MAP = {k: v["map"] for k, v in _code_map["columns"].items()}
COLUMN_NOTES = _code_map["column_notes"]
STATE_CODES = _code_map["state_codes"]
TABLE_ITEMS = {t: v["items"] for t, v in _code_map["tables"].items()}
TABLE_ITEM_COL = {t: v["item_column"] for t, v in _code_map["tables"].items()}

catalog = []
for table, description in TABLE_MAP.items():
    pq_path = os.path.join(PARQUET_DIR, f"{table}.parquet")
    if not os.path.exists(pq_path):
        continue

    con.execute(f"CREATE OR REPLACE VIEW t AS SELECT * FROM read_parquet('{pq_path}')")
    cols = con.execute("DESCRIBE t").fetchall()  # name, type, ...
    col_names = [c[0] for c in cols]
    col_types = [c[1] for c in cols]

    total = con.execute(f"SELECT COUNT(*) FROM t").fetchone()[0]

    # One query computing null counts + distinct counts for every column
    exprs = ", ".join(
        f"count({q}col{q}) as n_{i}, count(distinct {q}col{q}) as d_{i}"
        for i, col in enumerate(col_names)
        for q in ['"']
    )
    # simpler: build per-column expressions with quoted identifiers
    parts = []
    for i, col in enumerate(col_names):
        q = f'"{col}"'
        parts.append(f"count({q}) as n_{i}")
        parts.append(f"count(distinct {q}) as d_{i}")
    stats = con.execute(f"SELECT {', '.join(parts)} FROM t").fetchone()

    columns = []
    for i, col in enumerate(col_names):
        n_nulls = total - stats[2 * i]
        n_distinct = stats[2 * i + 1]
        # Fetch sample values for low-cardinality columns
        values = []
        if n_distinct and n_distinct <= 50:
            rows = con.execute(
                f'SELECT "{col}" AS v, COUNT(*) AS c FROM t '
                f'WHERE "{col}" IS NOT NULL GROUP BY 1 ORDER BY c DESC, v ASC LIMIT 50'
            ).fetchall()
            values = [{"value": r[0], "count": int(r[1])} for r in rows]

        columns.append({
            "name": col,
            "type": col_types[i],
            "null_pct": round(100 * n_nulls / total, 1) if total else 0,
            "distinct": int(n_distinct),
            "values": values,
            "meaning": CODE_MAP.get(col),
            "item_meaning": TABLE_ITEMS.get(table)
                if col == TABLE_ITEM_COL.get(table) else None,
            "note": COLUMN_NOTES.get(col),
            "state_meaning": STATE_CODES if col == "State" else None,
        })

    size_mb = os.path.getsize(pq_path) / (1024**2)
    catalog.append({
        "table": table,
        "description": description,
        "rows": int(total),
        "size_mb": round(size_mb, 1),
        "columns": columns,
    })

with open(os.path.join(WEB, "metadata.json"), "w") as f:
    json.dump({"tables": catalog}, f)

print(f"Catalog written: {len(catalog)} tables, {sum(len(t['columns']) for t in catalog)} columns")
for t in catalog:
    print(f"  {t['table']}: {t['rows']:,} rows, {len(t['columns'])} cols, {t['size_mb']} MB")
