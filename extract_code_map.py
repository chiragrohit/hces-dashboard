"""
Extract the complete HCES 2023-24 code map from the official questionnaire.

Source: hces-code/HCES_2023-24_Questionnaire.pdf (LCES/HCQ/FDQ/CSQ/DGQ schedules,
downloaded from the MOSPI microdata site). The survey microdata stores only
codes; this script turns the questionnaire's code definitions + full item-code
lists into one machine-readable file: hces-code/code_map.json.

Every extracted map is validated against the actual parquet values: a column
meaning dict must cover every distinct value found in the data, and every
item code in the consumption tables must have a name. Any miss is reported.

Run: python extract_code_map.py  (from the project root)
"""
import csv
import json
import os
import re

import duckdb
import pypdf

from pipeline_common import STATE_NAMES

BASE = os.path.dirname(os.path.abspath(__file__))
PDF = os.path.join(BASE, "hces-code", "HCES_2023-24_Questionnaire.pdf")
OCR_MD = os.path.join(BASE, "hces-code", "HCES-ocr-mistral", "markdown.md")
OCR_JSON = os.path.join(BASE, "hces-code", "HCES-ocr-mistral", "document-annotation.json")
OUT = os.path.join(BASE, "hces-code", "code_map.json")
PARQUET = os.path.join(BASE, "hces_parquet")
STATE_CSV = os.path.join(BASE, "hces-code", "tabulation_state_code.csv")

