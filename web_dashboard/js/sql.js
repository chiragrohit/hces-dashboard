/* SQL behind every dashboard chart — copy-paste runnable with DuckDB.
 *
 * How to reproduce any chart on your own machine:
 *   1. python download_data.py      (downloads the 14 raw survey parquet files)
 *   2. duckdb                       (or: pip install duckdb, then python)
 *   3. paste the SQL for the chart and run it.
 *
 * Notes that apply to every query:
 * - The survey "Multiplier" weights sum to ~29 billion, but India really has
 *   ~304 million households and ~1.43 billion people. The dashboard (and these
 *   queries) normalize every estimate to those official national totals so the
 *   numbers are believable. See the `scale` CTE at the top of each query.
 * - Sector '1' = Rural, '2' = Urban.
 * - Coded columns (marital status, fuels, schemes...) are decoded to readable
 *   labels inline, exactly like the dashboard does.
 */

// Shared fragments. Each final SQL string below is self-contained once built.
const SCALE_HH = `-- Survey multipliers sum to ~29 billion, but India really has ~304 million
    -- households. Normalize to the official national total so the numbers
    -- match the dashboard (factor = 304M / raw weighted total):
    scale AS (SELECT 304000000.0 / SUM(Multiplier) AS hh
              FROM 'hces_parquet/household_demographics.parquet')`;

const SCALE_POP = `-- Same normalization for people: India really has ~1.43 billion people.
    scale AS (SELECT 1428000000.0 / SUM(Multiplier) AS pop
              FROM 'hces_parquet/individual_characteristics.parquet')`;

// 37 states/UTs — used by the state-wise charts.
const STATE_MASTER = `sm(code, name) AS (VALUES
        ('01','Jammu & Kashmir'), ('02','Himachal Pradesh'), ('03','Punjab'),
        ('04','Chandigarh'),      ('05','Uttarakhand'),      ('06','Haryana'),
        ('07','Delhi'),           ('08','Rajasthan'),        ('09','Uttar Pradesh'),
        ('10','Bihar'),           ('11','Sikkim'),           ('12','Arunachal Pradesh'),
        ('13','Nagaland'),        ('14','Manipur'),          ('15','Mizoram'),
        ('16','Tripura'),         ('17','Meghalaya'),        ('18','Assam'),
        ('19','West Bengal'),     ('20','Jharkhand'),        ('21','Odisha'),
        ('22','Chhattisgarh'),    ('23','Madhya Pradesh'),   ('24','Gujarat'),
        ('25','Daman & Diu'),     ('26','Dadra & Nagar Haveli'), ('27','Maharashtra'),
        ('28','Andhra Pradesh'),  ('29','Karnataka'),        ('30','Goa'),
        ('31','Lakshadweep'),     ('32','Kerala'),           ('33','Tamil Nadu'),
        ('34','Puducherry'),      ('35','Andaman & Nicobar'),('36','Telangana'),
        ('37','Ladakh'))`;

const HH_JOIN = `-- Join households to their economic profile on the 4-part key:
    -- same village (FSU), state, district, and household number.
    FROM 'hces_parquet/household_demographics.parquet' h
    JOIN 'hces_parquet/household_economic.parquet' e
      ON h.FSU_Serial_No = e.FSU_Serial_No
     AND h.State = e.State
     AND h.District = e.District
     AND h.Sample_Household_No = e.Sample_Household_No`;

// Money charts: rupees * household-scale -> crore (1 crore = 10 million rupees).
// Recall-period note: the survey asks about different time windows per item
// (7 days for tobacco, 365 days for clothes...). The dashboard converts every
// window to a comparable MONTHLY figure; each query below shows that factor.

