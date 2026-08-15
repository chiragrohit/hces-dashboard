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
# Item names from the holistic code map (build_parquet_code_map.py)
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       "hces-code", "parquet-code-map.json"), encoding="utf-8") as _f:
    _FOOD_ITEM_NAMES = json.load(_f)["tables"]["food_consumption"]["items"]
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
        "item_name": _FOOD_ITEM_NAMES.get(str(row[0]), "Item " + str(row[0])),
        "total_value_cr": round(float(row[1]) * HH_SCALE / 1e7, 2),
        "total_quantity": round(float(row[2]) * HH_SCALE, 2),
        "households_consuming": int(row[3])
    })

with open(os.path.join(WEB, "food_rankings.json"), "w") as f:
    json.dump(food_rankings, f)
print(f"    OK {len(food_rankings)} top food items")

# ----------------------------------------------------------------
# 7. People & lifestyle (marital status, internet, family role)
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
           CASE WHEN Any_member_attended_school='1' THEN 'Yes' ELSE 'No' END got,
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
schemes["school_benefits"] = weighted_rows("""
    SELECT CASE WHEN Sector='1' THEN 'Rural' ELSE 'Urban' END sector,
           SUM(CASE WHEN Free_textbooks_received='1' THEN Multiplier ELSE 0 END) textbooks,
           SUM(CASE WHEN Free_stationery_received='1' THEN Multiplier ELSE 0 END) stationery,
           SUM(CASE WHEN Free_school_bag_received='1' THEN Multiplier ELSE 0 END) school_bag,
           SUM(CASE WHEN Fee_waiver_received='1' THEN Multiplier ELSE 0 END) fee_waiver
    FROM consumption_4_2
    GROUP BY 1
""", HH_SCALE)
schemes["school_meals"] = weighted_rows("""
    SELECT CASE WHEN Sector='1' THEN 'Rural' ELSE 'Urban' END sector,
           CASE WHEN Meals_From_School IS NOT NULL AND TRY_CAST(Meals_From_School AS INT) > 0
                THEN 'Yes' ELSE 'No' END got,
           SUM(Multiplier) w
    FROM individual_characteristics
    WHERE Age IS NOT NULL AND TRY_CAST(Age AS INT) BETWEEN 5 AND 17
    GROUP BY 1,2
""", POP_SCALE)
schemes["ayushman_detail"] = weighted_rows("""
    SELECT CASE WHEN Sector='1' THEN 'Rural' ELSE 'Urban' END sector,
           SUM(CASE WHEN Ayushman_beneficiary='1' THEN Multiplier ELSE 0 END) card,
           SUM(CASE WHEN Hospitalization_case='1' THEN Multiplier ELSE 0 END) hospitalised,
           SUM(CASE WHEN Medical_benefit_received='1' THEN Multiplier ELSE 0 END) got_benefit
    FROM consumption_4_2
    GROUP BY 1
""", HH_SCALE)
write_json("schemes.json", schemes)
print(f"    OK schemes.json")

# ----------------------------------------------------------------
# 11. Income & spending power (MPCE from monthly expenditure records)
# ----------------------------------------------------------------
print("  11. Income & spending power ...")
# Monthly per-capita consumption expenditure: visit-1 records only (one per household)
MPCE = "MONTHLY_CONSUMPTION_EXP / NULLIF(HOUSEHOLD_SIZE, 0)"
income = {}

# Weighted percentile curves (p1..p99) per filter group. The survey multiplier
# weights each household; a plain quantile would bias toward small-sample
# groups, so cumulative weights are used and the value at each p is
# interpolated between neighboring observations.
def weighted_curves(rows, min_rows=1):
    """rows: [(group, mpce, multiplier)] sorted later. Returns {group: [p1..p99]}."""
    from collections import defaultdict
    groups = defaultdict(list)
    for g, m, w in rows:
        if w is None or w <= 0 or m is None:
            continue
        groups[g].append((m, w))
    out = {}
    for g, pts in groups.items():
        if len(pts) < min_rows:
            continue  # tiny groups are noise; skip
        pts.sort()
        total = sum(w for _, w in pts)
        cum = 0.0
        res = []
        idx = 0
        for p in range(1, 100):
            target = total * p / 100.0
            while idx < len(pts) - 1 and cum + pts[idx][1] < target:
                cum += pts[idx][1]
                idx += 1
            # interpolate within the bucket containing the target
            lo_m, lo_w = pts[idx]
            if idx + 1 < len(pts):
                hi_m = pts[idx + 1][0]
            else:
                hi_m = lo_m
            frac = 0.0
            if lo_w > 0 and target > cum:
                frac = min(1.0, (target - cum) / lo_w)
            res.append(round(lo_m + frac * (hi_m - lo_m)))
        out[g] = res
    return out