# --------------------------------------------------------------------------
# Answer-code meanings, transcribed from the questionnaire (verified against
# the actual distinct values in the parquet files by validate_column_maps).
# --------------------------------------------------------------------------
COLUMN_MAPS = {
    "Sector": {"1": "Rural", "2": "Urban"},
    "Gender": {"1": "Male", "2": "Female", "3": "Transgender"},
    "Marital_Status": {
        "1": "Never married", "2": "Currently married",
        "3": "Widowed", "4": "Divorced/separated",
    },
    "Used_Internet_Last_30_Days": {"1": "Yes", "2": "No"},
    "Sub_sample": {"1": "Sub-sample 1", "2": "Sub-sample 2"},
    "Questionnaire_No": {
        "H": "HCQ - Household Characteristics questionnaire (levels 01-03)",
        "F": "FDQ - Food Items questionnaire (levels 04-06)",
        "C": "CSQ - Consumables & Services questionnaire (levels 07-10)",
        "D": "DGQ - Durable Items questionnaire (levels 11-13)",
        "A": "Type A questionnaire", "B": "Type B questionnaire",
    },
    "Survey_Code": {"1": "Original", "2": "Substitute", "3": "Casualty"},
    "Reason_for_Substitution_Code": {
        "1": "Informant busy", "2": "Members away from home",
        "3": "Informant non-cooperative", "9": "Others",
    },
    "Relation_to_Head": {
        "1": "Self", "2": "Spouse of head", "3": "Married child",
        "4": "Spouse of married child", "5": "Unmarried child", "6": "Grandchild",
        "7": "Father/mother/father-in-law/mother-in-law",
        "8": "Brother/sister/brother-in-law/sister-in-law/other relatives",
        "9": "Servants/employees/other non-relatives",
    },
    "Education_Level": {
        "01": "Not literate", "02": "Literate without formal schooling (NFEC/AEC/TLC)",
        "03": "Below primary", "04": "Primary", "05": "Upper primary/middle",
        "06": "Secondary", "07": "Higher secondary",
        "08": "Diploma/certificate course (up to secondary)",
        "10": "Diploma/certificate course (higher secondary)",
        "11": "Diploma/certificate course (graduation and above)",
        "12": "Graduate", "13": "Post graduate and above",
    },
    "Engaged_in_Economic_Activity_Las": {"1": "Yes", "2": "No"},
    "Max_Income_Activity": {
        "1": "Self-employment", "2": "Regular wage/salary earning", "3": "Casual labour",
    },
    "Self_Employment_Source_Sector": {"1": "Agriculture", "2": "Non-agriculture"},
    "Regular_Wage_Source_Sector": {"3": "Agriculture", "4": "Non-agriculture"},
    "Casual_Labour_Source_Sector": {"5": "Agriculture", "6": "Non-agriculture"},
    "Household_Type": {
        "1": "Self-employed in agriculture", "2": "Self-employed in non-agriculture",
        "3": "Regular wage/salary earning in agriculture",
        "4": "Regular wage/salary earning in non-agriculture",
        "5": "Casual labour in agriculture", "6": "Casual labour in non-agriculture",
        "9": "Others",
    },
    "Religion_of_HH_Head": {
        "1": "Hinduism", "2": "Islam", "3": "Christianity", "4": "Sikhism",
        "5": "Jainism", "6": "Buddhism", "7": "Zoroastrianism",
        "9": "Others", "0": "Not reported",
    },
    "Social_Group_of_HH_Head": {
        "1": "Scheduled Tribe (ST)", "2": "Scheduled Caste (SC)",
        "3": "Other Backward Class (OBC)", "9": "Others", "0": "Not reported",
    },
    "Land_Ownership": {"1": "Yes", "2": "No"},
    "Type_of_Land_Owned": {
        "1": "Homestead only", "2": "Homestead and other land", "3": "Other land only",
    },
    "Dwelling_Unit_Exists": {"1": "Yes", "2": "No"},
    "Type_of_Dwelling_Unit": {"1": "Owned", "2": "Hired", "3": "Others"},
    "Energy_Source_Cooking": {
        "01": "Firewood and chips", "02": "LPG", "03": "Other natural gas",
        "04": "Dung cake", "05": "Kerosene", "06": "Coke/coal",
        "07": "Gobar gas", "08": "Other biogas", "09": "Others",
        "10": "Charcoal", "11": "Electricity (incl. solar/wind)",
        "12": "No cooking arrangement",
    },
    "Energy_Source_Lighting": {
        "1": "Electricity (incl. solar/wind)", "2": "Kerosene", "3": "Other oil",
        "4": "Gas", "5": "Candle", "6": "No lighting arrangement", "9": "Others",
    },
    "Ration_Card_Type": {
        "0": "No ration card", "1": "Antyodaya Anna Yojana (AAY)",
        "2": "Below Poverty Line (BPL)", "3": "Above Poverty Line (APL)",
        "4": "Priority Households (PHH)", "5": "State Food Security Scheme (SFSS)",
        "9": "Others",
    },
    "Rent_Rate_Available_Rural": {"1": "Yes", "2": "No"},
    "Benefitted_From_PMGKY": {"1": "Yes", "2": "No"},
    "Ration_Any_Item_Last_30_Days": {"1": "Yes", "2": "No"},
    "Ceremony_Performed_Last_30_Days": {"1": "Yes", "2": "No"},
    "Kerosene_ration_card": {"1": "Yes", "2": "No"},
    "LPG_subsidy_received": {"1": "Yes", "2": "No"},
    "Free_electricity": {"1": "Yes", "2": "No"},
    "Any_member_attended_school": {"1": "Yes", "2": "No"},
    "Fee_waiver_received": {"1": "Yes", "2": "No"},
    "Ayushman_beneficiary": {"1": "Yes", "2": "No"},
    "Hospitalization_case": {
        "1": "Yes, in Government/Public hospital",
        "2": "Yes, in Private (incl. charitable/trust run) hospital",
        "3": "Yes, in both Government and Private hospital", "4": "No",
    },
    "Source": {
        "1": "Only purchase", "2": "Only home-grown stock",
        "3": "Both purchase and home-grown stock", "4": "Only free collection",
        "5": "Only exchange of goods and services", "6": "Only gifts/charities",
        "7": "Received free through PDS", "9": "Others",
    },
    "RESPONSE_CODE": {
        "1": "Informant co-operative and capable",
        "2": "Informant co-operative but not capable",
        "3": "Informant busy", "4": "Informant reluctant", "9": "Others",
    },
    "Reason_for_Substitution_Code": {
        "1": "Informant busy", "2": "Members away from home",
        "3": "Informant non-cooperative", "9": "Others",
    },
}

