"""Consolidation routing: for each eligible Failing / At-Risk system, find the receiving system the state's cost model
would connect it to, estimate the pipeline route, and cost it with the state's own unit costs.

Method follows the State Water Board 2024 Cost Assessment, Physical Consolidation methodology (data/raw/consol.pdf):
  joining:   Failing <= 1,000 connections, At-Risk <= 500 connections
  receiving: community system that is not Failing or At-Risk, > 500 connections, larger than the joining system
  distance:  intersect, or route within 3 miles from the receiving boundary to the joining system; largest receiver wins
  cost:      (1,000 ft buffer + route ft) x $220/ft + $6,200 x connections (service lines) + $5,437 x connections (fees),
             + 15% admin on construction, + CEQA ($25k intersect, $100k route), then +20% contingency, +10% planning,
             +15% engineering, x1.031 inflation
  viable:    >75 connections: < $96,000 per connection; <=75 connections: < $7.2M total
Departures from the state's method (all stated in the app): straight-line distance x CIRCUITY stands in for the street
route; no RSMeans regional cost adjustment; receiver boundaries are the simplified web polygons.
"""
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import pandas as pd
from pyproj import Transformer
from shapely.geometry import shape, Point
from shapely.ops import nearest_points, transform
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "app" / "data"
URL = ("https://gispublic.waterboards.ca.gov/portalserver/rest/services/Drinking_Water/"
       "California_Drinking_Water_System_Area_Boundaries/MapServer/0/query")

FT_PER_M = 3.28084
MI_PER_M = 1 / 1609.344
PIPE_PER_FT = 220
SERVICE_LINE = 6200
CONN_FEE = 5437          # 2024 Cost Assessment, Table 3 (public water systems)
ADMIN = 0.15
CEQA = {"intersect": 25_000, "route": 100_000}
ADDERS = 0.20 + 0.10 + 0.15
INFLATION = 1.031
BUFFER_FT = 1000
MAX_ROUTE_MI = 3.0
CIRCUITY = 1.3           # assumption: street route is ~30% longer than straight line; not validated
JOIN_MAX = {"Failing": 1000, "At-Risk": 500}
RECEIVER_MIN_CONN = 500


def capital_cost(conn, route_ft, kind):
    pipeline = (BUFFER_FT + route_ft if kind == "route" else BUFFER_FT) * PIPE_PER_FT
    service = SERVICE_LINE * conn
    fees = CONN_FEE * conn
    admin = ADMIN * (pipeline + service)
    subtotal = pipeline + service + fees + admin + CEQA[kind]
    return subtotal * (1 + ADDERS) * INFLATION, {"pipeline": pipeline, "service": service, "fees": fees}


def viable(conn, total):
    return (total / conn < 96_000) if conn > 75 else (total < 7_200_000)


def fetch_polygons(ids):
    feats = {}
    for i in range(0, len(ids), 80):
        chunk = ids[i:i + 80]
        q = urllib.parse.urlencode({
            "where": "WATER_SYSTEM_NUMBER IN (%s)" % ",".join("'%s'" % x for x in chunk),
            "outFields": "WATER_SYSTEM_NUMBER", "outSR": 4326, "f": "geojson",
            "maxAllowableOffset": 0.002, "geometryPrecision": 5})
        with urllib.request.urlopen(URL + "?" + q, timeout=120) as r:
            for f in json.load(r).get("features", []):
                if f.get("geometry"):
                    feats.setdefault(f["properties"]["WATER_SYSTEM_NUMBER"], f["geometry"])
        print("polygons", i, len(feats), file=sys.stderr)
    return feats


