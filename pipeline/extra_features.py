"""Features for each water system from the public datasets that pipeline/fetch_extra.py downloads.

Two kinds, kept apart on purpose:
  * as-of features are built only from records dated on or before a cutoff (violations, enforcement, school lead samples, dry-well
    reports, wildfires, weather). These provide an event-time reconstruction.
  * snapshot features describe the current system and its setting. Most have no historical publication/version information,
    so they are available for current descriptive analysis, but excluded from historical model inputs.
Historical forecasts use dated event features, terrain as a fixed geographic proxy, and sizes from prior-year archived assessments.
Event dates do not prove when a record was first published; a true publication-time backtest still needs archived source vintages.
Each feature has a group name; the forecast's ablation drops one group at a time to measure what that source is worth.
"""
import io
import json
import re
import subprocess
import zipfile
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
X = RAW / "extra"
APP = ROOT / "app" / "data"
GROUPS = {}                                   # column -> source group, filled as features are made


def tag(df, group):
    for c in df.columns:
        GROUPS[c] = group
    return df


def num(s):
    return pd.to_numeric(s.astype(str).str.replace(r"[$,%'\s]", "", regex=True), errors="coerce")


@lru_cache(maxsize=None)
def systems():
    """All SAFER systems with coordinates and county (the spine every spatial join hangs off)."""
    d = pd.read_csv(RAW / "SAFER_RA.csv", encoding="utf-8-sig", low_memory=False)
    d = d.rename(columns={"WATER_SYSTEM_NUMBER": "PWSID", "LATITUDE_MEASURE": "lat", "LONGITUDE_MEASURE": "lon"}).drop_duplicates("PWSID").set_index("PWSID")
    d.loc[(d.lon == 0) | d.lat.isna(), ["lat", "lon"]] = np.nan
    d["county"] = d.COUNTY.astype(str).str.upper().str.strip()
    return d[["lat", "lon", "county", "POPULATION", "SERVICE_CONNECTIONS"]]


def balltree(latlon):
    from sklearn.neighbors import BallTree
    return BallTree(np.radians(latlon), metric="haversine") if len(latlon) else None


def radius_count(tree, pts, km):
    if tree is None:                                  # no events at all in this window: the dataset does not cover it, so unknown
        return np.full(len(pts), np.nan)
    return tree.query_radius(pts, r=km / 6371.0, count_only=True)


def nearest_km(tree, pts, k=1):
    d, i = tree.query(pts, k=k)
    return d * 6371.0, i


# ---------------------------------------------------------------- as-of features
@lru_cache(maxsize=None)
def violations():
    v = pd.read_csv(X / "sdwis_violation.csv", low_memory=False, usecols=["pwsid", "violation_category_code", "is_health_based_ind", "contaminant_code",
                                                                       "compl_per_begin_date", "compl_per_end_date", "is_major_viol_ind", "violation_code"])
    # One-time paperwork deadline, not a water-quality change: 793 "health-based" treatment-technique violations began in Oct 2024 for
    # failing to submit the Lead and Copper Rule lead service-line inventory (contaminant 5200, code 2E). Counting them would swamp the signal.
    lsl = (pd.to_numeric(v.contaminant_code, errors="coerce") == 5200) & (v.violation_code.astype(str) == "2E")
    v.loc[lsl, "is_health_based_ind"] = "N"
    v["b"] = pd.to_datetime(v.compl_per_begin_date, errors="coerce")
    v["e"] = pd.to_datetime(v.compl_per_end_date, errors="coerce")
    return v.dropna(subset=["b"])