def mp_rows(filter_col, from_hec=False):
    """Fetch (group, mpce, multiplier) for one filter column."""
    if from_hec:
        return con.execute(f"""
            WITH mp AS (
              SELECT {HH_KEY} hid, {MPCE} mpce, MULTIPLIER w
              FROM supplementary_consumption
              WHERE VISIT='1' AND MONTHLY_CONSUMPTION_EXP>0 AND HOUSEHOLD_SIZE>0
            ), h AS (SELECT {HH_KEY} hid, {filter_col} g FROM household_economic)
            SELECT h.g, mp.mpce, mp.w FROM mp JOIN h USING(hid) WHERE h.g IS NOT NULL
        """).fetchall()
    # direct column on supplementary (sector / state / visit month)
    return con.execute(f"""
        SELECT {filter_col}, {MPCE}, MULTIPLIER
        FROM supplementary_consumption
        WHERE VISIT='1' AND MONTHLY_CONSUMPTION_EXP>0 AND HOUSEHOLD_SIZE>0
          AND {filter_col} IS NOT NULL
    """).fetchall()

# --- sector (Rural/Urban) ---
income["curves"] = {}
cur = weighted_curves([
    ("Rural" if g == "1" else "Urban", m, w) for g, m, w in mp_rows("Sector")
])
income["curves"]["sector"] = cur

# --- state (top states only; 36 lines are unreadable) ---
state_rows = mp_rows("State")
state_rows = [(STATE_NAMES.get(g, g), m, w) for g, m, w in state_rows]
cur = weighted_curves(state_rows)
# keep 12 biggest states by median p50
ranked = sorted(cur.items(), key=lambda kv: kv[1][49], reverse=True)
income["curves"]["state"] = dict(ranked[:12])

# --- household-level filters via household_economic ---
FILTERS = {
    "hhtype": ("Household_Type", True),
    "social": ("Social_Group_of_HH_Head", True),
    "religion": ("Religion_of_HH_Head", True),
    "land": ("Land_Ownership", True),
    "cooking": ("Energy_Source_Cooking", True),
    "ration": ("Ration_Card_Type", True),
    "dwelling": ("Type_of_Dwelling_Unit", True),
    "month": ("VISIT_MONTH", False),
}
for name, (col, via_hec) in FILTERS.items():
    rows = mp_rows(col, via_hec)
    if name == "month":
        # VISIT_MONTH is like 102023 / 12024 -> month digits + year
        def fmt_month(v):
            v = str(v)
            return f"{int(v[:-4])}/{v[-4:]}"
        rows = [(fmt_month(g), m, w) for g, m, w in rows]
    income["curves"][name] = weighted_curves(rows, min_rows=2000 if name in ("social", "religion", "cooking", "ration", "hhtype", "land", "dwelling") else 300)

income["dist"] = con.execute(f"""
    SELECT round(quantile_cont({MPCE}, .1))::BIGINT p10,
           round(quantile_cont({MPCE}, .2))::BIGINT p20,
           round(quantile_cont({MPCE}, .3))::BIGINT p30,
           round(quantile_cont({MPCE}, .4))::BIGINT p40,
           round(quantile_cont({MPCE}, .5))::BIGINT p50,
           round(quantile_cont({MPCE}, .6))::BIGINT p60,
           round(quantile_cont({MPCE}, .7))::BIGINT p70,
           round(quantile_cont({MPCE}, .8))::BIGINT p80,
           round(quantile_cont({MPCE}, .9))::BIGINT p90,
           round(avg({MPCE}))::BIGINT mean
    FROM supplementary_consumption
    WHERE VISIT='1' AND MONTHLY_CONSUMPTION_EXP>0 AND HOUSEHOLD_SIZE>0
""").fetchone()
income["dist"] = {
    k: int(v) for k, v in zip(
        ["p10", "p20", "p30", "p40", "p50", "p60", "p70", "p80", "p90", "mean"], income["dist"])
}

