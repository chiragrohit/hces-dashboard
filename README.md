# HCES 2023-24 — India's household spending, visualized

A web dashboard for the **Household Consumption Expenditure Survey (HCES) 2023-24** —
the official survey of what Indian households spend money on. It turns ~46 million
survey records into simple charts and plain-English explanations anyone can follow.


## What you can do on the site

- **Overview** — headline numbers: households, population, average spending, food's share of the budget.
- **People** — population, age, gender, education, internet use, family roles.
- **Households** — size, income source, social group, religion, housing, cooking fuel, land.
- **Spending** — per-person spending curves (poor to rich), state comparisons, food vs non-food, clothing, services, fuel, durables, tobacco.
- **Schemes** — who gets free school supplies, who has Ayushman Bharat cards.
- **Raw data browser** — every table, searchable and filterable, with codes shown as words.
- **Query explorer** — build your own charts (pick table, dimension, measure, filter).
- **Ask box** — type a question in plain English; an LLM turns it into a chart.

## The data

- **Source:** Household Consumption Expenditure Survey 2023-24, conducted by the **National Statistical Office (NSO)** under the **Ministry of Statistics and Programme Implementation (MoSPI), Government of India**. Public release, August 2023 – July 2024 reference period.
- **Scale:** 14 tables, ~46 million rows, 154 MB of Parquet. Visit-1 households: 261,953 (about 304 million households and 1.43 billion people when weighted).
- **Attribution:** the survey is NSO/MoSPI data. This project adds only visualizations and summaries — no logo, no claims of official endorsement.
- Survey weights are **normalized for display** so totals read as national estimates.

## Architecture

```
┌─────────────┐    /api/*    ┌──────────────────────┐
│  Vercel CDN │ ───────────► │  Modal (FastAPI)     │
│  static app │   (proxy)    │  DuckDB over Volume  │
└─────────────┘              │  + LLM ask (opencode)│
   HTML + JS + JSON charts    └──────────────────────┘
```

- **Frontend:** vanilla JavaScript, no build step, Chart.js from CDN. Pre-computed aggregates ship as static JSON (loads in under a second); live queries go through the API.
- **Backend:** FastAPI on Modal reuses the same `server/` package as the local app. DuckDB reads Parquet from a Modal Volume (per-request connections). The LLM ask box calls opencode.ai with a key from a Modal Secret.
- **Vercel** rewrites `/api/*` to Modal, so the browser stays same-origin (no CORS).

## Repo layout

```
serve.py                  Local server (python serve.py → :8080)
aggregate_for_web.py      Builds the static JSON charts (web_dashboard/data/)
build_parquet_code_map.py Builds the code→word maps for filters
generate_metadata.py      Builds table/column metadata (API + dataset pages)
convert_to_parquet.py     Converts the public release files to Parquet
colab_convert.py          Same, for Google Colab
pipeline_common.py        Shared pipeline helpers
server/                   Python package reused by serve.py and the Modal API
  catalog.py db.py llm.py config.py httpd.py
deploy/                   Modal app + data upload script
web_dashboard/            The static site (HTML, CSS, JS, data JSONs)
hces-code/                OCR questionnaire annotations, code maps, schema
```

## Run locally

```bash
# 1. Prepare the data (one-time)
#    Put the public HCES release files in place, then:
python convert_to_parquet.py     # → hces_parquet/ (14 Parquet files)
python build_parquet_code_map.py # → code maps
python generate_metadata.py      # → metadata.json
python aggregate_for_web.py      # → web_dashboard/data/*.json

# 2. Serve
python serve.py                  # → http://localhost:8080
```

Optional: add `OPENCODE_API_KEY=...` (and optionally `ZEN_MODEL=...`) to a `.env`
file to enable the natural-language ask box.

## Deploy (maintainer only — the live site is already deployed)

```bash
# Modal API
python deploy/upload_data.py     # upload Parquet + metadata to the Volume
modal deploy deploy/modal_app.py # deploy FastAPI app

# Vercel static site
cd web_dashboard && vercel --prod
```

`hces-dashboard.vercel.app` is a project domain, so it tracks every production deploy.

## API

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/tables` | GET | Table list + weight scales |
| `/api/rows` | GET | Paged, filtered raw rows (`?table=&page=&per=&<col>=<code>`) |
| `/api/query` | POST | Run a SQL query (`{"sql": "..."}`) |
| `/api/ask` | POST | Ask a question in plain English (`{"question": "..."}`) |

## Methodology notes

- **Per-person spending (MPCE)** = `MONTHLY_CONSUMPTION_EXP ÷ HOUSEHOLD_SIZE`, visit-1 records only.
- Percentile curves, the poor-to-rich distribution, and state medians are **person-weighted** (`Multiplier × household size`) — each person counts once through their household, matching how NSO publishes per-capita expenditure distributions.
- Subgroup curves appear only when the raw sample is large enough (2,000+ households for household filters, 300+ for survey month) — a display choice, not an HCES rule.
- "Our calculation" charts (percentiles, shares) are computed from raw fields; they are not columns in the source files.

## License

The survey data is © NSO/MoSPI, Government of India (public release). This project's
code is available for educational use. No official endorsement implied.