def violation_features(pw, cutoff):
    c = pd.Timestamp(cutoff)
    v = violations()
    v = v[v.b <= c]
    hb = v.is_health_based_ind == "Y"
    out = pd.DataFrame(index=pw)

    def cnt(mask, name):
        out[name] = v[mask].groupby("pwsid").size().reindex(pw).fillna(0).values

    for yrs in (1, 3, 5):
        w = v.b > c - pd.DateOffset(years=yrs)
        cnt(w, f"viol_{yrs}y")
        cnt(w & hb, f"viol_health_{yrs}y")
    w5 = v.b > c - pd.DateOffset(years=5)
    for cat in ("MCL", "MR", "TT", "MON", "RPT", "Other"):
        cnt(w5 & (v.violation_category_code == cat), f"viol_{cat.lower()}_5y")
    cnt(w5 & (v.is_major_viol_ind == "Y"), "viol_major_5y")
    cnt((v.e.isna() | (v.e > c)), "viol_unresolved")
    cnt(w5 & hb & (v.e.isna() | (v.e > c)), "viol_health_unresolved")
    out["viol_contaminants_5y"] = v[w5].groupby("pwsid").contaminant_code.nunique().reindex(pw).fillna(0).values
    last = v[hb].groupby("pwsid").b.max().reindex(pw)
    out["yrs_since_health_viol"] = ((c - last).dt.days / 365.25).fillna(30).values
    first = v.groupby("pwsid").b.min().reindex(pw)
    out["yrs_violation_history"] = ((c - first).dt.days / 365.25).fillna(0).values
    # trend: health violations in the last 2 years vs the 3 years before that
    recent = v[hb & (v.b > c - pd.DateOffset(years=2))].groupby("pwsid").size().reindex(pw).fillna(0)
    earlier = v[hb & (v.b <= c - pd.DateOffset(years=2)) & (v.b > c - pd.DateOffset(years=5))].groupby("pwsid").size().reindex(pw).fillna(0)
    out["viol_health_trend"] = (recent / 2 - earlier / 3).values
    return tag(out, "sdwis_violations")


@lru_cache(maxsize=None)
def enforcement():
    e = pd.read_csv(X / "sdwis_enforcement_action.csv", usecols=["pwsid", "enforcement_date", "enforcement_action_type_code"])
    e["d"] = pd.to_datetime(e.enforcement_date, errors="coerce")
    return e.dropna(subset=["d"])


def enforcement_features(pw, cutoff):
    c = pd.Timestamp(cutoff)
    e = enforcement()
    e = e[e.d <= c]
    out = pd.DataFrame(index=pw)
    for yrs in (1, 3):
        out[f"enf_{yrs}y"] = e[e.d > c - pd.DateOffset(years=yrs)].groupby("pwsid").size().reindex(pw).fillna(0).values
    out["enf_total"] = e.groupby("pwsid").size().reindex(pw).fillna(0).values
    formal = e.enforcement_action_type_code.astype(str).str.startswith(("SO", "CO", "FO", "AO"))     # orders and compliance agreements
    out["enf_formal_3y"] = e[formal & (e.d > c - pd.DateOffset(years=3))].groupby("pwsid").size().reindex(pw).fillna(0).values
    return tag(out, "sdwis_enforcement")


@lru_cache(maxsize=None)
def school_lead_df():
    s = pd.read_csv(X / "school_lead.csv", low_memory=False, usecols=["pws_id", "samp_date", "samp_loaded", "result", "action_level_exceedance"])
    s["d"] = pd.to_datetime(s.samp_date.astype("Int64").astype(str), format="%Y%m%d", errors="coerce")
    s["loaded"] = pd.to_datetime(pd.to_numeric(s.samp_loaded, errors="coerce").astype("Int64").astype(str), format="%Y%m%d", errors="coerce")
    return s.dropna(subset=["pws_id", "d", "loaded"])


def school_lead_features(pw, cutoff):
    s = school_lead_df()
    s = s[(s.d <= pd.Timestamp(cutoff)) & (s.loaded <= pd.Timestamp(cutoff))]
    g = s.groupby("pws_id")
    out = pd.DataFrame(index=pw)
    out["school_lead_samples"] = g.size().reindex(pw).fillna(0).values
    out["school_lead_exceed_share"] = (s.action_level_exceedance.astype(str).str.lower().eq("yes").groupby(s.pws_id).mean()).reindex(pw).values
    out["school_lead_max"] = g.result.max().reindex(pw).values
    return tag(out, "school_lead")


