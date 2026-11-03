"""Download the raw inputs into data/raw. The SAFER CSV link on data.ca.gov is a signed URL that expires, so we ask the CKAN API for a fresh one."""
import json
import urllib.request
from pathlib import Path

RAW = Path(__file__).resolve().parents[1] / "data" / "raw"
NEEDS = "https://www.waterboards.ca.gov/drinking_water/certlic/drinkingwater/documents/needs"
FILES = {
    "2026affordability.xlsx": f"{NEEDS}/2026/2026affordability.xlsx",
    "2024costassessment.pdf": f"{NEEDS}/2024/2024costassessment.pdf",
}


def get(url, dest):
    with urllib.request.urlopen(url, timeout=120) as r:
        dest.write_bytes(r.read())
    print("saved", dest.name, dest.stat().st_size // 1024, "KB")


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    api = "https://data.ca.gov/api/3/action/package_show?id=safer-failing-and-at-risk-drinking-water-systems"
    with urllib.request.urlopen(api, timeout=60) as r:
        pkg = json.load(r)["result"]
    csv_url = next(x["url"] for x in pkg["resources"] if x["format"] == "CSV")
    get(csv_url, RAW / "SAFER_RA.csv")
    for name, url in FILES.items():
        get(url, RAW / name)


if __name__ == "__main__":
    main()
