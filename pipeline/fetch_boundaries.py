"""Fetch simplified service-area polygons for Failing / At-Risk systems from the State Water Board SABL layer."""
import json
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
URL = ("https://gispublic.waterboards.ca.gov/portalserver/rest/services/Drinking_Water/"
       "California_Drinking_Water_System_Area_Boundaries/MapServer/0/query")


def main():
    ids = [s["id"] for s in json.loads((ROOT / "app/data/systems.json").read_text())]
    feats, seen = [], set()
    for i in range(0, len(ids), 80):
        chunk = ids[i:i + 80]
        where = "WATER_SYSTEM_NUMBER IN (%s)" % ",".join("'%s'" % x for x in chunk)
        q = urllib.parse.urlencode({
            "where": where, "outFields": "WATER_SYSTEM_NUMBER", "outSR": 4326, "f": "geojson",
            "maxAllowableOffset": 0.003, "geometryPrecision": 4, "returnGeometry": "true"})
        with urllib.request.urlopen(URL + "?" + q, timeout=120) as r:
            gj = json.load(r)
        for f in gj.get("features", []):
            pid = f["properties"]["WATER_SYSTEM_NUMBER"]
            if pid in seen or not f.get("geometry"):
                continue
            seen.add(pid)
            feats.append({"type": "Feature", "properties": {"id": pid}, "geometry": f["geometry"]})
        print(i, len(feats))
    out = ROOT / "app/data/boundaries.geojson"
    out.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":")))
    print("polygons", len(feats), "of", len(ids), "targets;", out.stat().st_size // 1024, "KB")
    (ROOT / "app/data/boundary_coverage.json").write_text(json.dumps({"targets": len(ids), "with_polygon": len(feats)}))


if __name__ == "__main__":
    main()