@lru_cache(maxsize=None)
def dry_wells_df():
    d = pd.read_csv(X / "dry_wells.csv", low_memory=False)
    d["d"] = pd.to_datetime(d["CREATE DATE"], errors="coerce")
    d["depth"] = num(d["Well Depth"])
    return d.dropna(subset=["d", "LATITUDE", "LONGITUDE"])


def dry_well_features(pw, cutoff):
    d = dry_wells_df()
    d = d[d.d <= pd.Timestamp(cutoff)]
    s = systems().reindex(pw)
    out = pd.DataFrame(index=pw)
    ok = s.lat.notna().values
    pts = np.radians(s.loc[ok, ["lat", "lon"]].values)
    for yrs in (2, 10):
        dd = d[d.d > pd.Timestamp(cutoff) - pd.DateOffset(years=yrs)]
        tree = balltree(dd[["LATITUDE", "LONGITUDE"]].values)
        for km in (10, 25):
            col = np.full(len(pw), np.nan); col[ok] = radius_count(tree, pts, km); out[f"dry_wells_{km}km_{yrs}y"] = col
    return tag(out, "dry_wells")


@lru_cache(maxsize=None)
def fires_df():
    f = pd.DataFrame(json.load(open(X / "nifc_fires.json")))
    f["d"] = pd.to_datetime(f.attr_FireDiscoveryDateTime, unit="ms", errors="coerce")
    return f.dropna(subset=["d", "attr_InitialLatitude", "attr_InitialLongitude"])


def fire_features(pw, cutoff):
    f = fires_df()
    c = pd.Timestamp(cutoff)
    f = f[(f.d <= c) & (f.d > c - pd.DateOffset(years=5))]
    if c < pd.Timestamp("2025-01-01"):                # the perimeter dataset starts in late 2019: earlier windows are incomplete
        f = f.iloc[0:0]
    s = systems().reindex(pw)
    ok = s.lat.notna().values
    pts = np.radians(s.loc[ok, ["lat", "lon"]].values)
    out = pd.DataFrame(index=pw)
    tree = balltree(f[["attr_InitialLatitude", "attr_InitialLongitude"]].values)
    for km in (15, 40):
        col = np.full(len(pw), np.nan); col[ok] = radius_count(tree, pts, km); out[f"fires_{km}km_5y"] = col
    return tag(out, "wildfire")


@lru_cache(maxsize=None)
def noaa(kind):
    rows = {}
    for line in open(X / f"noaa_{kind}.txt"):
        m = re.match(r"^(\d{2})(\d{3})(\d{2})(\d{4})\s+(.*)$", line.rstrip())
        if not m or m.group(1) != "04":
            continue
        vals = [float(x) for x in re.findall(r"-?\d+\.\d+|-?\d+", m.group(5))][:12]
        vals = [np.nan if (x < 0 if kind == "pcpncy" else x <= -90) else x for x in vals]
        rows[(int(m.group(2)), int(m.group(4)))] = vals + [np.nan] * (12 - len(vals))
    return rows


def county_fips():
    sv = pd.read_csv(X / "svi_2022.csv", low_memory=False, usecols=["COUNTY", "STCNTY"]).drop_duplicates()
    return {re.sub(r" COUNTY$", "", c.upper()): int(s) % 1000 for c, s in zip(sv.COUNTY, sv.STCNTY)}


