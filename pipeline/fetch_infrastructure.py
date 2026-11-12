"""Real water infrastructure for California from OpenStreetMap (Overpass API): canals and aqueducts, water pipelines,
tunnels, treatment plants and water towers. Written to app/data/infrastructure.json for the 3D map.

Context layer only. It is not used by the optimizer or the cost model."""
import json
import time
import subprocess
import sys
from pathlib import Path

from shapely.geometry import LineString

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "app" / "data" / "infrastructure.json"
BBOX = "32.4,-124.7,42.1,-114.0"
UA = "XylemProject/1.0 (student water research project)"
ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]

Q_LINES = f"""[out:json][timeout:180];
(
 way["waterway"~"^(canal|aqueduct)$"]["name"~"Aqueduct|Canal|Tunnel|Project|Mokelumne|Hetch",i]({BBOX});
 way["man_made"="pipeline"]["substance"="water"]({BBOX});
 way["waterway"~"^(canal|aqueduct)$"]["tunnel"~"yes|culvert"]({BBOX});
);
out geom tags;"""
Q_SITES = f"""[out:json][timeout:180];
nwr["man_made"~"^(water_works|wastewater_plant|water_tower)$"]({BBOX});
out center tags;"""


def overpass(q):
    """POST through curl (the system Python's TLS stack is too old for overpass-api.de); rotate mirrors with backoff."""
    for rnd in range(4):
        for url in ENDPOINTS:
            r = subprocess.run(["curl", "-s", "-m", "120", "-A", UA, "--data-urlencode", "data=" + q, url], capture_output=True)
            try:
                return json.loads(r.stdout)
            except ValueError:
                print("overpass busy:", url)
        time.sleep(20 * (rnd + 1))
    raise SystemExit("Overpass unavailable")


def kind_of(tags):
    if tags.get("man_made") == "pipeline":
        return "pipeline"
    if tags.get("tunnel") in ("yes", "culvert", "building_passage"):
        return "tunnel"
    return "aqueduct" if tags.get("waterway") == "aqueduct" or "aqueduct" in tags.get("name", "").lower() else "canal"


def main():
    lines = []
    cached = Path(sys.argv[1]) if len(sys.argv) > 1 else None          # optional: a saved response for the lines query
    for el in (json.loads(cached.read_text()) if cached else overpass(Q_LINES))["elements"]:
        g = el.get("geometry")
        if not g or len(g) < 2:
            continue
        ls = LineString([(p["lon"], p["lat"]) for p in g]).simplify(0.0004)       # about 40 m
        if ls.length < 0.012:                                                        # drop fragments under about 1.2 km
            continue
        t = el.get("tags", {})
        lines.append({"k": kind_of(t), "n": t.get("name", ""), "c": [[round(x, 5), round(y, 5)] for x, y in ls.coords]})
    sites = []
    for el in overpass(Q_SITES)["elements"]:
        c = el.get("center") or ({"lat": el["lat"], "lon": el["lon"]} if "lat" in el else None)
        if not c:
            continue
        t = el.get("tags", {})
        sites.append({"k": {"water_works": "plant", "wastewater_plant": "wastewater", "water_tower": "tower"}[t["man_made"]], "n": t.get("name", ""),
                      "x": round(c["lon"], 5), "y": round(c["lat"], 5)})
    OUT.write_text(json.dumps({"source": "OpenStreetMap contributors (ODbL), via Overpass API", "lines": lines, "sites": sites}, separators=(",", ":")))
    from collections import Counter
    print(len(lines), "lines", Counter(l["k"] for l in lines), "|", len(sites), "sites", Counter(s["k"] for s in sites), "|", OUT.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
