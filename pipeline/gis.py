"""GIS analysis: county layer, spatial clustering of Failing systems (Moran's I), local hotspots (Getis-Ord Gi*),
and regional consolidation hubs (receivers that could absorb several failing neighbours)."""
import json
from pathlib import Path

import numpy as np
import pandas as pd
from shapely.geometry import shape, mapping
from sklearn.neighbors import BallTree

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "app" / "data"
RADIUS_KM = 25
EARTH_KM = 6371.0
SEED = 11


def counties():
    d = json.loads((RAW / "us_counties.json").read_text())
    feats = []
    for f in d["features"]:
        if not str(f["id"]).startswith("06"):
            continue
        g = shape(f["geometry"]).simplify(0.004, preserve_topology=True)
        feats.append({"type": "Feature", "properties": {"name": f["properties"]["NAME"]},
                      "geometry": json.loads(json.dumps(mapping(g), default=lambda x: round(x, 4)))})
    (OUT / "counties.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":")))
    return len(feats)


def morans_i(x, nbrs, perms=999):
    """Moran's I with row-standardised binary distance-band weights (self excluded) and a permutation p-value."""
    n = len(x)
    z = x - x.mean()
    keep = np.array([len(a) > 0 for a in nbrs])

    def stat(zv):
        num = sum(zv[i] * zv[nbrs[i]].mean() for i in range(n) if keep[i])
        return (keep.sum() / keep.sum()) * num / (zv[keep] ** 2).sum()

    obs = stat(z)
    rng = np.random.default_rng(SEED)
    sims = np.array([stat(rng.permutation(z)) for _ in range(perms)])
    p = (1 + (sims >= obs).sum()) / (perms + 1)
    return float(obs), float(sims.mean()), float(p)


def gi_star(x, nbrs_incl):
    n = len(x)
    xbar, s = x.mean(), np.sqrt((x ** 2).mean() - x.mean() ** 2)
    z = np.zeros(n)
    for i in range(n):
        idx = nbrs_incl[i]
        wsum = len(idx)
        num = x[idx].sum() - xbar * wsum
        den = s * np.sqrt((n * wsum - wsum ** 2) / (n - 1))
        z[i] = num / den if den > 0 else 0.0
    return z


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    n_counties = counties()
    d = pd.read_csv(RAW / "SAFER_RA.csv", encoding="utf-8-sig", low_memory=False)
    d = d[(d.LONGITUDE_MEASURE != 0) & d.LATITUDE_MEASURE.notna()].reset_index(drop=True)
    pts = np.radians(d[["LATITUDE_MEASURE", "LONGITUDE_MEASURE"]].values)
    tree = BallTree(pts, metric="haversine")
    incl = tree.query_radius(pts, r=RADIUS_KM / EARTH_KM)
    excl = [a[a != i] for i, a in enumerate(incl)]

    failing = (d.FINAL_SAFER_STATUS == "Failing").astype(float).values
    I, E, p = morans_i(failing, excl)
    at_risk_people = np.where(d.FINAL_SAFER_STATUS.isin(["Failing", "At-Risk"]), d.POPULATION, 0).astype(float)
    z = gi_star(at_risk_people, incl)
    target = d.FINAL_SAFER_STATUS.isin(["Failing", "At-Risk"]).values
    zmap = {pid: round(float(v), 2) for pid, v in zip(d.WATER_SYSTEM_NUMBER[target], z[target])}

    # regional consolidation hubs from the routing output
    rt = json.loads((OUT / "routes.json").read_text())["routes"]
    systems = {s["id"]: s for s in json.loads((OUT / "systems.json").read_text())}
    coord = d.set_index("WATER_SYSTEM_NUMBER")[["LATITUDE_MEASURE", "LONGITUDE_MEASURE", "SYSTEM_NAME"]]
    hubs = {}
    for pid, r in rt.items():
        if r.get("viable") and r.get("receiver"):
            h = hubs.setdefault(r["receiver"], {"id": r["receiver"], "name": r["receiver_name"], "joining": [], "people": 0, "cost": 0})
            h["joining"].append(pid)
            h["people"] += systems[pid]["pop"]
            h["cost"] += r["cost"]
    hub_list = sorted((h for h in hubs.values() if len(h["joining"]) >= 3), key=lambda h: -h["people"])[:15]
    for h in hub_list:
        c = coord.loc[h["id"]] if h["id"] in coord.index else None
        h["lat"] = None if c is None else round(float(c.LATITUDE_MEASURE), 4)
        h["lon"] = None if c is None else round(float(c.LONGITUDE_MEASURE), 4)
        h["n"] = len(h["joining"])
        h["cost"] = int(h["cost"])

    stats = {
        "radius_km": RADIUS_KM, "n_systems": int(len(d)), "n_failing": int(failing.sum()),
        "morans_i_failing": round(I, 3), "morans_i_expected_random": round(E, 3), "morans_p_permutation_999": round(p, 4),
        "hotspots_p05": int((z[target] > 1.96).sum()), "hotspots_p01": int((z[target] > 2.58).sum()),
        "hotspot_note": "Gi* on people served by Failing or At-Risk systems, binary weights within 25 km. z-scores are not corrected for multiple testing.",
        "hubs_with_3plus": int(sum(1 for h in hubs.values() if len(h["joining"]) >= 3)),
        "counties": n_counties,
    }
    (OUT / "gis.json").write_text(json.dumps({"stats": stats, "z": zmap, "hubs": hub_list}, separators=(",", ":")))
    print(json.dumps(stats, indent=1))
    print([(h["name"], h["n"], h["people"]) for h in hub_list[:6]])


if __name__ == "__main__":
    main()