def weather_features(pw, cutoff):
    c = pd.Timestamp(cutoff)
    fips = county_fips()
    cty = systems().reindex(pw).county.map(fips)
    out = pd.DataFrame(index=pw)
    for kind, name in (("pcpncy", "precip"), ("pdsicy", "pdsi"), ("tmpccy", "temp")):
        t = noaa(kind)
        vals12, anom = {}, {}
        for fp in set(cty.dropna().astype(int)):
            def window(end_year, end_month, n):
                seq = []
                y, m = end_year, end_month
                for _ in range(n):
                    seq.append(t.get((fp, y), [np.nan] * 12)[m - 1])
                    m -= 1
                    if m == 0:
                        y, m = y - 1, 12
                return np.array(seq)
            w12 = window(c.year, c.month - 1 if c.month > 1 else 12, 12) if c.month > 1 else window(c.year - 1, 12, 12)
            end = c - pd.DateOffset(months=1)
            w36 = window(end.year, end.month, 36)
            # A fixed 1991-2020 normal would expose later weather to pre-2021 cycles.
            normal_end = min(2020, c.year - 1)
            base = np.nanmean([np.nanmean(t.get((fp, y), [np.nan] * 12)) for y in range(1991, normal_end + 1)])
            vals12[fp] = (np.nanmean(w12), np.nanmin(w12), np.nanmean(w36), base)
        arr = cty.map(lambda f: vals12.get(int(f)) if pd.notna(f) else None)
        out[f"{name}_12m"] = [a[0] if a else np.nan for a in arr]
        out[f"{name}_36m"] = [a[2] if a else np.nan for a in arr]
        out[f"{name}_anom_12m"] = [(a[0] - a[3]) if a else np.nan for a in arr]
        if name == "pdsi":
            out["pdsi_min_12m"] = [a[1] if a else np.nan for a in arr]
    for c_ in out.columns:
        GROUPS[c_] = "noaa_" + c_.split("_")[0]
    return out


# ---------------------------------------------------------------- static features
@lru_cache(maxsize=None)
def tracts():
    z = zipfile.ZipFile(X / "census_gazetteer.zip")
    g = pd.read_csv(z.open(z.namelist()[0]), sep="\t")
    g.columns = [c.strip() for c in g.columns]
    g["GEOID"] = g.GEOID.astype(str).str.zfill(11)
    g = g[g.GEOID.str.startswith("06")]
    sv = pd.read_csv(X / "svi_2022.csv", low_memory=False)
    sv["GEOID"] = sv.FIPS.astype(str).str.zfill(11)
    cols = ["EP_POV150", "EP_UNEMP", "EP_HBURD", "EP_NOHSDP", "EP_UNINSUR", "EP_AGE65", "EP_AGE17", "EP_DISABL", "EP_SNGPNT", "EP_LIMENG", "EP_MINRTY",
            "EP_MUNIT", "EP_MOBILE", "EP_CROWD", "EP_NOVEH", "EP_NOINT", "RPL_THEMES", "E_TOTPOP", "AREA_SQMI"]
    sv = sv[["GEOID"] + cols].copy()
    for c in cols:
        sv.loc[sv[c] < 0, c] = np.nan
    ce = pd.read_csv(X / "calenviroscreen4.csv", low_memory=False)
    ce["GEOID"] = ce.tract.astype(int).astype(str).str.zfill(11)
    cecols = ["CIscoreP", "PollutionP", "PopCharP", "drinkP", "gwthreatsP", "leadP", "pestP", "pmP", "trafficP", "povP", "unempP", "housingBP", "lingP", "eduP"]
    ce = ce[["GEOID"] + cecols]
    for c in cecols:
        ce[c] = pd.to_numeric(ce[c], errors="coerce")
    t = g[["GEOID", "ALAND_SQMI", "INTPTLAT", g.columns[-1]]].rename(columns={g.columns[-1]: "INTPTLONG"})
    t = t.merge(sv, on="GEOID", how="left").merge(ce, on="GEOID", how="left")
    return t.dropna(subset=["INTPTLAT", "INTPTLONG"]).reset_index(drop=True), cols, cecols