# Item codes that appear in the data but only inside questionnaire
# INSTRUCTIONS (Drop-Down-Menu detail codes for coarse grains, section 5.1).
EXTRA_ITEMS = {
    "055": "jowar and products - PDS (DDM states)",
    "056": "bajra and products - PDS (DDM states)",
    "057": "maize and products - PDS (DDM states)",
    "058": "barley and products - PDS (DDM states)",
    "059": "ragi and products - PDS (DDM states)",
    "060": "small millets and products - PDS (DDM states)",
    "063": "jowar and products - received free",
    "064": "bajra and products - received free",
    "065": "maize and products - received free",
    "066": "barley and products - received free",
    "067": "ragi and products - received free",
    "068": "small millets and products - received free",
    "115": "jowar and products - other sources",
    "116": "bajra and products - other sources",
    "117": "maize and products - other sources",
    "118": "barley and products - other sources",
    "120": "small millets and products - other sources",
    "121": "ragi and products - other sources",
    # energy DDM codes (section 8.1 instruction)
    "333": "dung cake", "336": "matches (box)", "337": "coal",
    "340": "other natural gas (CNG, etc.)", "341": "charcoal",
    "342": "candle (no.)", "343": "biogas/gobar gas", "344": "petrol (litre)",
    "345": "diesel (litre)", "346": "others (other fuel)",
    # DDM codes from food-section instructions
    "006": "lassi (DDM - other milk products)",
    "007": "butter milk (DDM - other milk products)",
    "167": "others (DDM - other milk products)",
    "008": "apricot (DDM - other dry fruits)",
    "010": "dry fig: anjeer (DDM - other dry fruits)",
    "247": "others (DDM - other dry fruits)",
    "180": "vanaspati, margarine (DDM - edible oil: others)",
    "185": "others (DDM - edible oil: others)",
    "221": "jackfruit (DDM - other fresh fruits)",
    "223": "pineapple (no.) (DDM - other fresh fruits)",
    "227": "singara (DDM - other fresh fruits)",
    "233": "pears/nashpati (DDM - other fresh fruits)",
    "234": "berries (DDM - other fresh fruits)",
    "235": "litchi (DDM - other fresh fruits)",
    "238": "others (DDM - other fresh fruits)",
}

# Yes/no checkbox columns (1 = yes / selected, otherwise blank). One shared map.
YES_ONE = {"1": "Yes"}
CHECKBOX_COLUMNS = [
    # FDQ 4.1.2 - items procured via ration card in the last 30 days
    "Ration_Rice", "Ration_Wheat", "Ration_Coarse_Grain", "Ration_Sugar",
    "Ration_Pulses", "Ration_Edible_Oil", "Ration_Other_Food_Items",
    # FDQ 4.1.3 - online food purchases in the last 30 days
    "Online_Groceries", "Online_Milk", "Online_Vegetables", "Online_Fresh_Fruits",
    "Online_Dry_Fruits", "Online_Egg_Fish_Meat", "Online_Served_Processed_Food",
    "Online_Packed_Processed_Food", "Online_Other_Food_Items",
    # CSQ 4.2.4 - free school items received
    "Free_textbooks_received", "Free_stationery_received", "Free_school_bag_received",
    "Free_other_items_received",
]
for _c in CHECKBOX_COLUMNS:
    COLUMN_MAPS[_c] = YES_ONE

# Columns that need no map (with reason). Sampling-design identifiers have no
# human-readable meaning; the rest are real numbers/amounts.
COLUMN_NOTES = {
    "FSU_Serial_No": "Sampling frame identifier - no code meaning",
    "NSS_Region": "Sampling region code - no code meaning",
    "District": "District code - no code meaning",
    "Stratum": "Sampling stratum number - no code meaning",
    "Sub_stratum": "Sampling sub-stratum number - no code meaning",
    "FOD_Sub_Region": "Field office sub-region code - no code meaning",
    "Sample_SU_No": "Sample sub-unit number - no code meaning",
    "Sample_Sub_Division_No": "Sample sub-division number - no code meaning",
    "Second_Stage_Stratum_No": "Second-stage stratum number - no code meaning",
    "Sample_Household_No": "Sample household number - no code meaning",
    "Level": "Data level/file number (01-15) - no code meaning",
    "Panel": "Survey panel number (1-10) - rotation panel of the survey period; no code meaning",
    "Survey_Name": "Constant: HCES",
    "Year": "Survey year",
    "Meals_Usually_Taken_Per_Day": "Number of meals usually taken in a day (0 = none)",
    "Meals_Served_to_Non_HH_Members": "Count of meals served to non-members (last 30 days)",
    "NCO_2015_Code": "3-digit occupation code - see NCO-2015 classification",
    "NIC_2008_Code": "5-digit industry code - see NIC-2008 classification",
    "INFORMANT_CODE": "Serial no. of household member who gave the information (99 = not a household member)",
    "VISIT": "Visit number (1 = first visit, 2/3 = revisits)",
}

