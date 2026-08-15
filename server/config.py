"""Paths, environment and constants shared across the server package."""
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DASH = os.path.join(BASE, "web_dashboard")
PARQUET = os.path.join(BASE, "hces_parquet")
METADATA = os.path.join(DASH, "data", "metadata.json")

PORT = 8080
MEMORY_LIMIT = "2GB"
QUERY_ROW_LIMIT = 5000

DASHBOARD_PATHS = {"/", "/people", "/households", "/spending", "/schemes", "/consumption", "/demographics", "/income"}
PAGES = {"/metadata": "metadata.html", "/details": "detail.html", "/explore": "explorer.html"}

# OpenCode Go (subscription) endpoint for the "ask in English" feature
LLM_URL = "https://opencode.ai/zen/go/v1/chat/completions"
DEFAULT_ZEN_MODEL = "deepseek-v4-flash"
LLM_TIMEOUT_SECONDS = 90
LLM_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"
)

NUMERIC_TYPES = {"BIGINT", "INTEGER", "DOUBLE", "FLOAT", "DECIMAL", "HUGEINT", "UBIGINT", "SMALLINT"}

# national totals used to normalize the survey Multiplier
POPULATION_ESTIMATE = 1_428_000_000
HOUSEHOLD_ESTIMATE = 304_000_000


def load_env(env_path=None):
    """Read KEY=VALUE lines from a .env file into a dict (stdlib only)."""
    env = {}
    path = env_path or os.path.join(BASE, ".env")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def zen_credentials():
    """OpenCode Go API key + model. Environment variable wins over .env."""
    env = load_env()
    key = os.environ.get("OPENCODE_API_KEY") or env.get("OPENCODE_API_KEY", "")
    model = os.environ.get("ZEN_MODEL") or env.get("ZEN_MODEL", DEFAULT_ZEN_MODEL)
    return key.strip(), model.strip()
