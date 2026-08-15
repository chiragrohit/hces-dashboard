"""Natural-language questions -> validated chart config via OpenCode Go.

The model only picks from the catalog (tables/columns/codes) we give it;
we never let it write SQL. validate_config() normalizes and checks every
field against the real metadata before anything is executed.
"""
import json
import re
import urllib.error
import urllib.request

from . import config
from .catalog import build_system_message


def extract_json(text):
    """Pull the first JSON object out of the model's reply (tolerates fences)."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("Model did not return JSON.")
    return json.loads(text[start:end + 1])


def validate_config(cfg, tables, scales):
    """Normalize + validate the model's config against the catalog.

    Every field is checked and falls back to something safe when the model
    names an unknown column or measure.
    """
    tbl = next((t for t in tables if t["table"] == cfg.get("table")), None)
    if not tbl:
        raise ValueError("Model returned an unknown table.")
    cols = {c["name"]: c for c in tbl["columns"]}

    def is_dim(name):
        c = cols.get(name)
        return c and c["type"] not in config.NUMERIC_TYPES and c["name"] != "Multiplier" and (c["distinct"] or 0) <= 300

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
        meas, agg = ("Multiplier", "sum") if tbl["table"] in scales else ("COUNT_STAR", "count")
    else:
        col = cols.get(meas)
        if not (col and col["type"] in config.NUMERIC_TYPES):
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

    flt = {}
    if cfg.get("filter"):
        fc = cfg.get("filter") or {}
        colname = fc.get("col")
        val = str(fc.get("value") or "").strip()
        if colname and colname in cols and val:
            allowed = [str(v["value"]) for v in cols[colname].get("values", [])]
            if allowed and val in allowed:
                flt = {"col": colname, "value": val}

    title = str(cfg.get("title") or "").strip()[:80] or f"{dim} by {meas}"
    return {"table": tbl["table"], "dim": dim, "dim2": dim2, "measure": meas, "agg": agg,
            "sector": sector, "state": state, "filter": flt, "title": title}


def ask_question(question, api_key, model, tables, scales):
    """Map a plain-English question to a validated chart config via OpenCode Go."""
    if not api_key:
        raise RuntimeError("No OPENCODE_API_KEY set. Add OPENCODE_API_KEY=sk-... to .env and restart serve.py.")
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": build_system_message(tables)},
            {"role": "user", "content": question},
        ],
        "temperature": 0,
    }
    request = urllib.request.Request(
        config.LLM_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + api_key,
            "User-Agent": config.LLM_USER_AGENT,
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=config.LLM_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            message = json.loads(raw).get("error", {}).get("message", raw)
        except Exception:
            message = raw
        raise RuntimeError(f"Zen API error {e.code}: {message[:220]}")
    content = payload["choices"][0]["message"]["content"]
    return validate_config(extract_json(content), tables, scales)