# Which questionnaire item sections feed which parquet table
TABLE_SECTIONS = {
    "food_consumption": ["5.1", "5.2", "5.3", "6.1", "6.2", "6.3", "6.4",
                         "6.5", "6.6", "6.7", "6.8"],
    "consumption_7": ["7.1", "7.2"],
    "consumption_8_1": ["8.1"],
    "consumption_9_10_11": ["9.1", "9.2", "10.1", "10.2", "10.3",
                            "11.1", "11.2", "11.3", "11.4"],
    "consumption_12": ["12.1", "12.2", "12.3"],
    "consumption_13": ["13.1", "13.2", "13.3"],
    "consumption_14": ["14.1", "14.2", "14.3", "14.4", "14.5",
                       "14.6", "14.7", "14.8", "14.9", "14.10"],
    # imputed_rent_durables (level 14) stores the section sub-total values;
    # its item codes come from the global item map, handled in main()
}

ITEM_COLUMN = {
    "food_consumption": "Item_Code", "consumption_7": "Item_Code",
    "consumption_8_1": "Item_Code_8_1",
    "consumption_9_10_11": "Item_Code_9_1_to_11_4",
    "consumption_12": "Item_Code_12_series", "consumption_13": "ITEM_CODE",
    "consumption_14": "ITEM_CODE", "imputed_rent_durables": "ITEM_CODE",
}


def pdf_text():
    """Extract all text from the questionnaire PDF (fallback source)."""
    reader = pypdf.PdfReader(PDF)
    pages = []
    for page in reader.pages:
        pages.append(page.extract_text() or "")
    return "\n".join(pages)


def ocr_markdown():
    """Read the Mistral-OCR markdown of the questionnaire (secondary source)."""
    with open(OCR_MD, encoding="utf-8") as f:
        return f.read()


def parse_annotation():
    """Parse the Mistral-OCR structured annotation (primary source).

    document-annotation.json already follows the extraction schema: sections
    carry item rows {code, name, unit, source_default} plus answer codes.
    Returns (section_items, section_units, answer_codes).
    """
    with open(OCR_JSON, encoding="utf-8") as f:
        ann = json.load(f)
    section_items = {}
    section_units = {}
    answer_codes = []
    for sch in ann.get("schedules", []):
        for sec in sch.get("sections", []):
            num = sec.get("number")
            merged = section_items.setdefault(num, {})
            units = section_units.setdefault(num, {})
            for it in sec.get("items", []):
                merged[it["code"]] = it["name"]
                if it.get("unit"):
                    units[it["code"]] = it["unit"]
            for ic in sec.get("instruction_codes", []):
                merged[ic["code"]] = ic["name"]
                if ic.get("unit"):
                    units[ic["code"]] = ic["unit"]
        for ac in sch.get("answer_codes", []):
            if ac.get("codes"):
                answer_codes.append({**ac, "schedule": sch.get("name")})
    answer_codes += ann.get("identification_codes", [])
    return section_items, section_units, answer_codes

def parse_ocr_sections(md):
    """Split the OCR markdown into sections and parse their item tables.

    Item rows are markdown table rows with the item name and 3-digit code in
    their own cells (plus an optional source-default cell):
        |  rice - PDS | 101 |  |  |  |  |  | 1 |
    Section headers are rows like '| Section5.1: Consumption ... |' or plain
    'Section 5.2: ...' lines.
    """
    sec_re = re.compile(r"^\s*\|?\s*Section\s*(\d+(?:\.\s*\d+)?)\s*:")
    code_re = re.compile(r"^\d{3}$")
    sections = {}
    items = {}
    current = None
    for raw in md.splitlines():
        s = raw.strip()
        m = sec_re.match(s)
        if m:
            current = re.sub(r"\s+", "", m.group(1))
            sections.setdefault(current, [])
            continue
        if current is None:
            continue
        if not s.startswith("|"):
            continue
        cells = [c.strip() for c in s.strip("|").split("|")]
        if len(cells) < 3:
            continue
        item_cell, code_cell = cells[1], cells[2]
        if not code_re.match(code_cell) or not item_cell:
            continue
        if item_cell in ("Item", "(1)", "(2)") or re.match(r"^(Item|quantity|value)", item_cell):
            continue
        source = next((c for c in reversed(cells) if c in ("1", "@")), None)
        sections[current].append((item_cell, code_cell, source))
    return sections


def section_items_from_ocr(ocr_sections):
    """{section: {code: name}} from the parsed OCR tables."""
    out = {}
    for sec, rows in ocr_sections.items():
        items = {code: clean_name(name) for name, code, _src in rows}
        out[sec] = items
    return out