def tract_features(pw):
    t, svc, cec = tracts()
    s = systems().reindex(pw)
    ok = s.lat.notna().values
    tree = balltree(t[["INTPTLAT", "INTPTLONG"]].values)
    d, idx = nearest_km(tree, np.radians(s.loc[ok, ["lat", "lon"]].values), k=3)
    sv_out, ce_out = pd.DataFrame(index=pw), pd.DataFrame(index=pw)
    for c in svc + ["ALAND_SQMI"]:
        vals = t[c].values[idx]
        col = np.full(len(pw), np.nan); col[ok] = np.nanmean(vals, axis=1); sv_out["svi_" + c.lower()] = col
    sv_out["svi_pop_density"] = sv_out["svi_e_totpop"] / sv_out["svi_area_sqmi"].replace(0, np.nan)
    col = np.full(len(pw), np.nan); col[ok] = d[:, 0]; sv_out["tract_dist_km"] = col
    for c in cec:
        vals = t[c].values[idx]
        col = np.full(len(pw), np.nan); col[ok] = np.nanmean(vals, axis=1); ce_out["ces_" + c.lower()] = col
    return tag(sv_out, "census_svi_gazetteer"), tag(ce_out, "calenviroscreen4")


def basin_features(pw):
    from shapely.geometry import Point, shape
    from shapely.strtree import STRtree
    b = json.load(open(X / "b118_basins.geojson"))
    polys = [shape(f["geometry"]) for f in b["features"]]
    nums = [f["properties"]["Basin_Subbasin_Number"] for f in b["features"]]
    tree = STRtree(polys)
    pr = pd.read_csv(X / "sgma_priority.csv", low_memory=False)
    keep = ["C1_Priority_Points", "C3_Priority_Points", "C4_Priority_Points", "C5_Priority_Points", "C7_Priority_Points", "C8c_CriticalOverdraft", "C6_Agricultural_Groundwater_Percent_Supply"]
    keep = [c for c in keep if c in pr.columns]
    pr = pr.set_index("Basin_Subbasin_Number")[keep]
    pr["C8c_CriticalOverdraft"] = pr["C8c_CriticalOverdraft"].astype(float)
    s = systems().reindex(pw)
    out = pd.DataFrame(index=pw, columns=["in_basin"] + ["sgma_" + c.lower() for c in keep], dtype=float)
    for i, (pid, r) in enumerate(s.iterrows()):
        if np.isnan(r.lat):
            continue
        hit = tree.query(Point(r.lon, r.lat), predicate="within")
        out.loc[pid, "in_basin"] = 1.0 if len(hit) else 0.0
        if len(hit) and nums[hit[0]] in pr.index:
            out.loc[pid, ["sgma_" + c.lower() for c in keep]] = pr.loc[nums[hit[0]], keep].values
    return tag(out.astype(float), "sgma_groundwater_basin")


def sdwis_static(pw):
    w = pd.read_csv(X / "sdwis_water_system.csv", low_memory=False).drop_duplicates("pwsid").set_index("pwsid")
    w = w.reindex(pw)
    out = pd.DataFrame(index=pw)
    out["src_groundwater"] = (w.gw_sw_code == "GW").astype(float).where(w.gw_sw_code.notna())
    out["owner_private"] = (w.owner_type_code == "P").astype(float).where(w.owner_type_code.notna())
    out["owner_local"] = (w.owner_type_code == "L").astype(float).where(w.owner_type_code.notna())
    out["is_wholesaler"] = (w.is_wholesaler_ind == "Y").astype(float).where(w.is_wholesaler_ind.notna())
    out["is_school_daycare"] = (w.is_school_or_daycare_ind == "Y").astype(float).where(w.is_school_or_daycare_ind.notna())
    out["is_ntnc"] = (w.pws_type_code == "NTNCWS").astype(float).where(w.pws_type_code.notna())
    sa = pd.read_csv(X / "sdwis_service_area.csv").drop_duplicates(["pwsid", "service_area_type_code"])
    for code, name in (("MH", "mobile_home"), ("RA", "residential"), ("SC", "school"), ("PA", "public_area"), ("IA", "industrial"), ("RS", "rural_service")):
        out["area_" + name] = pw.isin(sa[sa.service_area_type_code == code].pwsid).astype(float)
    return tag(out, "sdwis_system_attributes")


