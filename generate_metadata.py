"""
Generate a data catalog (metadata.json) from the HCES parquet files.
For each table: schema, row count, null %, distinct counts, and the
actual category values for low-cardinality columns.
"""
import duckdb
import json
import os

PARQUET_DIR = "hces_parquet"
WEB = "web_dashboard/data"
os.makedirs(WEB, exist_ok=True)

con = duckdb.connect()

TABLE_MAP = {
    "household_demographics": "LEVEL 01 - Household roster & sampling",
    "individual_characteristics": "LEVEL 02 - Individual demographics (Section 3)",
    "household_economic": "LEVEL 03 - Economic activity, land, dwelling",
    "consumption_4_1": "LEVEL 04 - Consumption (Section 4_1)",
    "food_consumption": "LEVEL 05 - Food consumption (Sections 5-6)",
    "consumption_7": "LEVEL 06 - Consumption (Section 7)",
    "consumption_4_2": "LEVEL 07 - Consumption (Section 4_2)",
    "consumption_8_1": "LEVEL 08 - Consumption (Section 8_1)",
    "consumption_9_10_11": "LEVEL 09 - Consumption (Sections 9-11)",
    "consumption_12": "LEVEL 10 - Consumption (Section 12)",
    "consumption_13": "LEVEL 12 - Consumption (Section 13)",
    "consumption_14": "Level 13 - Consumption (Section 14)",
    "imputed_rent_durables": "LEVEL 14 - Imputed rent, durables (A1,B1,C1)",
    "supplementary_consumption": "LEVEL 15 - Supplementary (A2,B2,C2)",
}

# Known code meanings (from HCES questionnaire structure)
CODE_MAP = {
    "Sector": {"1": "Rural", "2": "Urban"},
    "Gender": {"1": "Male", "2": "Female"},
    "Panel": {"1": "Panel 1", "2": "Panel 2"},
    "Sub_sample": {"1": "Sub-sample 1", "2": "Sub-sample 2"},
    "Used_Internet_Last_30_Days": {"1": "Yes", "2": "No"},
    "Marital_Status": {"1": "Never married", "2": "Currently married", "3": "Widowed", "4": "Divorced/separated"},
    "Questionnaire_No": {"A": "Type A (land owning)", "B": "Type B (landless)", "C": "Type C (urban)", "F": "Type F", "H": "Type H"},
}

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
                f'WHERE "{col}" IS NOT NULL GROUP BY 1 ORDER BY c DESC LIMIT 50'
            ).fetchall()
            values = [{"value": r[0], "count": int(r[1])} for r in rows]

        columns.append({
            "name": col,
            "type": col_types[i],
            "null_pct": round(100 * n_nulls / total, 1) if total else 0,
            "distinct": int(n_distinct),
            "values": values,
            "meaning": CODE_MAP.get(col),
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
