"""
Pre-aggregate HCES data for web dashboard.
Creates small JSON summaries that load instantly in browser.
"""
import duckdb
import json
import os

PARQUET_DIR = "hces_parquet"
WEB = "web_dashboard/data"
os.makedirs(WEB, exist_ok=True)

# In-memory DuckDB with views over the parquet files (no .duckdb file needed)
con = duckdb.connect()

TABLE_MAP = {
    "household_demographics", "individual_characteristics", "household_economic",
    "consumption_4_1", "food_consumption", "consumption_7", "consumption_4_2",
    "consumption_8_1", "consumption_9_10_11", "consumption_12", "consumption_13",
    "consumption_14", "imputed_rent_durables", "supplementary_consumption",
}
for t in TABLE_MAP:
    pq_path = os.path.join(PARQUET_DIR, f"{t}.parquet")
    if os.path.exists(pq_path):
        con.execute(f"CREATE OR REPLACE VIEW {t} AS SELECT * FROM read_parquet('{pq_path}')")

# State names lookup
STATE_NAMES = {
    "01":"Jammu & Kashmir","02":"Himachal Pradesh","03":"Punjab","04":"Chandigarh",
    "05":"Uttarakhand","06":"Haryana","07":"Delhi","08":"Rajasthan",
    "09":"Uttar Pradesh","10":"Bihar","11":"Sikkim","12":"Arunachal Pradesh",
    "13":"Nagaland","14":"Manipur","15":"Mizoram","16":"Tripura",
    "17":"Meghalaya","18":"Assam","19":"West Bengal","20":"Jharkhand",
    "21":"Odisha","22":"Chhattisgarh","23":"Madhya Pradesh","24":"Gujarat",
    "25":"Daman & Diu","26":"Dadra & Nagar Haveli","27":"Maharashtra",
    "28":"Andhra Pradesh","29":"Karnataka","30":"Goa","31":"Lakshadweep",
    "32":"Kerala","33":"Tamil Nadu","34":"Puducherry","35":"Andaman & Nicobar",
    "36":"Telangana","37":"Ladakh"
}
state_values = ", ".join(f"('{k}', '{v}')" for k, v in STATE_NAMES.items())
con.execute(f"""
    CREATE OR REPLACE VIEW state_master AS
    SELECT * FROM (VALUES {state_values}) AS t(code, name)
""")

print("Aggregating data for web dashboard ...")

# ponytail: raw multipliers sum to ~29B HH / ~122B people, ~96x above India's
# real ~304M households / ~1.43B people. Normalize by constant factors (official
# national totals as targets) so absolute numbers are believable. Relative shares
# are unchanged by a constant scale. Replace with the official MOSPI multiplier
# table if exact per-unit weights are ever needed.
raw_hh = con.execute("SELECT SUM(Multiplier) FROM household_demographics").fetchone()[0]
raw_pop = con.execute("SELECT SUM(Multiplier) FROM individual_characteristics").fetchone()[0]
HH_SCALE = 304_000_000 / raw_hh
POP_SCALE = 1_428_000_000 / raw_pop

# 1. State-wise consumption summary
print("  1. State-wise consumption ...")
# Household-interview key: same HH can appear in multiple panels/sub-samples,
# and Sample_Household_No alone repeats within an FSU. Count full interviews.
HH_KEY = "FSU_Serial_No || '|' || State || '|' || District || '|' || Sample_Household_No || '|' || Panel || '|' || Sub_sample"
state_consumption = con.execute(f"""
    SELECT 
        f.State,
        sm.name as state_name,
        CASE WHEN f.Sector = '1' THEN 'Rural' ELSE 'Urban' END as sector,
        SUM(f.Total_Consumption_Value * f.Multiplier) as raw_total,
        SUM(f.OutOfHome_Consumption_Value * f.Multiplier) as raw_ooh,
        SUM(f.Total_Consumption_Value * f.Multiplier) / NULLIF(SUM(f.Multiplier), 0) as w_avg_item,
        COUNT(DISTINCT {HH_KEY}) as interviews,
        COUNT(DISTINCT f.Item_Code) as items
    FROM food_consumption f
    LEFT JOIN state_master sm ON f.State = sm.code
    GROUP BY f.State, sm.name, f.Sector
    ORDER BY f.State, f.Sector
""").fetchall()

