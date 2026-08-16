"""Download the HCES survey data (public copy) and set up hces_parquet/.

Run:  python download_data.py

Downloads ~130 MB from this project's GitHub Release and extracts the 14
Parquet tables into ./hces_parquet/. The data is the public HCES 2023-24
survey released by NSO/MoSPI, Government of India, converted to Parquet
for this dashboard. No other setup is needed.

If you already have hces_parquet/ with 14 tables, this does nothing.
"""
import os
import urllib.request
import zipfile

URL = "https://github.com/chiragrohit/hces-dashboard/releases/download/data-v1/hces_parquet.zip"
HERE = os.path.dirname(os.path.abspath(__file__))
ZIP_PATH = os.path.join(HERE, "hces_parquet.zip")
OUT_DIR = os.path.join(HERE, "hces_parquet")


def main():
    if os.path.isdir(OUT_DIR) and len(os.listdir(OUT_DIR)) >= 14:
        print("hces_parquet/ already has the tables — nothing to do.")
        return
    print("Downloading HCES data (~130 MB), this can take a minute...")
    urllib.request.urlretrieve(URL, ZIP_PATH)
    print("Extracting...")
    with zipfile.ZipFile(ZIP_PATH) as z:
        z.extractall(HERE)
    os.remove(ZIP_PATH)
    n = len(os.listdir(OUT_DIR)) if os.path.isdir(OUT_DIR) else 0
    print(f"Done: {n} tables in hces_parquet/.")


if __name__ == "__main__":
    main()