def facility_features(pw):
    f = pd.read_csv(X / "ddw_facilities.csv", low_memory=False)
    f = f.drop_duplicates("Water System No").set_index("Water System No").reindex(pw)
    out = pd.DataFrame(index=pw)
    for c, n in (("Number of Agricultural Service Connections (AG)", "ag"), ("Number of Commercial Service Connections (CM)", "commercial"),
                 ("Number of Institutional Service Connections (IN)", "institutional"), ("Number of Residential Service Connections (RS)", "residential")):
        out["conn_" + n] = f[c]
    tot = f["Total Number of Service Connections"].replace(0, np.nan)
    out["conn_residential_share"] = out["conn_residential"] / tot
    out["res_pop"] = f["Residential Population"]
    out["transient_pop_share"] = f["Transient Population"] / f["Total Population"].replace(0, np.nan)
    out["treat_operator_level"] = f["Treatment Plant Class CODE"].astype(str).str.extract(r"T(\d)")[0].astype(float).values
    out["dist_operator_level"] = f["Distribution System Class CODE"].astype(str).str.extract(r"D(\d)")[0].astype(float).values
    ss = pd.to_datetime(f["Date of Sanitary Survey visit (SNSV Visit Date)"], errors="coerce")
    out["yrs_since_sanitary_survey"] = (pd.Timestamp("2026-07-01") - ss).dt.days / 365.25
    return tag(out.drop(columns=[]), "ddw_facilities")


def rate_features(pw):
    r = pd.read_csv(X / "pws_rates.csv", low_memory=False, encoding="latin1")
    r = r.drop_duplicates("PWSID").set_index("PWSID").reindex(pw)
    out = pd.DataFrame(index=pw)
    for c, n in (("WR AVG Mon Res Cost 6 CCF", "bill_6ccf"), ("WR AVG Mon Res Cost 12 CCF", "bill_12ccf"), ("WR AVG Mon Res Cost 24 CCR", "bill_24ccf")):
        out["rate_" + n] = num(r[c])
    out["rate_tiers"] = num(r["WR Num Tiers"])
    out["rate_updated_year"] = pd.to_datetime(r["WR Rate Updated"], errors="coerce").dt.year
    return tag(out, "water_rates")


def shortage_features(pw):
    s = pd.read_csv(X / "small_system_shortage.csv", low_memory=False).drop_duplicates("PWSID").set_index("PWSID").reindex(pw)
    out = pd.DataFrame(index=pw)
    out["wsv_2024"] = pd.to_numeric(s["WSV_Scaled_2024"], errors="coerce")
    out["wsv_pct_max_2024"] = pd.to_numeric(s["WSV_PercentMax_2024"], errors="coerce")
    out["wsv_infra"] = pd.to_numeric(s["INFRA_SUBINDEX"], errors="coerce")
    for pre, name in (("rSC1", "climate"), ("rSC2", "hazard"), ("rSC3", "supply_redundancy"), ("rSC4", "operations"), ("rSC5", "shortage_history")):
        cols = [c for c in s.columns if c.startswith(pre)]
        out["wsv_" + name] = s[cols].apply(pd.to_numeric, errors="coerce").mean(axis=1)
    return tag(out, "dwr_shortage_vulnerability")


