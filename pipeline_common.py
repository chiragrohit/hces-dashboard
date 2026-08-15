"""Shared constants + DuckDB setup for the offline pipeline scripts.

Used by aggregate_for_web.py and generate_metadata.py so the table list,
state names and connection logic live in one place.
"""
import os

import duckdb

BASE = os.path.dirname(os.path.abspath(__file__))
PARQUET_DIR = os.path.join(BASE, "hces_parquet")
WEB = os.path.join(BASE, "web_dashboard", "data")

# all 14 survey parquet tables (name -> level description)
TABLE_MAP = {
    "household_demographics": "LEVEL 01 - Household roster & sampling",
    "individual_characteristics": "LEVEL 02 - Individual demographics (Section 3)",
    "household_economic": "LEVEL 03 - Economic activity, land, dwelling",
    "consumption_4_1": "LEVEL 04 - Consumption (Section 4_1)",
    "food_consumption": "LEVEL 05 - Food consumption (Sections 5-6)",
    "consumption_7": "LEVEL 06 - Consumption (Section 7)",
    "consumption_4_2": "LEVEL 07 - Consumption (Section 4_2)",
    "consumption_8_1": "LEVEL 08 - Consumption (Section 8_1)",
    "consumption_9_10_11": "LEVEL 09 - Consumption (Sections 9-11)",
    "consumption_12": "LEVEL 10 - Consumption (Section 12)",
    "consumption_13": "LEVEL 12 - Consumption (Section 13)",
    "consumption_14": "Level 13 - Consumption (Section 14)",
    "imputed_rent_durables": "LEVEL 14 - Imputed rent, durables (A1,B1,C1)",
    "supplementary_consumption": "LEVEL 15 - Supplementary (A2,B2,C2)",
}

# state / UT codes used across the survey files
STATE_NAMES = {
    "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
    "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan",
    "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
    "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura",
    "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand",
    "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
    "25": "Daman & Diu", "26": "Dadra & Nagar Haveli", "27": "Maharashtra",
    "28": "Andhra Pradesh", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep",
    "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman & Nicobar",
    "36": "Telangana", "37": "Ladakh",
}


def connect():
    """In-memory DuckDB with every available parquet table as a view."""
    con = duckdb.connect()
    for table in TABLE_MAP:
        pq_path = os.path.join(PARQUET_DIR, f"{table}.parquet")
        if os.path.exists(pq_path):
            safe = pq_path.replace("'", "''")
            con.execute(f'CREATE OR REPLACE VIEW "{table}" AS SELECT * FROM read_parquet(\'{safe}\')')
    return con