export const SQL = {

/* ---------------- Overview ---------------- */

stateConsumption: `
-- Chart: Overview -> State-wise consumption (top 20 states by total).
-- What: total monthly household consumption per state and sector, in crore rupees.
WITH sm(code, name) AS (VALUES
        ('01','Jammu & Kashmir'), ('02','Himachal Pradesh'), ('03','Punjab'),
        ('04','Chandigarh'),      ('05','Uttarakhand'),      ('06','Haryana'),
        ('07','Delhi'),           ('08','Rajasthan'),        ('09','Uttar Pradesh'),
        ('10','Bihar'),           ('11','Sikkim'),           ('12','Arunachal Pradesh'),
        ('13','Nagaland'),        ('14','Manipur'),          ('15','Mizoram'),
        ('16','Tripura'),         ('17','Meghalaya'),        ('18','Assam'),
        ('19','West Bengal'),     ('20','Jharkhand'),        ('21','Odisha'),
        ('22','Chhattisgarh'),    ('23','Madhya Pradesh'),   ('24','Gujarat'),
        ('25','Daman & Diu'),     ('26','Dadra & Nagar Haveli'), ('27','Maharashtra'),
        ('28','Andhra Pradesh'),  ('29','Karnataka'),        ('30','Goa'),
        ('31','Lakshadweep'),     ('32','Kerala'),           ('33','Tamil Nadu'),
        ('34','Puducherry'),      ('35','Andaman & Nicobar'),('36','Telangana'),
        ('37','Ladakh')),
     ${SCALE_HH}
-- Each row of food_consumption is one item bought/consumed by one household.
-- Weighting by the survey Multiplier turns the sample into a national estimate.
SELECT f.State AS state_code,
       sm.name AS state_name,
       CASE WHEN f.Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       -- rupees -> real-household scale -> crore rupees
       SUM(f.Total_Consumption_Value * f.Multiplier) * (SELECT hh FROM scale) / 1e7 AS total_consumption_cr
FROM 'hces_parquet/food_consumption.parquet' f
LEFT JOIN sm ON f.State = sm.code
GROUP BY f.State, sm.name, f.Sector
ORDER BY total_consumption_cr DESC`,

sectorShare: `
-- Chart: Overview -> Rural vs Urban share of consumption.
-- What: total monthly consumption split by sector (all states combined).
-- A simple "All" vs "Rural+Urban" doughnut; the share is value / grand total.
WITH ${SCALE_HH}
SELECT CASE WHEN Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       SUM(Total_Consumption_Value * Multiplier) * (SELECT hh FROM scale) / 1e7 AS total_consumption_cr
FROM 'hces_parquet/food_consumption.parquet'
GROUP BY 1
ORDER BY total_consumption_cr DESC`,

ooh: `
-- Chart: Overview -> Eating out (out-of-home share).
-- What: value eaten outside the home vs total value. The dashboard plots the
-- out-of-home slice against the at-home slice (total minus out-of-home).
WITH ${SCALE_HH}
SELECT CASE WHEN Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       -- meals eaten outside the home (restaurants, hotels, street food)
       SUM(OutOfHome_Consumption_Value * Multiplier) * (SELECT hh FROM scale) / 1e7 AS ooh_consumption_cr,
       -- everything (includes out-of-home)
       SUM(Total_Consumption_Value * Multiplier) * (SELECT hh FROM scale) / 1e7 AS total_consumption_cr
FROM 'hces_parquet/food_consumption.parquet'
GROUP BY 1
-- at-home share = total - ooh (the chart computes it this way)`,

perHH: `
-- Chart: Spending -> Average value per item, by state.
-- What: mean consumption value carried by one average item-row, per state/sector.
-- (SUM of value / SUM of multiplier, NOT divided by households.)
WITH sm(code, name) AS (VALUES
        ('01','Jammu & Kashmir'), ('02','Himachal Pradesh'), ('03','Punjab'),
        ('04','Chandigarh'),      ('05','Uttarakhand'),      ('06','Haryana'),
        ('07','Delhi'),           ('08','Rajasthan'),        ('09','Uttar Pradesh'),
        ('10','Bihar'),           ('11','Sikkim'),           ('12','Arunachal Pradesh'),
        ('13','Nagaland'),        ('14','Manipur'),          ('15','Mizoram'),
        ('16','Tripura'),         ('17','Meghalaya'),        ('18','Assam'),
        ('19','West Bengal'),     ('20','Jharkhand'),        ('21','Odisha'),
        ('22','Chhattisgarh'),    ('23','Madhya Pradesh'),   ('24','Gujarat'),
        ('25','Daman & Diu'),     ('26','Dadra & Nagar Haveli'), ('27','Maharashtra'),
        ('28','Andhra Pradesh'),  ('29','Karnataka'),        ('30','Goa'),
        ('31','Lakshadweep'),     ('32','Kerala'),           ('33','Tamil Nadu'),
        ('34','Puducherry'),      ('35','Andaman & Nicobar'),('36','Telangana'),
        ('37','Ladakh'))
SELECT sm.name AS state_name,
       CASE WHEN f.Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       SUM(f.Total_Consumption_Value * f.Multiplier) / NULLIF(SUM(f.Multiplier), 0) AS avg_consumption_per_item
FROM 'hces_parquet/food_consumption.parquet' f
LEFT JOIN sm ON f.State = sm.code
GROUP BY sm.name, f.Sector
ORDER BY sm.name`,

/* ---------------- People ---------------- */

ageGroup: `
-- Chart: People -> Age profile.
-- What: estimated population in each age band, by sector.
-- Age is stored as text, so it is cast to a number before comparing.
WITH ${SCALE_POP}
SELECT CASE WHEN Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       CASE
         WHEN TRY_CAST(Age AS INTEGER) < 5  THEN '0-4'
         WHEN TRY_CAST(Age AS INTEGER) < 15 THEN '5-14'
         WHEN TRY_CAST(Age AS INTEGER) < 25 THEN '15-24'
         WHEN TRY_CAST(Age AS INTEGER) < 35 THEN '25-34'
         WHEN TRY_CAST(Age AS INTEGER) < 45 THEN '35-44'
         WHEN TRY_CAST(Age AS INTEGER) < 55 THEN '45-54'
         WHEN TRY_CAST(Age AS INTEGER) < 65 THEN '55-64'
         ELSE '65+'
       END AS age_group,
       -- one person, counted once (their survey weight)
       SUM(Multiplier) * (SELECT pop FROM scale) AS estimated_population
FROM 'hces_parquet/individual_characteristics.parquet'
WHERE Age IS NOT NULL AND Age != ''
GROUP BY 1, 2
ORDER BY 1, 2`,

gender: `
-- Chart: People -> Women vs men.
-- What: estimated population split by gender, by sector.
WITH ${SCALE_POP}
SELECT CASE WHEN Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       CASE WHEN Gender = '1' THEN 'Male' ELSE 'Female' END AS gender,
       SUM(Multiplier) * (SELECT pop FROM scale) AS estimated_population
FROM 'hces_parquet/individual_characteristics.parquet'
GROUP BY 1, 2`,

pyramid: `
-- Chart: People -> Population pyramid.
-- What: population by age band AND gender — the two halves of the pyramid.
WITH ${SCALE_POP}
SELECT CASE WHEN Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       CASE WHEN Gender = '1' THEN 'Male' ELSE 'Female' END AS gender,
       CASE
         WHEN TRY_CAST(Age AS INTEGER) < 5  THEN '0-4'
         WHEN TRY_CAST(Age AS INTEGER) < 15 THEN '5-14'
         WHEN TRY_CAST(Age AS INTEGER) < 25 THEN '15-24'
         WHEN TRY_CAST(Age AS INTEGER) < 35 THEN '25-34'
         WHEN TRY_CAST(Age AS INTEGER) < 45 THEN '35-44'
         WHEN TRY_CAST(Age AS INTEGER) < 55 THEN '45-54'
         WHEN TRY_CAST(Age AS INTEGER) < 65 THEN '55-64'
         ELSE '65+'
       END AS age_group,
       SUM(Multiplier) * (SELECT pop FROM scale) AS estimated_population
FROM 'hces_parquet/individual_characteristics.parquet'
WHERE Age IS NOT NULL AND Age != ''
GROUP BY 1, 2, 3`,

education: `
-- Chart: People -> Education levels.
-- What: estimated population by education level, sector and gender.
-- The level codes are the survey's own ladder (illiterate, below primary, ...).
WITH ${SCALE_POP}
SELECT CASE WHEN Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       CASE WHEN Gender = '1' THEN 'Male' ELSE 'Female' END AS gender,
       Education_Level AS education_level,   -- raw survey code
       SUM(Multiplier) * (SELECT pop FROM scale) AS estimated_count
FROM 'hces_parquet/individual_characteristics.parquet'
WHERE Education_Level IS NOT NULL AND Education_Level != ''
GROUP BY 1, 2, 3`,

marital: `
-- Chart: People -> Marital status.
-- What: people aged 15+ by marital status, sector and gender.
WITH ${SCALE_POP}
SELECT CASE WHEN Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       CASE WHEN Gender = '1' THEN 'Male' ELSE 'Female' END AS gender,
       CASE Marital_Status
         WHEN '1' THEN 'Never married'
         WHEN '2' THEN 'Currently married'
         WHEN '3' THEN 'Widowed'
         WHEN '4' THEN 'Divorced/separated'
       END AS marital_status,
       SUM(Multiplier) * (SELECT pop FROM scale) AS w
FROM 'hces_parquet/individual_characteristics.parquet'
-- marital status is only meaningful for adults
WHERE TRY_CAST(Age AS INTEGER) >= 15 AND Marital_Status IS NOT NULL
GROUP BY 1, 2, 3`,

internet: `
-- Chart: People -> Internet use by age.
-- What: who used the internet in the last 30 days, by age band and sector.
WITH ${SCALE_POP}
SELECT CASE WHEN Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       CASE
         WHEN TRY_CAST(Age AS INTEGER) < 15 THEN 'Under 15'
         WHEN TRY_CAST(Age AS INTEGER) < 25 THEN '15-24'
         WHEN TRY_CAST(Age AS INTEGER) < 45 THEN '25-44'
         ELSE '45+'
       END AS age_group,
       CASE WHEN Used_Internet_Last_30_Days = '1' THEN 'Yes' ELSE 'No' END AS used,
       SUM(Multiplier) * (SELECT pop FROM scale) AS w
FROM 'hces_parquet/individual_characteristics.parquet'
-- '1' = used, '2' = did not use; anything else is a missing answer
WHERE Used_Internet_Last_30_Days IN ('1', '2')
GROUP BY 1, 2, 3`,

relation: `
-- Chart: People -> Role in the household.
-- What: what each person is to the household head (self, spouse, child...).
WITH ${SCALE_POP}
SELECT CASE WHEN Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       CASE Relation_to_Head
         WHEN '1' THEN 'Self'
         WHEN '2' THEN 'Spouse of head'
         WHEN '3' THEN 'Married child'
         WHEN '4' THEN 'Spouse of married child'
         WHEN '5' THEN 'Unmarried child'
         WHEN '6' THEN 'Grandchild'
         WHEN '7' THEN 'Father/mother/father-in-law/mother-in-law'
         WHEN '8' THEN 'Brother/sister/brother-in-law/sister-in-law/other relatives'
         WHEN '9' THEN 'Servants/employees/other non-relatives'
       END AS role,
       SUM(Multiplier) * (SELECT pop FROM scale) AS w
FROM 'hces_parquet/individual_characteristics.parquet'
WHERE Relation_to_Head IS NOT NULL
GROUP BY 1, 2`,

literacy: `
-- Chart: People -> Literacy.
-- What: literacy rate by gender and sector.
-- The survey has no "literate" flag; years of education > 0 is used as the proxy.
WITH ${SCALE_POP}
SELECT CASE WHEN Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       CASE WHEN Gender = '1' THEN 'Male' ELSE 'Female' END AS gender,
       CASE WHEN TRY_CAST(Years_of_Education AS INTEGER) > 0
            THEN 'Literate' ELSE 'Not literate' END AS lit,
       SUM(Multiplier) * (SELECT pop FROM scale) AS w
FROM 'hces_parquet/individual_characteristics.parquet'
WHERE Years_of_Education IS NOT NULL
GROUP BY 1, 2, 3`,

/* ---------------- Households ---------------- */

hhsize: `
-- Chart: Households -> Household size.
-- What: how many households have 1, 2, 3 ... 8+ members.
-- The size is a ready-made field on the economic table (HH_Size_FDQ).
WITH ${SCALE_HH}
SELECT CASE WHEN Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       CASE
         WHEN HH_Size_FDQ = 1 THEN '1'
         WHEN HH_Size_FDQ = 2 THEN '2'
         WHEN HH_Size_FDQ = 3 THEN '3'
         WHEN HH_Size_FDQ = 4 THEN '4'
         WHEN HH_Size_FDQ = 5 THEN '5'
         WHEN HH_Size_FDQ = 6 THEN '6'
         WHEN HH_Size_FDQ = 7 THEN '7'
         ELSE '8+'   -- 8 members or more, grouped so the chart stays readable
       END AS size,
       SUM(Multiplier) * (SELECT hh FROM scale) AS w
FROM 'hces_parquet/household_economic.parquet'
WHERE HH_Size_FDQ IS NOT NULL
GROUP BY 1, 2`,

hhtype: `
-- Chart: Households -> Main income source (household type).
-- What: how households make a living, by sector. Top 7 shown on the chart.
WITH ${SCALE_HH}
SELECT CASE WHEN h.Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       CASE e.Household_Type
         WHEN '1' THEN 'Self-employed in agriculture'
         WHEN '2' THEN 'Self-employed in non-agriculture'
         WHEN '3' THEN 'Regular wage/salary earning in agriculture'
         WHEN '4' THEN 'Regular wage/salary earning in non-agriculture'
         WHEN '5' THEN 'Casual labour in agriculture'
         WHEN '6' THEN 'Casual labour in non-agriculture'
         WHEN '9' THEN 'Others'
       END AS household_type,
       SUM(h.Multiplier) * (SELECT hh FROM scale) AS estimated_households
${HH_JOIN}
WHERE e.Household_Type IS NOT NULL
GROUP BY 1, 2
ORDER BY estimated_households DESC`,

socialgroup: `
-- Chart: Households -> Social group.
-- What: households by social group (ST/SC/OBC/Others), by sector.
WITH ${SCALE_HH}
SELECT CASE WHEN h.Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       CASE e.Social_Group_of_HH_Head
         WHEN '1' THEN 'Scheduled Tribe (ST)'
         WHEN '2' THEN 'Scheduled Caste (SC)'
         WHEN '3' THEN 'Other Backward Class (OBC)'
         WHEN '9' THEN 'Others'
         ELSE 'Not reported'
       END AS social_group,
       SUM(h.Multiplier) * (SELECT hh FROM scale) AS w
${HH_JOIN}
WHERE e.Social_Group_of_HH_Head IS NOT NULL
GROUP BY 1, 2`,

religion: `
-- Chart: Households -> Religion.
-- What: households by religion of the head, by sector.
WITH ${SCALE_HH}
SELECT CASE WHEN h.Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       CASE e.Religion_of_HH_Head
         WHEN '1' THEN 'Hinduism'
         WHEN '2' THEN 'Islam'
         WHEN '3' THEN 'Christianity'
         WHEN '4' THEN 'Sikhism'
         WHEN '5' THEN 'Jainism'
         WHEN '6' THEN 'Buddhism'
         WHEN '7' THEN 'Zoroastrianism'
         WHEN '9' THEN 'Others'
         ELSE 'Not reported'
       END AS religion,
       SUM(h.Multiplier) * (SELECT hh FROM scale) AS estimated_households
${HH_JOIN}
WHERE e.Religion_of_HH_Head IS NOT NULL
GROUP BY 1, 2`,

dwelling: `
-- Chart: Households -> House ownership.
-- What: households by whether the dwelling is owned or hired.
WITH ${SCALE_HH}
SELECT CASE WHEN h.Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       CASE e.Type_of_Dwelling_Unit
         WHEN '1' THEN 'Owned'
         WHEN '2' THEN 'Hired'
         WHEN '3' THEN 'Others'
       END AS dwelling_type,
       SUM(h.Multiplier) * (SELECT hh FROM scale) AS estimated_households
${HH_JOIN}
WHERE e.Type_of_Dwelling_Unit IS NOT NULL
GROUP BY 1, 2`,

energy: `
-- Chart: Households -> Cooking fuel.
-- What: the main fuel households cook with, by sector.
-- LPG ('02') is the key policy metric: the shift away from firewood.
WITH ${SCALE_HH}
SELECT CASE WHEN h.Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       CASE e.Energy_Source_Cooking
         WHEN '01' THEN 'Firewood and chips'
         WHEN '02' THEN 'LPG'
         WHEN '03' THEN 'Other natural gas'
         WHEN '04' THEN 'Dung cake'
         WHEN '05' THEN 'Kerosene'
         WHEN '06' THEN 'Coke/coal'
         WHEN '07' THEN 'Gobar gas'
         WHEN '08' THEN 'Other biogas'
         WHEN '09' THEN 'Others'
         WHEN '10' THEN 'Charcoal'
         WHEN '11' THEN 'Electricity (incl. solar/wind)'
         WHEN '12' THEN 'No cooking arrangement'
       END AS cooking_energy,
       SUM(h.Multiplier) * (SELECT hh FROM scale) AS estimated_households
${HH_JOIN}
WHERE e.Energy_Source_Cooking IS NOT NULL
GROUP BY 1, 2`,

lighting: `
-- Chart: Households -> Lighting.
-- What: the main source of lighting, by sector.
WITH ${SCALE_HH}
SELECT CASE WHEN h.Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       CASE e.Energy_Source_Lighting
         WHEN '1' THEN 'Electricity (incl. solar/wind)'
         WHEN '2' THEN 'Kerosene'
         WHEN '3' THEN 'Other oil'
         WHEN '4' THEN 'Gas'
         WHEN '5' THEN 'Candle'
         WHEN '6' THEN 'No lighting arrangement'
         WHEN '9' THEN 'Others'
       END AS lighting,
       SUM(h.Multiplier) * (SELECT hh FROM scale) AS w
${HH_JOIN}
WHERE e.Energy_Source_Lighting IS NOT NULL
GROUP BY 1, 2`,

land: `
-- Chart: Households -> Land ownership.
-- What: households that own land vs those that do not.
WITH ${SCALE_HH}
SELECT CASE WHEN h.Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       CASE WHEN e.Land_Ownership = '1' THEN 'Yes' ELSE 'No' END AS land_ownership,
       SUM(h.Multiplier) * (SELECT hh FROM scale) AS estimated_households
${HH_JOIN}
WHERE e.Land_Ownership IS NOT NULL
GROUP BY 1, 2`,

ration: `
-- Chart: Households -> Ration card.
-- What: households by ration-card type (the PDS eligibility ladder).
WITH ${SCALE_HH}
SELECT CASE WHEN h.Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       CASE e.Ration_Card_Type
         WHEN '0' THEN 'No ration card'
         WHEN '1' THEN 'Antyodaya Anna Yojana (AAY)'
         WHEN '2' THEN 'Below Poverty Line (BPL)'
         WHEN '3' THEN 'Above Poverty Line (APL)'
         WHEN '4' THEN 'Priority Households (PHH)'
         WHEN '5' THEN 'State Food Security Scheme (SFSS)'
         WHEN '9' THEN 'Others'
       END AS ration_card,
       SUM(h.Multiplier) * (SELECT hh FROM scale) AS estimated_households
${HH_JOIN}
WHERE e.Ration_Card_Type IS NOT NULL
GROUP BY 1, 2`,

ujjwala: `
-- Chart: Households -> Ujjwala gas connection.
-- What: households that got LPG under the PM Ujjwala scheme (PMGKY).
WITH ${SCALE_HH}
SELECT CASE WHEN h.Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       CASE WHEN e.Benefitted_From_PMGKY = '1' THEN 'Yes' ELSE 'No' END AS got,
       SUM(h.Multiplier) * (SELECT hh FROM scale) AS w
${HH_JOIN}
WHERE e.Benefitted_From_PMGKY IN ('1', '2')   -- '1' = yes, '2' = no
GROUP BY 1, 2`,

employment: `
-- Chart: Households -> Employment.
-- What: households whose head is working vs not (last 365 days).
-- "Working" here means engaged in any economic activity in the last year.
WITH ${SCALE_HH}
SELECT CASE WHEN Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       CASE WHEN Engaged_in_Economic_Activity_Las = '1'
            THEN 'Working' ELSE 'Not working' END AS status,
       SUM(Multiplier) * (SELECT hh FROM scale) AS w
FROM 'hces_parquet/household_economic.parquet'
WHERE Engaged_in_Economic_Activity_Las IN ('1', '2')
GROUP BY 1, 2`,

/* ---------------- Spending ---------------- */

foodItems: `
-- Chart: Spending -> Top food items by value.
-- What: which food items households spend the most on, in crore rupees/month.
-- The chart shows the top 20; item NAMES come from the survey code book
-- (hces-code/parquet-code-map.json) — the survey only stores numeric codes.
WITH ${SCALE_HH}
SELECT f.Item_Code AS item_code,
       SUM(f.Total_Consumption_Value * f.Multiplier) * (SELECT hh FROM scale) / 1e7 AS total_value_cr
FROM 'hces_parquet/food_consumption.parquet' f
WHERE f.Item_Code IS NOT NULL
GROUP BY f.Item_Code
ORDER BY total_value_cr DESC
LIMIT 50`,

foodSource: `
-- Chart: Spending -> Where food comes from.
-- What: share of food purchases by source (market, home-grown, PDS...).
-- Note: this chart counts records (rows), not weighted people — it shows the
-- mix of sources, so each row of the survey counts equally.
SELECT CASE WHEN Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       CASE Source
         WHEN '1' THEN 'Only purchase'
         WHEN '2' THEN 'Only home-grown stock'
         WHEN '3' THEN 'Both purchase and home-grown stock'
         WHEN '4' THEN 'Only free collection'
         WHEN '5' THEN 'Only exchange of goods and services'
         WHEN '6' THEN 'Only gifts/charities'
         WHEN '7' THEN 'Received free through PDS'
         WHEN '9' THEN 'Others'
       END AS source,
       COUNT(*) AS w     -- row count, not weighted
FROM 'hces_parquet/food_consumption.parquet'
WHERE Source IN ('1', '2', '3', '4', '5', '6', '7', '9')
GROUP BY 1, 2`,

clothing: `
-- Chart: Spending -> Clothing, bedding, footwear.
-- What: monthly spend on clothing-related subtotals, in crore rupees.
-- Recall period: the survey asks about a 365-day window for clothes, so the
-- annual figure is divided by 12 to get a comparable monthly number.
WITH ${SCALE_HH}
SELECT CASE WHEN Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       CASE ITEM_CODE
         WHEN '379' THEN 'Clothing'
         WHEN '389' THEN 'Bedding, etc.'
         WHEN '399' THEN 'Footwear'
       END AS code,
       SUM(MULTIPLIER * VALUE) * (SELECT hh FROM scale) / 1e7 / 12.0 AS w
FROM 'hces_parquet/consumption_13.parquet'
WHERE ITEM_CODE IN ('379', '389', '399')
GROUP BY 1, 2`,

services: `
-- Chart: Spending -> Services (education, medical, rent...).
-- What: monthly spend on services, in crore rupees.
-- Recall periods differ by item: education and hospitalisation are 365-day
-- windows (divided by 12); the rest are 30-day (left as-is).
WITH ${SCALE_HH}
SELECT CASE WHEN Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       CASE Item_Code_9_1_to_11_4
         WHEN '409' THEN 'Education'
         WHEN '419' THEN 'Medical - hospitalisation'
         WHEN '429' THEN 'Medical - non-hospitalisation'
         WHEN '499' THEN 'Consumer services'
         WHEN '519' THEN 'Conveyance'
         WHEN '539' THEN 'House rent (incl. imputed)'
       END AS code,
       SUM(MULTIPLIER * Value_Rs_9_1_to_11_4) * (SELECT hh FROM scale) / 1e7
         * CASE WHEN Item_Code_9_1_to_11_4 IN ('409', '419') THEN 1.0/12.0 ELSE 1.0 END AS w
FROM 'hces_parquet/consumption_9_10_11.parquet'
WHERE Item_Code_9_1_to_11_4 IN ('409', '419', '429', '499', '519', '539')
GROUP BY 1, 2, Item_Code_9_1_to_11_4   -- raw code kept so the recall factor is constant per row`,

fuel: `
-- Chart: Spending -> Fuel and light.
-- What: monthly spend on cooking fuel and lighting, in crore rupees.
-- 30-day recall window, so the raw monthly figure is used as-is.
WITH ${SCALE_HH}
SELECT CASE WHEN Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       CASE Item_Code_8_1
         WHEN '331' THEN 'Firewood and chips'
         WHEN '332' THEN 'Electricity'
         WHEN '333' THEN 'Dung cake'
         WHEN '334' THEN 'Kerosene - PDS'
         WHEN '335' THEN 'Kerosene - other sources'
         WHEN '336' THEN 'Matches'
         WHEN '337' THEN 'Coal'
         WHEN '338' THEN 'LPG'
         WHEN '340' THEN 'Other natural gas'
         WHEN '341' THEN 'Charcoal'
         WHEN '342' THEN 'Candles'
         WHEN '343' THEN 'Biogas/gobar gas'
         WHEN '346' THEN 'Others'
         WHEN '096' THEN 'Other fuel'
       END AS code,
       SUM(MULTIPLIER * Total_consumption_value_rs) * (SELECT hh FROM scale) / 1e7 AS w
FROM 'hces_parquet/consumption_8_1.parquet'
WHERE Item_Code_8_1 IN ('331','332','333','334','335','336','337','338',
                        '340','341','342','343','346','096')
GROUP BY 1, 2`,

tobacco: `
-- Chart: Spending -> Tobacco and intoxicants.
-- What: monthly spend on tobacco and intoxicants, in crore rupees.
-- 7-day recall window, so the weekly figure is scaled up to a month (x30/7).
WITH ${SCALE_HH}
SELECT CASE WHEN Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       CASE Item_Code_12_series
         WHEN '319' THEN 'Tobacco'
         WHEN '329' THEN 'Intoxicants'
       END AS code,
       SUM(MULTIPLIER * Total_Consumption_Value_12_serie) * (SELECT hh FROM scale) / 1e7
         * (30.0 / 7.0) AS w
FROM 'hces_parquet/consumption_12.parquet'
WHERE Item_Code_12_series IN ('319', '329')
GROUP BY 1, 2`,

durables: `
-- Chart: Spending -> Household durables bought last year.
-- What: how many households bought each durable in the last 365 days.
-- The chart counts households, so the multiplier is summed per item.
WITH ${SCALE_HH}
SELECT CASE ITEM_CODE
         WHEN '580' THEN 'Electric fan'
         WHEN '623' THEN 'Mobile handset'
         WHEN '560' THEN 'Television'
         WHEN '590' THEN 'Water purifier'
         WHEN '588' THEN 'Refrigerator/freezer'
         WHEN '585' THEN 'Washing machine'
         WHEN '601' THEN 'Motor cycle/scooter'
         WHEN '581' THEN 'Air conditioner'
         WHEN '602' THEN 'Motor car/jeep'
       END AS code,
       -- a household "bought" if it recorded at least one purchase
       SUM(CASE WHEN FIRST_PURCHASE_NUMBER > 0 THEN MULTIPLIER ELSE 0 END) * (SELECT hh FROM scale) AS w
FROM 'hces_parquet/consumption_14.parquet'
WHERE ITEM_CODE IN ('580','623','560','590','588','585','601','581','602')
GROUP BY 1`,

onlineChannels: `
-- Chart: Spending -> Online shopping categories.
-- What: households that bought each category online (ever, last 365 days).
-- The flags are separate columns on the same table; each is tested > 0.
-- A household is counted once per category it used.
WITH ${SCALE_HH}
SELECT CASE WHEN Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       CASE
         WHEN COALESCE(Online_purchase_medicine, 0) > 0 THEN 'Medicine'
         WHEN COALESCE(Online_purchase_services, 0) > 0 THEN 'Services'
         WHEN COALESCE(Online_purchase_education, 0) > 0 THEN 'Education'
         WHEN COALESCE(Online_purchase_fuel_light, 0) > 0 THEN 'Fuel & light'
         WHEN COALESCE(Online_purchase_toilet_articles, 0) > 0 THEN 'Toilet articles'
       END AS channel,
       SUM(Multiplier) * (SELECT hh FROM scale) AS w
FROM 'hces_parquet/consumption_4_2.parquet'
WHERE Online_purchase_medicine > 0 OR Online_purchase_services > 0
   OR Online_purchase_education > 0 OR Online_purchase_fuel_light > 0
   OR Online_purchase_toilet_articles > 0
GROUP BY 1, 2`,

/* ---------------- Spending power (MPCE) ---------------- */

mpceDist: `
-- Chart: Spending -> Spending power (distribution).
-- What: how much one person spends per month (MPCE = Monthly Per-Capita
-- Consumption Expenditure), summarized at key percentiles + the average.
-- Method: visit-1 records only (one per household); each person counts once
-- through their household, so the weight = multiplier x household size.
-- Percentile = the value at which that share of people spends less.
-- The dashboard interpolates between the two households that straddle each
-- percentile; this query takes the first household past the line (same within
-- a few rupees at this scale).
WITH mp AS (
    SELECT MONTHLY_CONSUMPTION_EXP / NULLIF(HOUSEHOLD_SIZE, 0) AS m,
           MULTIPLIER * HOUSEHOLD_SIZE AS w
    FROM 'hces_parquet/supplementary_consumption.parquet'
    WHERE VISIT = '1' AND MONTHLY_CONSUMPTION_EXP > 0 AND HOUSEHOLD_SIZE > 0
), cdf AS (
    -- running share of people, from poorest to richest
    SELECT m, SUM(w) OVER (ORDER BY m) / (SELECT SUM(w) FROM mp) AS c
    FROM mp
)
SELECT
    (SELECT MIN(m) FROM cdf WHERE c >= 0.10) AS p10,  -- 10% of people spend less
    (SELECT MIN(m) FROM cdf WHERE c >= 0.20) AS p20,
    (SELECT MIN(m) FROM cdf WHERE c >= 0.30) AS p30,
    (SELECT MIN(m) FROM cdf WHERE c >= 0.40) AS p40,
    (SELECT MIN(m) FROM cdf WHERE c >= 0.50) AS p50,  -- the median
    (SELECT MIN(m) FROM cdf WHERE c >= 0.60) AS p60,
    (SELECT MIN(m) FROM cdf WHERE c >= 0.70) AS p70,
    (SELECT MIN(m) FROM cdf WHERE c >= 0.80) AS p80,
    (SELECT MIN(m) FROM cdf WHERE c >= 0.90) AS p90,
    (SELECT SUM(m * w) / SUM(w) FROM mp) AS mean     -- weighted average
`,

mpceState: `
-- Chart: Spending -> Median spending power by state.
-- What: the median MPCE (₹/person/month) for each state and sector.
-- Same method as the distribution chart, but split per state/sector.
-- The dashboard keeps the 12 states with the highest median for readability.
WITH sm(code, name) AS (VALUES
        ('01','Jammu & Kashmir'), ('02','Himachal Pradesh'), ('03','Punjab'),
        ('04','Chandigarh'),      ('05','Uttarakhand'),      ('06','Haryana'),
        ('07','Delhi'),           ('08','Rajasthan'),        ('09','Uttar Pradesh'),
        ('10','Bihar'),           ('11','Sikkim'),           ('12','Arunachal Pradesh'),
        ('13','Nagaland'),        ('14','Manipur'),          ('15','Mizoram'),
        ('16','Tripura'),         ('17','Meghalaya'),        ('18','Assam'),
        ('19','West Bengal'),     ('20','Jharkhand'),        ('21','Odisha'),
        ('22','Chhattisgarh'),    ('23','Madhya Pradesh'),   ('24','Gujarat'),
        ('25','Daman & Diu'),     ('26','Dadra & Nagar Haveli'), ('27','Maharashtra'),
        ('28','Andhra Pradesh'),  ('29','Karnataka'),        ('30','Goa'),
        ('31','Lakshadweep'),     ('32','Kerala'),           ('33','Tamil Nadu'),
        ('34','Puducherry'),      ('35','Andaman & Nicobar'),('36','Telangana'),
        ('37','Ladakh')),
     mp AS (
        SELECT s.State AS st, s.Sector AS sec,
               MONTHLY_CONSUMPTION_EXP / NULLIF(HOUSEHOLD_SIZE, 0) AS m,
               MULTIPLIER * HOUSEHOLD_SIZE AS w
        FROM 'hces_parquet/supplementary_consumption.parquet' s
        WHERE VISIT = '1' AND MONTHLY_CONSUMPTION_EXP > 0 AND HOUSEHOLD_SIZE > 0
), cdf AS (
    -- cumulative share of people within each state+sector, poorest first
    SELECT st, sec, m,
           SUM(w) OVER (PARTITION BY st, sec ORDER BY m)
             / NULLIF(SUM(w) OVER (PARTITION BY st, sec), 0) AS c
    FROM mp
), med AS (
    SELECT st, sec, m,
           ROW_NUMBER() OVER (PARTITION BY st, sec ORDER BY c) AS rn
    FROM cdf WHERE c >= 0.5
)
SELECT sm.name AS state_name,
       CASE WHEN med.sec = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       med.m AS median_mpce
FROM med JOIN sm ON med.st = sm.code
WHERE med.rn = 1
ORDER BY median_mpce DESC
LIMIT 12`,

mpceCurve: `
-- Chart: Spending -> Spending-power curve (p1..p99 for each group).
-- What: the full percentile curve — how much the poorest 1%, 2% ... 99% of
-- people spend per month — one line per group.
-- This query draws the "Rural / Urban" lines. To draw any other group on the
-- chart, change the column inside the first CASE (State, Household_Type,
-- Social_Group_of_HH_Head, Religion_of_HH_Head, Land_Ownership,
-- Energy_Source_Cooking, Ration_Card_Type, Type_of_Dwelling_Unit, VISIT_MONTH).
-- Person-weighted: weight = multiplier x household size, visit-1 records only.
WITH mp AS (
    SELECT CASE WHEN Sector = '1' THEN 'Rural' ELSE 'Urban' END AS grp,
           MONTHLY_CONSUMPTION_EXP / NULLIF(HOUSEHOLD_SIZE, 0) AS m,
           MULTIPLIER * HOUSEHOLD_SIZE AS w
    FROM 'hces_parquet/supplementary_consumption.parquet'
    WHERE VISIT = '1' AND MONTHLY_CONSUMPTION_EXP > 0 AND HOUSEHOLD_SIZE > 0
      AND Sector IS NOT NULL
), cdf AS (
    -- running share of people within each group, poorest first
    SELECT grp, m,
           SUM(w) OVER (PARTITION BY grp ORDER BY m)
             / NULLIF(SUM(w) OVER (PARTITION BY grp), 0) AS c
    FROM mp
)
-- cross join every percentile (1..99) with every group, then take the first
-- spending value where the cumulative share has crossed that percentile
SELECT c.grp, p.value AS percentile, MIN(c.m) AS mpce_rupees
FROM cdf c
CROSS JOIN generate_series(1, 99) AS p(value)
WHERE c.c >= p.value / 100.0
GROUP BY c.grp, p.value
ORDER BY c.grp, p.value`,

budgetSplit: `
-- Chart: Spending -> Food vs non-food budget share.
-- What: the food share of total monthly household expenditure.
-- Two weighted totals, one for food items and one for everything, then
-- food / total x 100 = the share shown on the chart.
WITH ${SCALE_HH}
SELECT
    -- all food & beverages rows, weighted, scaled, in crore rupees
    (SELECT SUM(Total_Consumption_Value * Multiplier) FROM 'hces_parquet/food_consumption.parquet')
      * (SELECT hh FROM scale) / 1e7 AS food_cr,
    -- all monthly consumption (visit-1 records), in crore rupees
    (SELECT SUM(MONTHLY_CONSUMPTION_EXP * MULTIPLIER)
     FROM 'hces_parquet/supplementary_consumption.parquet'
     WHERE VISIT = '1')
      * (SELECT hh FROM scale) / 1e7 AS total_cr
-- food_share_pct = 100 x food_cr / total_cr (the chart shows this)`,

/* ---------------- Schemes ---------------- */

pds: `
-- Chart: Schemes -> PDS ration.
-- What: households that received any PDS (ration) item in the last 30 days.
-- The 'Yes'/'No' split is the doughnut on the dashboard.
WITH ${SCALE_HH}
SELECT CASE WHEN Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       CASE WHEN Ration_Any_Item_Last_30_Days = '1' THEN 'Yes' ELSE 'No' END AS got,
       SUM(Multiplier) * (SELECT hh FROM scale) AS w
FROM 'hces_parquet/consumption_4_1.parquet'
WHERE Ration_Any_Item_Last_30_Days IN ('1', '2')   -- '1' = yes, '2' = no
GROUP BY 1, 2`,

lpg: `
-- Chart: Schemes -> LPG subsidy.
-- What: households that received an LPG subsidy in the last 30 days.
WITH ${SCALE_HH}
SELECT CASE WHEN Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       CASE WHEN LPG_subsidy_received = '1' THEN 'Yes' ELSE 'No' END AS got,
       SUM(Multiplier) * (SELECT hh FROM scale) AS w
FROM 'hces_parquet/consumption_4_2.parquet'
WHERE LPG_subsidy_received IN ('1', '2')
GROUP BY 1, 2`,

electricity: `
-- Chart: Schemes -> Free electricity.
-- What: households that got free electricity (any amount) in the last 30 days.
WITH ${SCALE_HH}
SELECT CASE WHEN Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       CASE WHEN Free_electricity = '1' THEN 'Yes' ELSE 'No' END AS got,
       SUM(Multiplier) * (SELECT hh FROM scale) AS w
FROM 'hces_parquet/consumption_4_2.parquet'
WHERE Free_electricity IN ('1', '2')
GROUP BY 1, 2`,

ayushman: `
-- Chart: Schemes -> Ayushman Bharat card.
-- What: households where someone has an Ayushman Bharat (PM-JAY) card.
WITH ${SCALE_HH}
SELECT CASE WHEN Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       CASE WHEN Ayushman_beneficiary = '1' THEN 'Yes' ELSE 'No' END AS got,
       SUM(Multiplier) * (SELECT hh FROM scale) AS w
FROM 'hces_parquet/consumption_4_2.parquet'
WHERE Ayushman_beneficiary IN ('1', '2')
GROUP BY 1, 2`,

school: `
-- Chart: Schemes -> Children in school.
-- What: households with any member attending school (current academic year).
WITH ${SCALE_HH}
SELECT CASE WHEN Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       CASE WHEN Any_member_attended_school = '1' THEN 'Yes' ELSE 'No' END AS got,
       SUM(Multiplier) * (SELECT hh FROM scale) AS w
FROM 'hces_parquet/consumption_4_2.parquet'
WHERE Any_member_attended_school IN ('1', '2')
GROUP BY 1, 2`,

schoolSplit: `
-- Chart: Schemes -> Government vs private school.
-- What: children in government schools vs private schools.
-- The survey stores the NUMBER of children per household in each type,
-- so each child is counted through their household's multiplier.
WITH ${SCALE_HH}
SELECT CASE WHEN Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       SUM(COALESCE(Num_govt_school_attended, 0) * Multiplier) * (SELECT hh FROM scale) AS govt,
       SUM(COALESCE(Num_private_school_attended, 0) * Multiplier) * (SELECT hh FROM scale) AS private
FROM 'hces_parquet/consumption_4_2.parquet'
GROUP BY 1`,

schoolBenefits: `
-- Chart: Schemes -> Free school benefits.
-- What: households whose children received free textbooks, stationery,
-- school bags, or a fee waiver (the education-in-kind benefits).
WITH ${SCALE_HH}
SELECT CASE WHEN Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       SUM(CASE WHEN Free_textbooks_received = '1' THEN Multiplier ELSE 0 END) * (SELECT hh FROM scale) AS textbooks,
       SUM(CASE WHEN Free_stationery_received = '1' THEN Multiplier ELSE 0 END) * (SELECT hh FROM scale) AS stationery,
       SUM(CASE WHEN Free_school_bag_received = '1' THEN Multiplier ELSE 0 END) * (SELECT hh FROM scale) AS school_bag,
       SUM(CASE WHEN Fee_waiver_received = '1' THEN Multiplier ELSE 0 END) * (SELECT hh FROM scale) AS fee_waiver
FROM 'hces_parquet/consumption_4_2.parquet'
GROUP BY 1`,

schoolMeals: `
-- Chart: Schemes -> Mid-day school meals.
-- What: school-age children (5-17) who got a meal from school.
-- Counted per PERSON (not household), so the population scale is used.
WITH ${SCALE_POP}
SELECT CASE WHEN Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       CASE WHEN TRY_CAST(Meals_From_School AS INTEGER) > 0 THEN 'Yes' ELSE 'No' END AS got,
       SUM(Multiplier) * (SELECT pop FROM scale) AS w
FROM 'hces_parquet/individual_characteristics.parquet'
WHERE TRY_CAST(Age AS INTEGER) BETWEEN 5 AND 17
GROUP BY 1, 2`,

ayushmanDetail: `
-- Chart: Schemes -> Ayushman coverage and use.
-- What: households with an Ayushman card, that had a hospital case last
-- year, and that actually received a medical benefit.
-- Reading the three bars together shows coverage vs actual use.
WITH ${SCALE_HH}
SELECT CASE WHEN Sector = '1' THEN 'Rural' ELSE 'Urban' END AS sector,
       SUM(CASE WHEN Ayushman_beneficiary = '1' THEN Multiplier ELSE 0 END) * (SELECT hh FROM scale) AS card,
       SUM(CASE WHEN Hospitalization_case = '1' THEN Multiplier ELSE 0 END) * (SELECT hh FROM scale) AS hospitalised,
       SUM(CASE WHEN Medical_benefit_received = '1' THEN Multiplier ELSE 0 END) * (SELECT hh FROM scale) AS got_benefit
FROM 'hces_parquet/consumption_4_2.parquet'
GROUP BY 1`,
};