def lead_copper_features(pw):
    l = pd.read_csv(X / "sdwis_lcr_sample_result.csv", usecols=["pwsid", "contaminant_code", "sample_measure"])
    pb = l[l.contaminant_code == "PB90"].groupby("pwsid").sample_measure.max().reindex(pw)
    cu = l[l.contaminant_code == "CU90"].groupby("pwsid").sample_measure.max().reindex(pw)
    out = pd.DataFrame({"lcr_lead_90th": pb.values, "lcr_copper_90th": cu.values}, index=pw)
    return tag(out, "lead_copper_rule")


def infra_features(pw):
    """Distance to real canals/aqueducts, treatment plants and water towers (OpenStreetMap), and to larger neighbours."""
    inf = json.load(open(APP / "infrastructure.json"))
    s = systems().reindex(pw)
    ok = s.lat.notna().values
    pts = np.radians(s.loc[ok, ["lat", "lon"]].values)
    out = pd.DataFrame(index=pw)
    line_pts = np.array([(y, x) for l in inf["lines"] if l["k"] in ("canal", "aqueduct") for x, y in l["c"]])
    plants = np.array([(p["y"], p["x"]) for p in inf["sites"] if p["k"] == "plant"])
    for name, arr in (("canal", line_pts), ("plant", plants)):
        d, _ = nearest_km(balltree(arr), pts)
        col = np.full(len(pw), np.nan); col[ok] = d[:, 0]; out[f"dist_{name}_km"] = col
    allsys = systems().dropna(subset=["lat"])
    tree = balltree(allsys[["lat", "lon"]].values)
    for km in (5, 15):
        col = np.full(len(pw), np.nan); col[ok] = radius_count(tree, pts, km) - 1; out[f"neighbors_{km}km"] = col
    # nearest system at least 5x larger (a plausible consolidation partner)
    big = allsys[allsys.SERVICE_CONNECTIONS >= 5000]
    d, i = nearest_km(balltree(big[["lat", "lon"]].values), pts)
    col = np.full(len(pw), np.nan); col[ok] = d[:, 0]; out["dist_large_system_km"] = col
    return tag(out, "osm_infrastructure_and_neighbors")


