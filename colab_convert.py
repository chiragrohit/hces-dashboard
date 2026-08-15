# ============================================================
# HCES 2023-24 JSON -> Parquet Converter (Colab-friendly)
# ============================================================

# --- STEP 0: Install deps ---
!pip install duckdb pyarrow -q

import os, time, zipfile, duckdb
from google.colab import files

DRIVE_ZIP = "/content/drive/MyDrive/HCES_Data_2023-24_Json.zip"
COLAB_ZIP = "/content/HCES_Data_2023-24_Json.zip"
EXTRACT_ROOT = "/content/hces_json"
# The zip contains a nested folder
JSON_DIR = os.path.join(EXTRACT_ROOT, "HCES_Data_2023-24_Json")
PARQUET_DIR = "/content/hces_parquet"
DB_PATH = "/content/hces.duckdb"

# --- STEP 1: Locate Zip ---
if os.path.exists(COLAB_ZIP):
    ZIP_PATH = COLAB_ZIP
    print("Found zip in Colab /content/")
else:
    if not os.path.exists('/content/drive'):
        from google.colab import drive
        drive.mount('/content/drive')
    ZIP_PATH = DRIVE_ZIP

if not os.path.exists(ZIP_PATH):
    raise SystemExit(f"Zip not found at {ZIP_PATH}.")

# --- STEP 2: Extract ---
os.makedirs(EXTRACT_ROOT, exist_ok=True)
if not os.path.exists(JSON_DIR):
    print("Extracting zip (this takes a few minutes)...")
    with zipfile.ZipFile(ZIP_PATH) as zf:
        zf.extractall(EXTRACT_ROOT)
    print("Extraction done.")
else:
    print(f"JSON folder found at {JSON_DIR}, skipping extraction.")

# --- STEP 3: Convert JSON -> Parquet ---
TABLE_MAP = {
    "LEVEL - 01(Section 1 and 1_1).json": "household_demographics",
    "LEVEL - 02 (Section 3).json": "individual_characteristics",
    "LEVEL - 03.json": "household_economic",
    "LEVEL - 04 (Section 4_1).json": "consumption_4_1",
    "LEVEL - 05 ( Sec 5  6).json": "food_consumption",
    "LEVEL - 06 (Section 7).json": "consumption_7",
    "LEVEL - 07 (Section 4_2).json": "consumption_4_2",
    "LEVEL - 08 (Section 8_1).json": "consumption_8_1",
    "LEVEL - 09 (Section 9  10  11).json": "consumption_9_10_11",
    "LEVEL - 10 (Section 12).json": "consumption_12",
    "LEVEL - 12 (Section 13).json": "consumption_13",
    "Level - 13 (Section 14).json": "consumption_14",
    "LEVEL - 14 (Section  A1,B1  C1).json": "imputed_rent_durables",
    "LEVEL - 15 (Section 1_1, A2,B2  C2).json": "supplementary_consumption",
}

os.makedirs(PARQUET_DIR, exist_ok=True)
con = duckdb.connect()

for fname, table_name in TABLE_MAP.items():
    json_path = os.path.join(JSON_DIR, fname)
    parquet_path = os.path.join(PARQUET_DIR, f"{table_name}.parquet")

    if not os.path.exists(json_path):
        print(f"  MISSING: {fname}")
        continue

    print(f"  Converting {table_name}...")
    con.execute(f"COPY (SELECT * FROM read_json_auto('{json_path}', format='array')) TO '{parquet_path}' (FORMAT PARQUET)")

con.close()

# --- STEP 4: Summary & Download ---
if os.path.exists(PARQUET_DIR) and os.listdir(PARQUET_DIR):
    !cd {PARQUET_DIR} && zip -j /content/hces_parquet.zip *.parquet
    files.download('/content/hces_parquet.zip')
    print("Done! Conversion complete and zip triggered for download.")
else:
    print("Error: No parquet files were generated.")
