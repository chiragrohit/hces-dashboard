"""Entry point. Run: python serve.py  ->  http://localhost:8080

The whole backend lives in the server/ package; this file only starts it.
"""
from server import config
from server.httpd import create_httpd


def main():
    httpd = create_httpd()
    print(f"HCES Dashboard running at http://localhost:{config.PORT}", flush=True)
    print("  /              Overview", flush=True)
    print("  /people|/households|/spending|/schemes   Tabs", flush=True)
    print("  /details?id=   Chart detail page", flush=True)
    print("  /explore       Query explorer", flush=True)
    print("  /metadata      Data catalog", flush=True)
    print("  /metadata/<table>   Raw data browser (filters in the URL)", flush=True)
    print("  /api/query     POST read-only DuckDB over hces_parquet", flush=True)
    print("  /api/rows      GET paginated raw rows with equality filters", flush=True)
    print("  /api/ask       POST natural-language -> chart (OPENCODE_API_KEY in .env)", flush=True)
    print("Press Ctrl+C to stop", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