@lru_cache(maxsize=None)
def dem():
    """Elevation from the AWS Terrain Tiles at zoom 9, stitched over California."""
    from PIL import Image
    z = 9
    n = 2 ** z
    def tile(lon, lat):
        s = np.sin(np.radians(lat)); return (lon + 180) / 360 * n, (0.5 - np.log((1 + s) / (1 - s)) / (4 * np.pi)) * n
    x0, y0 = tile(-124.8, 42.1); x1, y1 = tile(-114.0, 32.4)
    tx0, tx1, ty0, ty1 = int(x0), int(x1), int(y0), int(y1)
    cache = X / "dem_z9"
    cache.mkdir(exist_ok=True)
    mosaic = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256), dtype=np.float32)
    jobs = [(tx, ty) for tx in range(tx0, tx1 + 1) for ty in range(ty0, ty1 + 1)]
    procs = []
    for tx, ty in jobs:
        p = cache / f"{tx}_{ty}.png"
        if not p.exists():
            procs.append(subprocess.Popen(["curl", "-s", "-m", "60", "-o", str(p), f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{tx}/{ty}.png"]))
            if len(procs) >= 10:
                [q.wait() for q in procs]; procs = []
    [q.wait() for q in procs]
    for tx, ty in jobs:
        try:
            a = np.asarray(Image.open(cache / f"{tx}_{ty}.png").convert("RGB"), dtype=np.float32)
            mosaic[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
        except Exception:                                                   # noqa: BLE001  missing tile = sea level
            pass
    return mosaic, tx0, ty0, n


def terrain_features(pw):
    mosaic, tx0, ty0, n = dem()
    s = systems().reindex(pw)
    out = pd.DataFrame(index=pw, columns=["elev_m", "relief_3km_m", "slope_proxy"], dtype=float)
    for pid, r in s.iterrows():
        if np.isnan(r.lat):
            continue
        sn = np.sin(np.radians(r.lat))
        px = ((r.lon + 180) / 360 * n - tx0) * 256
        py = ((0.5 - np.log((1 + sn) / (1 - sn)) / (4 * np.pi)) * n - ty0) * 256
        ix, iy = int(px), int(py)
        if not (6 <= ix < mosaic.shape[1] - 6 and 6 <= iy < mosaic.shape[0] - 6):
            continue
        win = mosaic[iy - 5:iy + 6, ix - 5:ix + 6]
        out.loc[pid] = [mosaic[iy, ix], win.max() - win.min(), np.hypot(*np.gradient(win)).mean() / 300.0]
    return tag(out, "terrain_srtm")


def static_features(pw):
    pw = pd.Index(pw)
    sv, ce = tract_features(pw)
    parts = [sv, ce, basin_features(pw), sdwis_static(pw), facility_features(pw), rate_features(pw), shortage_features(pw), lead_copper_features(pw),
             infra_features(pw), terrain_features(pw)]
    return pd.concat(parts, axis=1)


def asof_features(pw, cutoff):
    pw = pd.Index(pw)
    parts = [violation_features(pw, cutoff), enforcement_features(pw, cutoff), school_lead_features(pw, cutoff), dry_well_features(pw, cutoff),
             fire_features(pw, cutoff), weather_features(pw, cutoff)]
    return pd.concat(parts, axis=1)


def historical_size_features(pw, cutoff):
    """Use the latest prior-year assessment; never fill missing history with current sizes.

    An assessment is conservatively eligible only in the following calendar year.
    This annual-vintage convention is not a verified per-file publication timestamp.
    """
    c = pd.Timestamp(cutoff)
    out = pd.DataFrame(np.nan, index=pd.Index(pw), columns=["lpop", "lconn"])
    archives = [(int(p.name[:4]), p) for p in RAW.glob("*affordability.xlsx")
                if re.fullmatch(r"\d{4}affordability\.xlsx", p.name) and int(p.name[:4]) < c.year]
    if not archives:
        return out
    _, path = max(archives)
    sizes = pd.read_excel(path, sheet_name="Affordability Assessment",
                          usecols=["PWSID", "Population", "Number of Service Connections"])
    sizes = sizes.drop_duplicates("PWSID").set_index("PWSID").reindex(out.index)
    for source, col in (("Population", "lpop"), ("Number of Service Connections", "lconn")):
        values = pd.to_numeric(sizes[source], errors="coerce")
        out[col] = np.log1p(values.where(values >= 0))
    return out


def historical_features(pw, cutoff):
    """Model-only path: no undated facility, lead/copper, demographic or infrastructure snapshots.

    Contemporary coordinates/county are used solely as fixed location proxies for historical events and terrain.
    """
    pw = pd.Index(pw)
    return pd.concat([asof_features(pw, cutoff), terrain_features(pw), historical_size_features(pw, cutoff)], axis=1)


def build(pw, cutoff, with_static=True):
    a = asof_features(pw, cutoff)
    return pd.concat([a, static_features(pw)], axis=1) if with_static else a


SOURCES_USED = ["sdwis_violations", "sdwis_enforcement", "sdwis_system_attributes", "ddw_facilities", "water_rates", "school_lead", "dwr_shortage_vulnerability",
                "dry_wells", "sgma_groundwater_basin", "census_svi_gazetteer", "calenviroscreen4", "noaa_precip", "noaa_pdsi", "noaa_temp", "wildfire",
                "osm_infrastructure_and_neighbors", "terrain_srtm", "lead_copper_rule"]


if __name__ == "__main__":
    import time
    t0 = time.time()
    s = systems()
    f = build(s.index[:400], "2025-07-01")
    print(f.shape, f"{time.time() - t0:.0f}s")
    print(f.isna().mean().sort_values(ascending=False).head(15).round(2).to_dict())
    print(sorted(set(GROUPS.values())))