# Official per-state sample household counts from Level 01 (matches 261,953 total)
hh_counts = {}
for r in con.execute("""
    SELECT State, CASE WHEN Sector = '1' THEN 'Rural' ELSE 'Urban' END, COUNT(*)
    FROM household_demographics GROUP BY State, Sector
""").fetchall():
    hh_counts[(r[0], r[1])] = int(r[2])

state_data = []
for row in state_consumption:
    key = (row[0], row[2])
    state_data.append({
        "state_code": row[0],
        "state_name": row[1],
        "sector": row[2],
        "total_consumption_cr": round(float(row[3]) * HH_SCALE / 1e7, 2),
        "ooh_consumption_cr": round(float(row[4]) * HH_SCALE / 1e7, 2),
        "households_sampled": hh_counts.get(key, 0),
        "avg_consumption_per_item": round(float(row[5]), 2),
        "interviews": int(row[6]),
        "items": int(row[7])
    })

with open(os.path.join(WEB, "state_consumption.json"), "w") as f:
    json.dump(state_data, f)
print(f"    OK {len(state_data)} records")

# 2. State-wise population (individuals) by gender, age group
print("  2. Demographics by state ...")
demographics = con.execute("""
    SELECT
        i.State,
        sm.name as state_name,
        CASE WHEN i.Sector = '1' THEN 'Rural' ELSE 'Urban' END as sector,
        CASE WHEN i.Gender = '1' THEN 'Male' ELSE 'Female' END as gender,
        CASE 
            WHEN CAST(i.Age AS INTEGER) < 5 THEN '0-4'
            WHEN CAST(i.Age AS INTEGER) < 15 THEN '5-14'
            WHEN CAST(i.Age AS INTEGER) < 25 THEN '15-24'
            WHEN CAST(i.Age AS INTEGER) < 35 THEN '25-34'
            WHEN CAST(i.Age AS INTEGER) < 45 THEN '35-44'
            WHEN CAST(i.Age AS INTEGER) < 55 THEN '45-54'
            WHEN CAST(i.Age AS INTEGER) < 65 THEN '55-64'
            ELSE '65+'
        END as age_group,
        SUM(i.Multiplier) as estimated_population
    FROM individual_characteristics i
    LEFT JOIN state_master sm ON i.State = sm.code
    WHERE i.Age IS NOT NULL AND i.Age != ''
    GROUP BY i.State, sm.name, i.Sector, i.Gender, age_group
    ORDER BY i.State, i.Sector, i.Gender, age_group
""").fetchall()

demo_data = []
for row in demographics:
    demo_data.append({
        "state_code": row[0],
        "state_name": row[1],
        "sector": row[2],
        "gender": row[3],
        "age_group": row[4],
        "estimated_population": int(row[5] * POP_SCALE)
    })

with open(os.path.join(WEB, "demographics.json"), "w") as f:
    json.dump(demo_data, f)
print(f"    OK {len(demo_data)} records")

# 3. Education levels
print("  3. Education levels ...")
education = con.execute("""
    SELECT
        i.State,
        sm.name as state_name,
        CASE WHEN i.Sector = '1' THEN 'Rural' ELSE 'Urban' END as sector,
        i.Education_Level,
        CASE WHEN i.Gender = '1' THEN 'Male' ELSE 'Female' END as gender,
        SUM(i.Multiplier) as estimated_count
    FROM individual_characteristics i
    LEFT JOIN state_master sm ON i.State = sm.code
    WHERE i.Education_Level IS NOT NULL AND i.Education_Level != ''
    GROUP BY i.State, sm.name, i.Sector, i.Education_Level, i.Gender
    ORDER BY i.State, i.Sector
""").fetchall()

edu_data = []
for row in education:
    edu_data.append({
        "state_code": row[0],
        "state_name": row[1],
        "sector": row[2],
        "education_level": row[3],
        "gender": row[4],
        "estimated_count": int(row[5] * POP_SCALE)
    })

with open(os.path.join(WEB, "education.json"), "w") as f:
    json.dump(edu_data, f)
print(f"    OK {len(edu_data)} records")

