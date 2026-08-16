"""Upload survey data to the Modal volume (run from repo root).

The `modal volume put` CLI mangles absolute remote paths on Windows
(creates a literal "C:" folder), so use the Python SDK batch_upload,
which uses posix paths correctly.

    python deploy/upload_data.py
"""
import os
import sys

import modal

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
volume = modal.Volume.from_name("hces-parquet")

# remove any junk created by the CLI's Windows path handling
for bad in ("C:", "C:/hces_parquet", "hces_parquet/C:"):
    try:
        volume.remove_file(bad, recursive=True)
        print(f"removed junk path: {bad}")
    except Exception:
        pass

with volume.batch_upload() as batch:
    batch.put_directory(os.path.join(ROOT, "hces_parquet"), "/hces_parquet")
    batch.put_file(os.path.join(ROOT, "web_dashboard", "data", "metadata.json"), "/metadata.json")

print("upload done:")
for entry in volume.listdir("/hces_parquet"):
    print(" ", entry.path)