// ---------------------------------------------------------------------------
// Tiny SQL syntax highlighter (no dependencies). Colors keywords, numbers,
// strings and comments so pasted SQL reads like an editor view.
// ---------------------------------------------------------------------------
export function sqlHighlight(sql) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Single pass: comments and strings are matched first, so keywords and
  // numbers inside them stay gray. Alternation order does that for us.
  const TOKEN = /(--[^\n]*)|('[^']*')|\b(SELECT|FROM|WHERE|GROUP|BY|ORDER|HAVING|LIMIT|WITH|AS|CASE|WHEN|THEN|ELSE|END|AND|OR|NOT|IN|BETWEEN|IS|NULL|LEFT|RIGHT|INNER|JOIN|ON|USING|DISTINCT|CAST|TRY_CAST|COALESCE|NULLIF|SUM|COUNT|MIN|MAX|OVER|PARTITION|CROSS|VALUES|FILTER)\b|\b(\d+(?:\.\d+)?)\b/gi;
  return esc(sql).replace(TOKEN, (m, com, str, kw, num) => {
    if (com !== undefined) return '<span class="sql-com">' + com + '</span>';
    if (str !== undefined) return '<span class="sql-str">' + str + '</span>';
    if (kw !== undefined) return '<span class="sql-kw">' + kw + '</span>';
    return '<span class="sql-num">' + num + '</span>';
  });
}