def split_sections(text):
    """Split the questionnaire text into item sections keyed by number."""
    lines = text.splitlines()
    sections = {}
    current = None
    sec_re = re.compile(r"^\s*Section\s*(\d+(?:\.\s*\d+)?)\s*:")
    for line in lines:
        m = sec_re.match(line)
        if m:
            current = re.sub(r"\s+", "", m.group(1))
            sections.setdefault(current, [])
        if current:
            sections[current].append(line)
    return sections


def clean_name(name):
    """Normalize an item name: ASCII dashes, strip footnote markers, spaces."""
    name = name.replace("\u2013", "-").replace("\u2014", "-")
    name = name.replace("$", "").replace("&", "and").replace("^", "")
    name = re.sub(r"\s+", " ", name).strip(" -")
    return name


_PAGE_JUNK = re.compile(
    r"^(Questionnaire (HCQ|FDQ|CSQ|DGQ)|Household Consumption Expenditure Survey|"
    r"Survey on Household Consumption Expenditure)"
)


def parse_items(section_lines):
    """Parse item rows from one section: {code: name}.

    Row layouts seen in the PDF text:
      * 'rice - PDS 101'          - name and code on one line
      * 'rice - PDS 101 1'        - plus a trailing source default (@ or 1)
      * 'spectacles, contact '    - name wrapped across lines, then
        'lenses '                    a code-only line completes the row
        '440'
    """
    code_re = re.compile(r"^\d{3}\s*[@1]?$")
    name_code_re = re.compile(r"^(.*?)\s+(\d{3})(?:\s*[@1])?$")

    # item table region: from the column-marker line or first item-looking
    # line, up to the instruction/notes/footer text that follows the table
    region = []
    started = False
    for raw in section_lines:
        s = raw.strip()
        if not started:
            if re.match(r"^\(\d\)", s) or name_code_re.match(s) or code_re.match(s):
                started = True
            continue
        if (re.match(r"^\[Instruction", s) or re.match(r"^Go to Section", s)
                or s.startswith("Note:") or s.startswith("OBJECTIVES")
                or re.match(r"^Section\s*\d", s)):
            break
        region.append(raw)

    items = {}
    pending = None
    for raw in region:
        # pypdf sometimes joins several table cells on one line with ' | '
        for piece in raw.split("|"):
            s = piece.strip()
            if not s or _PAGE_JUNK.match(s):
                continue
            nm = name_code_re.match(s)
            if nm:
                name = (pending + " " + nm.group(1)) if pending else nm.group(1)
                items[nm.group(2)] = clean_name(name)
                pending = None
            elif code_re.match(s) and pending is not None:
                items[s[:3]] = clean_name(pending)
                pending = None
            else:
                pending = (pending + " " + s).strip() if pending else s
    return items


# Official table spells a few states with typos; correct them for display.
STATE_NAME_FIX = {
    "Uttar Prdesh": "Uttar Pradesh", "Uttrakhand": "Uttarakhand",
    "Tamilnadu": "Tamil Nadu", "Chattisgarh": "Chhattisgarh",
    "A and N Islands (U.T.)": "Andaman & Nicobar Islands",
    "Chandigarh(U.T.)": "Chandigarh", "Dadra & Nagar Haveli and Daman & Diu": "Dadra & Nagar Haveli and Daman & Diu",
}


