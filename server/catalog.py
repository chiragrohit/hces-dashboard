"""Metadata catalog: loading metadata.json and rendering it as LLM context."""
import json

from . import config


def load_metadata(path=config.METADATA):
    """Read the catalog JSON (tables, columns, code maps)."""
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def build_catalog_context(tables):
    """Render the catalog as compact text the model can reason over."""
    parts = []
    for table in tables:
        parts.append(f"- {table['table']} | {table.get('description') or ''} | {table['rows']:,} rows")
        for col in table["columns"]:
            kind = "number" if col["type"] in config.NUMERIC_TYPES else "text"
            bits = [col["name"], kind]
            if col.get("meaning"):
                meaning = col["meaning"]
                if isinstance(meaning, dict):
                    pairs = ", ".join(f"{k}={v}" for k, v in list(meaning.items())[:12])
                    bits.append("codes: " + pairs)
                else:
                    bits.append("means: " + str(meaning))
            if kind == "text" and col.get("values") and col["distinct"] and col["distinct"] <= 50:
                values = ", ".join(str(v["value"]) for v in col["values"][:8])
                bits.append(f"values: {values}")
            parts.append("    " + " | ".join(bits))
    return "\n".join(parts)


SYSTEM_PROMPT = """You turn a plain-English question into a chart config for a household survey dashboard.
Return ONLY a JSON object, no markdown, no prose. Shape:
{"table":"...","dim":"...","dim2":"","measure":"...","agg":"sum|avg|count|count_distinct","sector":"","state":"","filter":{},"title":"..."}

Rules:
- table: one of the table names below.
- dim: a TEXT column to split the chart by (Sector, State, age group, gender, cooking fuel, etc.). Use the exact names given.
- dim2: a second TEXT column for a grouped chart, or "" when not needed.
- measure: a NUMBER column to show, or "Multiplier" for a weighted count of people/households (use for "how many ..."), or "count" for a row count.
- agg: "sum" for totals (always "sum" with Multiplier), "avg" for averages, "count" for row counts, "count_distinct" for distinct counts.
- sector: "Rural" or "Urban" (or the exact code 1/2 as listed) only when the question is about one sector, else "".
- state: the exact state/UT value only when the question names one, else "".
- filter: OPTIONAL. When the question is about a specific group (for example "people who have internet", "households using LPG", "women"), set filter.col to that column and filter.value to its code from the catalog (for example {"col":"Used_Internet_Last_30_Days","value":"1"}). Otherwise set {} .
- title: a short plain-English title, max 8 words.
Never invent a column name. Survey codes often mean words (for example Sector 1=Rural, 2=Urban).

Tables and columns:

CATALOG"""


def build_system_message(tables):
    """Full system prompt for a given catalog."""
    return SYSTEM_PROMPT.replace("CATALOG", build_catalog_context(tables))