income["state"] = con.execute(f"""
    SELECT sm.name state_name,
           CASE WHEN s.Sector='1' THEN 'Rural' ELSE 'Urban' END sector,
           round(median({MPCE}))::BIGINT median_mpce
    FROM supplementary_consumption s
    LEFT JOIN state_master sm ON s.State = sm.code
    WHERE VISIT='1' AND MONTHLY_CONSUMPTION_EXP>0 AND HOUSEHOLD_SIZE>0
    GROUP BY 1,2
""").fetchall()
income["state"] = [
    {"state_name": r[0], "sector": r[1], "median_mpce": int(r[2])} for r in income["state"]
]

# Food vs non-food share of the total monthly budget (visit-1 weights)
food_cr = con.execute("SELECT SUM(Total_Consumption_Value * Multiplier)/1e7 FROM food_consumption").fetchone()[0]
total_cr = con.execute("""
    SELECT SUM(MONTHLY_CONSUMPTION_EXP * MULTIPLIER)/1e7
    FROM supplementary_consumption WHERE VISIT='1'
""").fetchone()[0]
income["budget"] = {
    "food_cr": round(float(food_cr) * HH_SCALE, 0),
    "total_cr": round(float(total_cr) * HH_SCALE, 0),
    "food_share_pct": round(100.0 * food_cr / total_cr, 1),
}
write_json("income.json", income)
print(f"    OK income.json")

# ----------------------------------------------------------------
# 12. Non-food spending (clothing, services, durables, fuel, tobacco)
#     All money rows are converted to MONTHLY CRORE so charts are comparable:
#     raw rupees * HH_SCALE / 1e7, then recall-period normalized
#     (365-day blocks /12, 7-day blocks *30/7, 30-day blocks as-is).
# ----------------------------------------------------------------
def money_rows(sql, period):
    """Run a weighted money query and normalize to monthly crore."""
    rows = con.execute(sql).fetchall()
    factor = {'30d': 1.0, '7d': 30.0 / 7.0, '365d': 1.0 / 12.0}[period]
    out = []
    for r in rows:
        d = dict(zip([c[0] for c in con.description], r))
        d["w"] = round(float(d["w"]) * HH_SCALE / 1e7 * factor, 2)
        out.append(d)
    return out

print("  12. Non-food spending ...")
# clothing: 13.1/13.2/13.3 subtotals (365-day recall)
spend_extra["clothing"] = money_rows("""
    SELECT CASE WHEN Sector='1' THEN 'Rural' ELSE 'Urban' END sector,
           ITEM_CODE code,
           SUM(MULTIPLIER * VALUE) w
    FROM consumption_13
    WHERE ITEM_CODE IN ('379','389','399')
    GROUP BY 1,2
""", '365d')
# services: education (409) + hospitalisation (419) are 365-day recall;
# medical-other (429), consumer services (499), conveyance (519) and
# rent (539) are 30-day. Normalize per code to monthly crore.
SVC_FACTOR = {"409": 1.0 / 12.0, "419": 1.0 / 12.0,
              "429": 1.0, "499": 1.0, "519": 1.0, "539": 1.0}