def main():
    section_units = {}
    answer_codes = []
    if os.path.exists(OCR_JSON):
        print("Source: Mistral-OCR annotation (hces-code/HCES-ocr-mistral/document-annotation.json)")
        section_items, section_units, answer_codes = parse_annotation()
    elif os.path.exists(OCR_MD):
        print("Source: Mistral-OCR markdown (hces-code/HCES-ocr-mistral/markdown.md)")
        sections = parse_ocr_sections(ocr_markdown())
        section_items = section_items_from_ocr(sections)
    else:
        print("Source: pypdf text extraction of the questionnaire PDF (fallback)")
        text = pdf_text()
        sections = split_sections(text)
        section_items = {s: parse_items(secs) for s, secs in sections.items()}
    found = sorted(set(section_items) & {s for secs in TABLE_SECTIONS.values() for s in secs})
    missing = {s for secs in TABLE_SECTIONS.values() for s in secs} - set(section_items)
    if missing:
        print(f"WARNING: sections not found in source: {sorted(missing)}")

    for s in found:
        if not section_items[s]:
            print(f"WARNING: no item rows parsed in section {s}")

    table_items = {}
    table_units = {}
    for table, secs in TABLE_SECTIONS.items():
        merged = {}
        units = {}
        for s in secs:
            merged.update(section_items.get(s, {}))
            units.update(section_units.get(s, {}))
        merged.update(EXTRA_ITEMS)
        table_items[table] = merged
        table_units[table] = units

    # imputed_rent_durables (level 14) stores the section sub-total values;
    # its item codes come from the union of all item sections + extras
    global_items = {}
    for s, items in section_items.items():
        global_items.update(items)
    global_items.update(EXTRA_ITEMS)
    table_items["imputed_rent_durables"] = global_items

    for table, items in table_items.items():
        table_items[table] = {k: clean_name(v) for k, v in items.items()}

    # 2. Validate against the actual parquet values
    con = duckdb.connect()
    errors = []

    def distinct(table, column):
        q = (f'SELECT DISTINCT "{column}" FROM read_parquet(\''
             f'{os.path.join(PARQUET, table + ".parquet")}\') '
             f'WHERE "{column}" IS NOT NULL')
        return [str(r[0]) for r in con.execute(q).fetchall()]

    for table, col in ITEM_COLUMN.items():
        codes = distinct(table, col)
        mapped = table_items[table]
        miss = sorted({c for c in codes if c not in mapped})
        if miss:
            errors.append(f"{table}.{col}: {len(miss)} unmapped codes: {miss[:12]}")
        print(f"  items {table}: {len(codes)} codes in data, "
              f"{len([c for c in codes if c in mapped])} mapped")

    for name, m in COLUMN_MAPS.items():
        # find tables that have this column
        for t in sorted(os.path.basename(f)[:-8] for f in
                        __import__('glob').glob(os.path.join(PARQUET, '*.parquet'))):
            cols = [c[0] for c in con.execute(
                f"DESCRIBE SELECT * FROM read_parquet('{os.path.join(PARQUET, t + '.parquet')}')").fetchall()]
            if name not in cols:
                continue
            miss = sorted({v for v in distinct(t, name) if v not in m})
            if miss:
                errors.append(f"{t}.{name}: unmapped values {miss}")

    # 3. State codes from the official table (census codes == data codes here);
    #    falls back to the state names shared with the aggregation pipeline
    state_codes = {}
    try:
        with open(STATE_CSV, encoding="utf-8-sig") as f:
            for row in csv.reader(f):
                if len(row) >= 2 and row[0].isdigit() and row[1].strip():
                    state_codes[row[0].zfill(2)] = STATE_NAME_FIX.get(row[1].strip(), row[1].strip())
    except FileNotFoundError:
        print("WARNING: tabulation_state_code.csv missing - using pipeline state names")
        state_codes = dict(STATE_NAMES)
    # sanity: data State values must be covered
    state_miss = set()
    for t in ["household_demographics"]:
        miss = sorted({v for v in distinct(t, "State") if v not in state_codes})
        state_miss.update(miss)
    if state_miss:
        errors.append(f"State: unmapped codes {state_miss}")

    doc = {
        "_meta": {
            "source": "HCES 2023-24 official questionnaires (LCES/HCQ/FDQ/CSQ/DGQ), MOSPI",
            "primary_extraction": "Mistral-OCR structured annotation of the questionnaire",
            "generated_by": "extract_code_map.py",
            "note": "Holistic code map: column meaning dicts, per-table consumption item "
                    "codes, state codes, and the OCR answer-code transcript. Sampling "
                    "identifiers and pure quantities carry notes instead of maps.",
        },
        "columns": {k: {"map": v} for k, v in COLUMN_MAPS.items()},
        "column_notes": COLUMN_NOTES,
        "state_codes": dict(sorted(state_codes.items())),
        "answer_codes": answer_codes,
        "tables": {t: {
            "item_column": ITEM_COLUMN.get(t),
            "sections": TABLE_SECTIONS.get(t, []),
            "items": dict(sorted(table_items[t].items(), key=lambda kv: int(kv[0]))),
            "units": dict(sorted(table_units.get(t, {}).items(), key=lambda kv: int(kv[0]))),
        } for t in sorted(table_items)},
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)

    total_items = sum(len(t["items"]) for t in doc["tables"].values())
    print(f"\ncode_map.json written: {len(doc['columns'])} column maps, "
          f"{len(doc['column_notes'])} notes, {len(doc['state_codes'])} states, "
          f"{total_items} item rows across {len(doc['tables'])} tables")
    if errors:
        print("\nVALIDATION ISSUES:")
        for e in errors:
            print("  -", e)
        return 1
    print("VALIDATION OK: every value in the data is mapped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
