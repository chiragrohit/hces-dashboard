"""
Pre-aggregate HCES data for web dashboard.
Creates small JSON summaries that load instantly in browser.
Run: python aggregate_for_web.py  (from the project root)
"""
import json
import os

from pipeline_common import WEB, STATE_NAMES, connect

os.makedirs(WEB, exist_ok=True)
con = connect()

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

# ----------------------------------------------------------------
# 7. People & lifestyle (marital status, internet, meals, family role)
# ----------------------------------------------------------------
def write_json(name, data):
    with open(os.path.join(WEB, name), "w") as f:
        json.dump(data, f)

def weighted_rows(sql, scale=POP_SCALE):
    rows = con.execute(sql).fetchall()
    out = []
    for r in rows:
        d = dict(zip([c[0] for c in con.description], r))
        for k, v in d.items():
            if k == "w" or k.startswith("w_") or k in ("govt", "private"):
                d[k] = int(v * scale) if v is not None else 0
        out.append(d)
    return out

print("  7. People & lifestyle ...")
people = {}
people["marital"] = weighted_rows("""
    SELECT CASE WHEN Sector='1' THEN 'Rural' ELSE 'Urban' END sector,
           CASE WHEN Gender='1' THEN 'Male' ELSE 'Female' END gender,
           Marital_Status code, SUM(Multiplier) w
    FROM individual_characteristics
    WHERE Age IS NOT NULL AND TRY_CAST(Age AS INT) >= 15 AND Marital_Status IS NOT NULL
    GROUP BY 1,2,3
""")
people["internet"] = weighted_rows("""
    SELECT CASE WHEN Sector='1' THEN 'Rural' ELSE 'Urban' END sector,
           CASE
             WHEN TRY_CAST(Age AS INT) < 15 THEN 'Under 15'
             WHEN TRY_CAST(Age AS INT) < 25 THEN '15-24'
             WHEN TRY_CAST(Age AS INT) < 45 THEN '25-44'
             ELSE '45+'
           END age_group,
           CASE WHEN Used_Internet_Last_30_Days='1' THEN 'Yes' ELSE 'No' END used,
           SUM(Multiplier) w
    FROM individual_characteristics
    WHERE Used_Internet_Last_30_Days IN ('1','2')
    GROUP BY 1,2,3
""")
people["meals"] = weighted_rows("""
    SELECT CASE WHEN Sector='1' THEN 'Rural' ELSE 'Urban' END sector,
           Meals_Usually_Taken_Per_Day meals, SUM(Multiplier) w
    FROM individual_characteristics
    WHERE Meals_Usually_Taken_Per_Day IN ('0','1','2','3')
    GROUP BY 1,2
""")
people["relation"] = weighted_rows("""
    SELECT CASE WHEN Sector='1' THEN 'Rural' ELSE 'Urban' END sector,
           Relation_to_Head code, SUM(Multiplier) w
    FROM individual_characteristics
    WHERE Relation_to_Head IS NOT NULL
    GROUP BY 1,2
""")
write_json("people.json", people)
print(f"    OK people.json")

# ----------------------------------------------------------------
# 8. Household extras (social group, lighting, Ujjwala, HH size)
# ----------------------------------------------------------------
print("  8. Household extras ...")
hh_extra = {}
hh_extra["social_group"] = weighted_rows("""
    SELECT CASE WHEN h.Sector='1' THEN 'Rural' ELSE 'Urban' END sector,
           e.Social_Group_of_HH_Head code, SUM(h.Multiplier) w
    FROM household_demographics h JOIN household_economic e
      ON h.FSU_Serial_No=e.FSU_Serial_No AND h.State=e.State
     AND h.District=e.District AND h.Sample_Household_No=e.Sample_Household_No
    WHERE e.Social_Group_of_HH_Head IS NOT NULL
    GROUP BY 1,2
""", HH_SCALE)
hh_extra["lighting"] = weighted_rows("""
    SELECT CASE WHEN h.Sector='1' THEN 'Rural' ELSE 'Urban' END sector,
           e.Energy_Source_Lighting code, SUM(h.Multiplier) w
    FROM household_demographics h JOIN household_economic e
      ON h.FSU_Serial_No=e.FSU_Serial_No AND h.State=e.State
     AND h.District=e.District AND h.Sample_Household_No=e.Sample_Household_No
    WHERE e.Energy_Source_Lighting IS NOT NULL
    GROUP BY 1,2
""", HH_SCALE)
hh_extra["ujjwala"] = weighted_rows("""
    SELECT CASE WHEN h.Sector='1' THEN 'Rural' ELSE 'Urban' END sector,
           CASE WHEN e.Benefitted_From_PMGKY='1' THEN 'Yes' ELSE 'No' END got,
           SUM(h.Multiplier) w
    FROM household_demographics h JOIN household_economic e
      ON h.FSU_Serial_No=e.FSU_Serial_No AND h.State=e.State
     AND h.District=e.District AND h.Sample_Household_No=e.Sample_Household_No
    WHERE e.Benefitted_From_PMGKY IN ('1','2')
    GROUP BY 1,2
""", HH_SCALE)
hh_extra["hh_size"] = weighted_rows("""
    SELECT CASE WHEN Sector='1' THEN 'Rural' ELSE 'Urban' END sector,
           CASE
             WHEN HH_Size_FDQ=1 THEN '1'
             WHEN HH_Size_FDQ=2 THEN '2'
             WHEN HH_Size_FDQ=3 THEN '3'
             WHEN HH_Size_FDQ=4 THEN '4'
             WHEN HH_Size_FDQ=5 THEN '5'
             WHEN HH_Size_FDQ=6 THEN '6'
             WHEN HH_Size_FDQ=7 THEN '7'
             ELSE '8+'
           END size, SUM(Multiplier) w
    FROM household_economic
    WHERE HH_Size_FDQ IS NOT NULL
    GROUP BY 1,2
""", HH_SCALE)
write_json("household_extras.json", hh_extra)
print(f"    OK household_extras.json")

