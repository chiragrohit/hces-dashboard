"""
Convert HCES 2023-24 JSON files to Parquet + DuckDB.
Reduces 22GB JSON -> ~1-2GB Parquet with fast SQL queries.
"""
import json
import os
import pyarrow as pa
import pyarrow.parquet as pq
import duckdb
import time

SRC = "HCES_Data_2023-24_Json"
OUT = "hces_data"
DB = "hces.duckdb"

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

os.makedirs(OUT, exist_ok=True)

for fname, table_name in TABLE_MAP.items():
    src_path = os.path.join(SRC, fname)
    dst_path = os.path.join(OUT, f"{table_name}.parquet")

    if os.path.exists(dst_path):
        print(f"  SKIP {table_name} already exists")
        continue

    t0 = time.time()
    print(f"  Converting {fname} -> {table_name}.parquet ...")

    with open(src_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if not data:
        print(f"  WARN Empty file, skipping")
        continue

    table = pa.Table.from_pylist(data)

    new_cols = []
    for i, col in enumerate(table.column_names):
        c = table.column(i)
        if c.type == pa.string() and c.null_count < len(c) * 0.5:
            try:
                n_unique = len(set(c.to_pylist()) - {None})
                if n_unique < 100:
                    c = c.dictionary_encode()
            except:
                pass
        new_cols.append(c)

    table = pa.table(new_cols, names=table.column_names)
    pq.write_table(table, dst_path, compression="snappy", use_dictionary=True)

    src_size = os.path.getsize(src_path) / (1024**2)
    dst_size = os.path.getsize(dst_path) / (1024**2)
    elapsed = time.time() - t0
    pct = 100 * (1 - dst_size / src_size) if src_size > 0 else 0
    print(f"    {src_size:.0f}MB -> {dst_size:.0f}MB ({pct:.0f}% smaller) [{elapsed:.1f}s]")

print(f"\nCreating {DB}...")
con = duckdb.connect(DB)

for fname, table_name in TABLE_MAP.items():
    parquet_path = os.path.join(OUT, f"{table_name}.parquet")
    if os.path.exists(parquet_path):
        con.execute(f"DROP TABLE IF EXISTS {table_name}")
        con.execute(f"CREATE TABLE {table_name} AS SELECT * FROM read_parquet('{parquet_path}')")
        count = con.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
        print(f"  OK {table_name}: {count:,} rows")

print("\nCreating views...")

STATE_NAMES = {
    "01":"Jammu & Kashmir","02":"Himachal Pradesh","03":"Punjab","04":"Chandigarh",
    "05":"Uttarakhand","06":"Haryana","07":"Delhi","08":"Rajasthan",
    "09":"Uttar Pradesh","10":"Bihar","11":"Sikkim","12":"Arunachal Pradesh",
    "13":"Nagaland","14":"Manipur","15":"Mizoram","16":"Tripura",
    "17":"Meghalaya","18":"Assam","19":"West Bengal","20":"Jharkhand",
    "21":"Odisha","22":"Chhattisgarh","23":"Madhya Pradesh","24":"Gujarat",
    "25":"Daman & Diu","26":"Dadra & Nagar Haveli","27":"Maharashtra",
    "28":"Andhra Pradesh","29":"Karnataka","30":"Goa","31":"Lakshadweep",
    "32":"Kerala","33":"Tamil Nadu","33":"Puducherry","35":"Andaman & Nicobar",
    "36":"Telangana","37":"Ladakh"
}

state_values = ", ".join(f"('{k}', '{v}')" for k, v in STATE_NAMES.items())
con.execute(f"""
    CREATE OR REPLACE VIEW state_master AS
    SELECT * FROM (VALUES {state_values}) AS t(code, name)
""")

con.execute("""
    CREATE OR REPLACE VIEW household_summary AS
    SELECT
        h.FSU_Serial_No, h.State, sm.name as State_Name,
        CASE WHEN h.Sector = '1' THEN 'Rural' ELSE 'Urban' END as Sector,
        h.District, h.Sample_Household_No, h.Multiplier as HH_Multiplier,
        e.HH_Size_FDQ, e.Household_Type, e.Religion_of_HH_Head,
        e.Social_Group_of_HH_Head, e.Land_Ownership, e.Type_of_Dwelling_Unit,
        e.Energy_Source_Cooking, e.Energy_Source_Lighting,
        e.Ration_Card_Type, e.Benefitted_From_PMGKY
    FROM household_demographics h
    LEFT JOIN state_master sm ON h.State = sm.code
    LEFT JOIN household_economic e
        ON h.FSU_Serial_No = e.FSU_Serial_No
        AND h.State = e.State AND h.District = e.District
        AND h.Sample_Household_No = e.Sample_Household_No
""")

con.execute("""
    CREATE OR REPLACE VIEW individual_summary AS
    SELECT
        i.FSU_Serial_No, i.State, sm.name as State_Name,
        CASE WHEN i.Sector = '1' THEN 'Rural' ELSE 'Urban' END as Sector,
        i.Sample_Household_No, i.Person_Serial_No, i.Relation_to_Head,
        i.Gender, i.Age, i.Marital_Status, i.Education_Level,
        i.Years_of_Education, i.Used_Internet_Last_30_Days,
        i.Meals_Usually_Taken_Per_Day, i.Multiplier
    FROM individual_characteristics i
    LEFT JOIN state_master sm ON i.State = sm.code
""")

print("  Views created")

print("\n=== Dataset Summary ===")
for table in con.execute("SHOW TABLES").fetchall():
    tname = table[0]
    if tname == "state_master":
        continue
    count = con.execute(f"SELECT COUNT(*) FROM {tname}").fetchone()[0]
    print(f"  {tname}: {count:,} rows")

con.close()

parquet_total = sum(
    os.path.getsize(os.path.join(OUT, f))
    for f in os.listdir(OUT) if f.endswith('.parquet')
) / (1024**2)
db_size = os.path.getsize(DB) / (1024**2)
json_total = sum(
    os.path.getsize(os.path.join(SRC, f))
    for f in os.listdir(SRC) if f.endswith('.json')
) / (1024**2)

print(f"\n=== Size Comparison ===")
print(f"  Original JSON:   {json_total:,.0f} MB")
print(f"  Parquet files:   {parquet_total:,.0f} MB ({100*(1-parquet_total/json_total):.0f}% smaller)")
print(f"  DuckDB database: {db_size:,.0f} MB")
print(f"  Total optimized: {parquet_total + db_size:,.0f} MB")
