# HCES 2023-24 — India's household spending, visualized

A web dashboard for the **Household Consumption Expenditure Survey (HCES) 2023-24**.
This is the official Government of India survey of what households spend money on.
The dashboard turns ~46 million survey records into simple charts and plain-English
explanations. You do not need to know statistics or programming to use it.

**See it live (no setup):** https://hces-dashboard.vercel.app

## What you can do on the site

- **Overview** — headline numbers: households, population, average spending, food's share of the budget.
- **People** — population, age, gender, education, internet use, family roles.
- **Households** — size, income source, social group, religion, housing, cooking fuel, land.
- **Spending** — per-person spending curves (poor to rich), state comparisons, food vs non-food.
- **Schemes** — who gets free school supplies, who has Ayushman Bharat cards.
- **Raw data browser** — every table, searchable and filterable, with codes shown as words.
- **Query explorer** — build your own charts (pick table, dimension, measure, filter).
- **Ask box** — type a question in plain English; the tool turns it into a chart.

## Where the data comes from

The Household Consumption Expenditure Survey 2023-24 was conducted by the
**National Statistical Office (NSO)** under the **Ministry of Statistics and
Programme Implementation (MoSPI), Government of India**. The survey ran from
August 2023 to July 2024. This project uses the public release and adds only
visualizations and summaries. It is not an official NSO product.

- 14 tables, ~46 million rows, 154 MB.
- About 304 million households and 1.43 billion people when weighted.
- Survey weights are normalized for display, so totals read as national estimates.

## Run it on your own computer

You can run the full dashboard on a laptop. You need Python only. This takes
about 10 minutes the first time.

### 1. Install Python

Download Python 3.12 or newer from https://www.python.org/downloads/ and install it.
On Windows, tick **"Add Python to PATH"** during install.

### 2. Get the code

Option A — with git (recommended for updates):

```bash
git clone https://github.com/cognirivus/hces-dashboard.git
cd hces-dashboard
```

Option B — no git: on the GitHub page, click **Code ▾ → Download ZIP**, extract it,
then open a terminal in the extracted folder (`cd hces-dashboard`).

### 3. Download the survey data

The data files are large, so they are not stored in this repository. One command
gets them from the project's public copy:

```bash
python download_data.py
```

This downloads ~130 MB and sets up the `hces_parquet/` folder.

### 4. Install the one Python package

```bash
pip install -r requirements.txt
```

### 5. Start the dashboard

```bash
python serve.py
```

Then open **http://localhost:8080** in your browser. Everything works offline
from this point.

**Optional — the ask box:** typing a question (step "Ask box" above) calls a
paid AI service. It works only if you add a key to a file named `.env`:

```
OPENCODE_API_KEY=your-key-here
```

Without the key, the rest of the dashboard works normally; only the ask box
shows a clear message. See `.env.example`.

## Deploy (advanced users only)

The live site runs on free tiers: the static site on Vercel, the API on Modal.
The live deployment is already running, so most people never need this.

```bash
# Modal API — creates your own endpoint
set MODAL_APP_NAME=my-hces-api     # optional; defaults to hces-api
python deploy/upload_data.py       # upload data to your Modal volume
modal deploy deploy/modal_app.py   # deploy the API app

# Vercel static site
cd web_dashboard
vercel --prod
vercel env add MODAL_API_URL production   # your Modal URL, e.g. https://you--my-hces-api-api.modal.run
```

`hces-dashboard.vercel.app` is a project domain, so it tracks every production
deploy. The proxy (`web_dashboard/api`) reads `MODAL_API_URL` from Vercel env —
no endpoint is committed. You also need `pip install modal` for the Modal steps.

## API

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/tables` | GET | Table list + weight scales |
| `/api/rows` | GET | Paged, filtered raw rows (`?table=&page=&per=&<col>=<code>`) |
| `/api/query` | POST | Run a SQL query (`{"sql": "..."}`) |
| `/api/ask` | POST | Ask a question in plain English (`{"question": "..."}`) |

**Rate limits (per IP, 429 when exceeded):** `/api/ask` 5/min + 200/day, `/api/query` 20/min,
data endpoints 60/min. Limits keep the shared demo safe; the survey data itself is public.

## Methodology notes

- **Per-person spending (MPCE)** = `MONTHLY_CONSUMPTION_EXP ÷ HOUSEHOLD_SIZE`, visit-1 records only.
- Percentile curves, the poor-to-rich distribution, and state medians are
  **person-weighted** (`Multiplier × household size`) — each person counts once
  through their household, matching how NSO publishes per-capita expenditure
  distributions.
- Subgroup curves appear only when the raw sample is large enough (2,000+
  households for household filters, 300+ for survey month) — a display choice,
  not an HCES rule.
- Charts marked "our calculation" (percentiles, shares) are computed from raw
  fields; they are not columns in the source files.

## License

The survey data is © NSO/MoSPI, Government of India (public release). This
project's code is available for educational use. No official endorsement implied.