# ----------------------------------------------------------------
# 9. Spending extras (food source, online groceries)
# ----------------------------------------------------------------
print("  9. Spending extras ...")
spend_extra = {}
spend_extra["food_source"] = weighted_rows("""
    SELECT CASE WHEN Sector='1' THEN 'Rural' ELSE 'Urban' END sector,
           Source code, COUNT(*) w
    FROM food_consumption
    WHERE Source IS NOT NULL AND Source IN ('1','2','3','4','5','6','7','9')
    GROUP BY 1,2
""", 1)
spend_extra["online_grocery"] = weighted_rows("""
    SELECT CASE WHEN Sector='1' THEN 'Rural' ELSE 'Urban' END sector,
           CASE WHEN Online_Groceries='1' THEN 'Yes' ELSE 'No' END bought,
           SUM(Multiplier) w
    FROM consumption_4_1
    WHERE Online_Groceries IN ('1', '2') OR Online_Groceries IS NULL
    GROUP BY 1,2
""", HH_SCALE)
write_json("spending_extras.json", spend_extra)
print(f"    OK spending_extras.json")

# ----------------------------------------------------------------
# 10. Govt schemes (PDS, LPG subsidy, electricity, Ayushman, schools)
# ----------------------------------------------------------------
print("  10. Govt schemes ...")
schemes = {}
schemes["pds"] = weighted_rows("""
    SELECT CASE WHEN Sector='1' THEN 'Rural' ELSE 'Urban' END sector,
           CASE WHEN Ration_Any_Item_Last_30_Days='1' THEN 'Yes' ELSE 'No' END got,
           SUM(Multiplier) w
    FROM consumption_4_1
    WHERE Ration_Any_Item_Last_30_Days IN ('1','2')
    GROUP BY 1,2
""", HH_SCALE)
schemes["lpg_subsidy"] = weighted_rows("""
    SELECT CASE WHEN Sector='1' THEN 'Rural' ELSE 'Urban' END sector,
           CASE WHEN LPG_subsidy_received='1' THEN 'Yes' ELSE 'No' END got,
           SUM(Multiplier) w
    FROM consumption_4_2
    WHERE LPG_subsidy_received IN ('1','2')
    GROUP BY 1,2
""", HH_SCALE)
schemes["free_electricity"] = weighted_rows("""
    SELECT CASE WHEN Sector='1' THEN 'Rural' ELSE 'Urban' END sector,
           CASE WHEN Free_electricity='1' THEN 'Yes' ELSE 'No' END got,
           SUM(Multiplier) w
    FROM consumption_4_2
    WHERE Free_electricity IN ('1','2')
    GROUP BY 1,2
""", HH_SCALE)
schemes["ayushman"] = weighted_rows("""
    SELECT CASE WHEN Sector='1' THEN 'Rural' ELSE 'Urban' END sector,
           CASE WHEN Ayushman_beneficiary='1' THEN 'Yes' ELSE 'No' END got,
           SUM(Multiplier) w
    FROM consumption_4_2
    WHERE Ayushman_beneficiary IN ('1','2')
    GROUP BY 1,2
""", HH_SCALE)
schemes["school"] = weighted_rows("""
    SELECT CASE WHEN Sector='1' THEN 'Rural' ELSE 'Urban' END sector,
           CASE WHEN Any_member_attended_school='1' THEN 'Yes' ELSE 'No' END attended,
           SUM(Multiplier) w
    FROM consumption_4_2
    WHERE Any_member_attended_school IN ('1','2')
    GROUP BY 1,2
""", HH_SCALE)
schemes["school_govt_private"] = weighted_rows("""
    SELECT CASE WHEN Sector='1' THEN 'Rural' ELSE 'Urban' END sector,
           SUM(COALESCE(Num_govt_school_attended,0) * Multiplier) govt,
           SUM(COALESCE(Num_private_school_attended,0) * Multiplier) private
    FROM consumption_4_2
    GROUP BY 1
""", HH_SCALE)
write_json("schemes.json", schemes)
print(f"    OK schemes.json")

con.close()

# Report final sizes
total_size = 0
for f in os.listdir(WEB):
    if f.endswith('.json'):
        size = os.path.getsize(os.path.join(WEB, f)) / 1024
        total_size += size
        print(f"    {f}: {size:.1f} KB")
print(f"\n  Total web data: {total_size:.1f} KB (loads in <1 second)")