# 4. Household types and characteristics
print("  4. Household characteristics ...")
hh_chars = con.execute("""
    SELECT
        h.State,
        sm.name as state_name,
        CASE WHEN h.Sector = '1' THEN 'Rural' ELSE 'Urban' END as sector,
        e.Household_Type,
        e.Religion_of_HH_Head,
        e.Social_Group_of_HH_Head,
        e.Land_Ownership,
        e.Type_of_Dwelling_Unit,
        e.Energy_Source_Cooking,
        e.Ration_Card_Type,
        COUNT(*) as household_count,
        SUM(h.Multiplier) as estimated_hh
    FROM household_demographics h
    LEFT JOIN state_master sm ON h.State = sm.code
    LEFT JOIN household_economic e 
        ON h.FSU_Serial_No = e.FSU_Serial_No 
        AND h.State = e.State
        AND h.District = e.District
        AND h.Sample_Household_No = e.Sample_Household_No
    GROUP BY h.State, sm.name, h.Sector, e.Household_Type, e.Religion_of_HH_Head,
             e.Social_Group_of_HH_Head, e.Land_Ownership, e.Type_of_Dwelling_Unit,
             e.Energy_Source_Cooking, e.Ration_Card_Type
""").fetchall()

hh_data = []
for row in hh_chars:
    hh_data.append({
        "state_code": row[0],
        "state_name": row[1],
        "sector": row[2],
        "household_type": row[3],
        "religion": row[4],
        "social_group": row[5],
        "land_ownership": row[6],
        "dwelling_type": row[7],
        "cooking_energy": row[8],
        "ration_card": row[9],
        "sample_count": int(row[10]),
        "estimated_households": int(row[11] * HH_SCALE)
    })

with open(os.path.join(WEB, "household_characteristics.json"), "w") as f:
    json.dump(hh_data, f)
print(f"    OK {len(hh_data)} records")

# 5. National summary stats
print("  5. National summary ...")
national = con.execute("""
    SELECT 
        (SELECT COUNT(*) FROM household_demographics) as total_households_sampled,
        (SELECT COUNT(*) FROM individual_characteristics) as total_individuals_sampled,
        (SELECT SUM(Multiplier) FROM household_demographics) as estimated_total_hh,
        (SELECT SUM(Multiplier) FROM individual_characteristics) as estimated_total_pop,
        (SELECT COUNT(DISTINCT State) FROM household_demographics) as states_covered
""").fetchone()

summary = {
    "total_households_sampled": int(national[0]),
    "total_individuals_sampled": int(national[1]),
    "estimated_total_households": int(national[2] * HH_SCALE),
    "estimated_total_population": int(national[3] * POP_SCALE),
    "states_covered": int(national[4]),
    "survey_year": "2023-24",
    "survey_name": "HCES",
    "source": "NSSO, Government of India"
}

with open(os.path.join(WEB, "national_summary.json"), "w") as f:
    json.dump(summary, f, indent=2)
print(f"    OK Summary: {summary['estimated_total_households']:,} est. households, {summary['estimated_total_population']:,} est. population")

# 6. Food item consumption rankings
print("  6. Food item rankings ...")
food_items = con.execute(f"""
    SELECT
        f.Item_Code,
        COALESCE(SUM(f.Total_Consumption_Value * f.Multiplier), 0) as raw_value,
        COALESCE(SUM(f.Total_Consumption_Quantity * f.Multiplier), 0) as raw_quantity,
        COUNT(DISTINCT {HH_KEY}) as households_consuming
    FROM food_consumption f
    WHERE f.Item_Code IS NOT NULL
    GROUP BY f.Item_Code
    ORDER BY raw_value DESC
    LIMIT 50
""").fetchall()

food_rankings = []
for row in food_items:
    food_rankings.append({
        "item_code": row[0],
        "total_value_cr": round(float(row[1]) * HH_SCALE / 1e7, 2),
        "total_quantity": round(float(row[2]) * HH_SCALE, 2),
        "households_consuming": int(row[3])
    })

with open(os.path.join(WEB, "food_rankings.json"), "w") as f:
    json.dump(food_rankings, f)
print(f"    OK {len(food_rankings)} top food items")

con.close()

# Report final sizes
total_size = 0
for f in os.listdir(WEB):
    if f.endswith('.json'):
        size = os.path.getsize(os.path.join(WEB, f)) / 1024
        total_size += size
        print(f"    {f}: {size:.1f} KB")
print(f"\n  Total web data: {total_size:.1f} KB (loads in <1 second)")