def load_systems():
    d = pd.read_csv(RAW / "SAFER_RA.csv", encoding="utf-8-sig", low_memory=False)
    d["conn"] = d.SERVICE_CONNECTIONS.fillna(0)
    d.loc[d.conn <= 0, "conn"] = (d.POPULATION / 3.3).apply(lambda x: max(1, int(-(-x // 1))))
    d["county"] = d.COUNTY.str.replace(" County", "", case=False).str.strip().str.title()
    return d


def main():
    d = load_systems()
    recv = d[(~d.FINAL_SAFER_STATUS.isin(["Failing", "At-Risk"])) & (d.FEDERAL_CLASSIFICATION_TYPE == "COMMUNITY")
             & (d.conn > RECEIVER_MIN_CONN)].copy()
    cache = RAW / "receiver_polygons.json"
    if cache.exists():
        polys = json.loads(cache.read_text())
    else:
        polys = fetch_polygons(recv.WATER_SYSTEM_NUMBER.tolist())
        cache.write_text(json.dumps(polys))
    to_m = Transformer.from_crs(4326, 3310, always_xy=True).transform
    to_ll = Transformer.from_crs(3310, 4326, always_xy=True).transform

    rid, rgeom = [], []
    for pid, g in polys.items():
        geom = shape(g)
        if not geom.is_valid:
            geom = geom.buffer(0)
        rid.append(pid)
        rgeom.append(transform(to_m, geom))
    tree = STRtree(rgeom)
    rinfo = recv.set_index("WATER_SYSTEM_NUMBER")

    join = d[((d.FINAL_SAFER_STATUS == "Failing") & (d.conn <= JOIN_MAX["Failing"])) |
             ((d.FINAL_SAFER_STATUS == "At-Risk") & (d.conn <= JOIN_MAX["At-Risk"]))]
    reach_m = MAX_ROUTE_MI / CIRCUITY / MI_PER_M   # straight-line search radius that could still be <= 3 route miles
    routes, feats = {}, []
    for _, r in join.iterrows():
        x, y = to_m(r.LONGITUDE_MEASURE, r.LATITUDE_MEASURE)
        pt = Point(x, y)
        best = None
        for k in tree.query(pt.buffer(reach_m)):
            pid = rid[k]
            if pid == r.WATER_SYSTEM_NUMBER or pid not in rinfo.index:
                continue
            c = rinfo.loc[pid]
            if c.conn <= r.conn:
                continue
            g = rgeom[k]
            dist_m = 0.0 if g.contains(pt) else pt.distance(g)
            route_mi = dist_m * CIRCUITY * MI_PER_M
            if dist_m > 0 and route_mi > MAX_ROUTE_MI:
                continue
            if best is None or c.conn > best["rconn"]:
                best = {"pid": pid, "rconn": int(c.conn), "dist_m": dist_m, "k": k, "rname": c.SYSTEM_NAME}
        if best is None:
            routes[r.WATER_SYSTEM_NUMBER] = {"eligible": True, "viable": False, "reason": "no receiving system within 3 miles"}
            continue
        kind = "intersect" if best["dist_m"] == 0 else "route"
        route_ft = best["dist_m"] * CIRCUITY * FT_PER_M
        conn = int(r.conn)
        total, parts = capital_cost(conn, route_ft, kind)
        ok = viable(conn, total)
        rec = {"eligible": True, "viable": bool(ok), "receiver": best["pid"], "receiver_name": best["rname"].title(),
               "receiver_conn": best["rconn"], "kind": kind, "route_mi": round(best["dist_m"] * CIRCUITY * MI_PER_M, 2),
               "cost": int(total), "per_conn": int(total / conn), "pipeline": int(parts["pipeline"])}
        if not ok:
            rec["reason"] = "over the state's funding viability threshold"
        routes[r.WATER_SYSTEM_NUMBER] = rec
        if kind == "route":
            a, b = nearest_points(pt, rgeom[best["k"]])
            lon1, lat1 = to_ll(a.x, a.y)
            lon2, lat2 = to_ll(b.x, b.y)
            feats.append({"type": "Feature", "properties": {"id": r.WATER_SYSTEM_NUMBER, "viable": bool(ok)},
                          "geometry": {"type": "LineString", "coordinates": [[round(lon1, 5), round(lat1, 5)], [round(lon2, 5), round(lat2, 5)]]}})

    n_el = len(join)
    n_via = sum(1 for v in routes.values() if v["viable"])
    by = join.groupby("FINAL_SAFER_STATUS").WATER_SYSTEM_NUMBER.apply(list)
    totals = d[d.FINAL_SAFER_STATUS.isin(["Failing", "At-Risk"])].FINAL_SAFER_STATUS.value_counts()
    stats = {s: {"total": int(totals[s]), "eligible": len(ids), "viable": sum(1 for i in ids if routes[i]["viable"])}
             for s, ids in by.items()}
    summary = {"eligible": n_el, "viable": n_via, "by_status": stats, "receivers_with_polygon": len(rid),
               "assumptions": {"circuity": CIRCUITY, "max_route_miles": MAX_ROUTE_MI, "pipeline_per_ft": PIPE_PER_FT,
                               "service_line": SERVICE_LINE, "connection_fee": CONN_FEE, "regional_adjustment": "not applied"},
               "state_reference": "2024 Cost Assessment: physical consolidation modelled for 168 of 385 Failing (44%) and 266 of 613 At-Risk (43%) systems"}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "routes.json").write_text(json.dumps({"summary": summary, "routes": routes}, separators=(",", ":")))
    (OUT / "routes.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":")))
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
