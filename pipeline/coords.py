"""Coordinate quality control for water-system locations.

Audit (2026-11-03): all 1,062 Failing / At-Risk systems have coordinates inside California and inside their registered
county, but 28 of the 1,061 with a service-area polygon have a point more than 0.5 km outside their own polygon
(median 2.9 km, a few tens of km). The state's boundary layer is what the consolidation method itself uses, so those points
are moved to a point inside the polygon. Moves of more than 25 km are flagged as uncertain, because either the point or the
polygon could be wrong.
"""
import json
import math
from pathlib import Path

import pandas as pd
from shapely.geometry import shape, Point

ROOT = Path(__file__).resolve().parents[1]
BOUNDARIES = ROOT / "app" / "data" / "boundaries.geojson"
TOLERANCE_DEG = 0.005       # about 0.5 km
FAR_KM = 25


def _km(lat1, lon1, lat2, lon2):
    p = math.pi / 180
    a = math.sin((lat2 - lat1) * p / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(a))


def corrected(d):
    """Return a frame indexed by WATER_SYSTEM_NUMBER with lat, lon, src ('safer', 'polygon', 'polygon_far'), moved_km."""
    out = d.set_index("WATER_SYSTEM_NUMBER")[["LATITUDE_MEASURE", "LONGITUDE_MEASURE"]].rename(
        columns={"LATITUDE_MEASURE": "lat", "LONGITUDE_MEASURE": "lon"}).copy()
    out["src"] = "safer"
    out["moved_km"] = 0.0
    if not BOUNDARIES.exists():
        return out
    for f in json.loads(BOUNDARIES.read_text())["features"]:
        pid = f["properties"]["id"]
        if pid not in out.index:
            continue
        g = shape(f["geometry"])
        if not g.is_valid:
            g = g.buffer(0)
        lat, lon = out.at[pid, "lat"], out.at[pid, "lon"]
        if g.buffer(TOLERANCE_DEG).contains(Point(lon, lat)):
            continue
        c = g.centroid
        rp = c if g.contains(c) else g.representative_point()
        km = _km(lat, lon, rp.y, rp.x)
        out.loc[pid, ["lat", "lon"]] = [rp.y, rp.x]
        out.at[pid, "src"] = "polygon_far" if km > FAR_KM else "polygon"
        out.at[pid, "moved_km"] = round(km, 1)
    return out
