"""HCES dashboard backend.

Modules:
- config   paths, environment, constants
- db       read-only DuckDB over the parquet files
- catalog  metadata.json loading + LLM catalog context
- llm      natural-language question -> validated chart config
- httpd    HTTP server, routing and JSON APIs

Each module can be imported and tested on its own.
"""