_rows = con.execute("""
    SELECT CASE WHEN Sector='1' THEN 'Rural' ELSE 'Urban' END sector,
           Item_Code_9_1_to_11_4 code,
           SUM(MULTIPLIER * Value_Rs_9_1_to_11_4) w
    FROM consumption_9_10_11
    WHERE Item_Code_9_1_to_11_4 IN ('409','419','429','499','519','539')
    GROUP BY 1,2
""").fetchall()
spend_extra["services"] = [
    {"sector": r[0], "code": r[1],
     "w": round(float(r[2]) * HH_SCALE / 1e7 * SVC_FACTOR.get(r[1], 1.0), 2)}
    for r in _rows
]
# fuel/light: 8.1 (30-day recall). Includes electricity, LPG, firewood and
# small fuels; petrol/diesel here are near-zero because vehicle fuel is
# recorded under conveyance (11.1).
spend_extra["fuel"] = money_rows("""
    SELECT CASE WHEN Sector='1' THEN 'Rural' ELSE 'Urban' END sector,
           Item_Code_8_1 code,
           SUM(MULTIPLIER * Total_consumption_value_rs) w
    FROM consumption_8_1
    WHERE Item_Code_8_1 IN ('331','332','333','334','335','336','337','338','340','341','342','343','346','096')
    GROUP BY 1,2
""", '30d')
# tobacco/intoxicants: 12.2/12.3 subtotals (7-day recall)
spend_extra["tobacco"] = money_rows("""
    SELECT CASE WHEN Sector='1' THEN 'Rural' ELSE 'Urban' END sector,
           Item_Code_12_series code,
           SUM(MULTIPLIER * Total_Consumption_Value_12_serie) w
    FROM consumption_12
    WHERE Item_Code_12_series IN ('319','329')
    GROUP BY 1,2
""", '7d')
spend_extra["durables"] = weighted_rows("""
    SELECT ITEM_CODE code,
           SUM(CASE WHEN FIRST_PURCHASE_NUMBER > 0 THEN MULTIPLIER ELSE 0 END) w
    FROM consumption_14
    WHERE ITEM_CODE IN ('580','623','560','590','588','585','601','581','602')
    GROUP BY 1
""", HH_SCALE)
spend_extra["online_channels"] = weighted_rows("""
    SELECT CASE WHEN Sector='1' THEN 'Rural' ELSE 'Urban' END sector,
           CASE
             WHEN COALESCE(Online_purchase_medicine,0) > 0 THEN 'Medicine'
             WHEN COALESCE(Online_purchase_services,0) > 0 THEN 'Services'
             WHEN COALESCE(Online_purchase_education,0) > 0 THEN 'Education'
             WHEN COALESCE(Online_purchase_fuel_light,0) > 0 THEN 'Fuel & light'
             WHEN COALESCE(Online_purchase_toilet_articles,0) > 0 THEN 'Toilet articles'
           END channel,
           SUM(Multiplier) w
    FROM consumption_4_2
    WHERE Online_purchase_medicine>0 OR Online_purchase_services>0 OR Online_purchase_education>0
       OR Online_purchase_fuel_light>0 OR Online_purchase_toilet_articles>0
    GROUP BY 1,2
""", HH_SCALE)
write_json("spending_extras.json", spend_extra)
print(f"    OK spending_extras.json")

# ----------------------------------------------------------------
# 13. Literacy + employment
# ----------------------------------------------------------------
print("  13. Literacy, employment ...")
people["literacy"] = weighted_rows("""
    SELECT CASE WHEN Sector='1' THEN 'Rural' ELSE 'Urban' END sector,
           CASE WHEN Gender='1' THEN 'Male' ELSE 'Female' END gender,
           CASE WHEN Years_of_Education IS NOT NULL AND TRY_CAST(Years_of_Education AS INT) > 0
                THEN 'Literate' ELSE 'Not literate' END lit,
           SUM(Multiplier) w
    FROM individual_characteristics
    WHERE Years_of_Education IS NOT NULL
    GROUP BY 1,2,3
""")
write_json("people.json", people)
hh_extra["employment"] = weighted_rows("""
    SELECT CASE WHEN Sector='1' THEN 'Rural' ELSE 'Urban' END sector,
           CASE WHEN Engaged_in_Economic_Activity_Las='1' THEN 'Working' ELSE 'Not working' END status,
           SUM(Multiplier) w
    FROM household_economic
    WHERE Engaged_in_Economic_Activity_Las IN ('1','2')
    GROUP BY 1,2
""", HH_SCALE)
write_json("household_extras.json", hh_extra)
print(f"    OK household_extras.json")

con.close()

# Report final sizes
total_size = 0
for f in os.listdir(WEB):
    if f.endswith('.json'):
        size = os.path.getsize(os.path.join(WEB, f)) / 1024
        total_size += size
        print(f"    {f}: {size:.1f} KB")
print(f"\n  Total web data: {total_size:.1f} KB (loads in <1 second)")
