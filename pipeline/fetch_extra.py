"""Download the extra public datasets that feed the richer forecast and placement models.

Every source is public and keyless. Files land in data/raw/extra/ (not committed); data/extra_sources.json records what each
source is, where it came from, and whether the download worked, so a failed source is visible instead of silently missing.
curl does the transfers because the system Python's TLS stack is too old for several of these hosts."""
import json
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "extra"
MANIFEST = ROOT / "data" / "extra_sources.json"
UA = "XylemProject/1.0 (student water research project)"
EF = "https://data.epa.gov/efservice"
CA_DATA = "https://publish.data.ca.gov/dataset"
CNRA = "https://data.cnra.ca.gov/dataset"


def curl(url, dest, timeout=600, extra=()):
    dest.parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(["curl", "-sL", "--retry", "2", "-m", str(timeout), "-A", UA, *extra, "-o", str(dest), "-w", "%{http_code}", url],
                       capture_output=True, text=True)
    return r.stdout.strip()


def get_text(url, timeout=120, extra=()):
    r = subprocess.run(["curl", "-sL", "--retry", "2", "-m", str(timeout), "-A", UA, *extra, url], capture_output=True, text=True)
    return r.stdout


def simple(name, desc, url, fname, owner):
    def run():
        code = curl(url, RAW / fname)
        ok = code == "200" and (RAW / fname).stat().st_size > 200
        return {"name": name, "desc": desc, "owner": owner, "url": url, "file": fname, "ok": ok, "bytes": (RAW / fname).stat().st_size if (RAW / fname).exists() else 0}
    return run


def envirofacts(table, desc, step=10000):
    """Page through an EPA SDWIS table for every California system (PWSID begins with CA)."""
    def run():
        base = f"{EF}/{table}/PWSID/BEGINNING/CA"
        try:
            n = json.loads(get_text(base + "/COUNT/JSON"))[0]["TOTALQUERYRESULTS"]
        except Exception:                                                  # noqa: BLE001
            return {"name": f"sdwis_{table.lower()}", "desc": desc, "owner": "US EPA SDWIS (Envirofacts)", "url": base, "ok": False}
        out = RAW / f"sdwis_{table.lower()}.csv"
        out.parent.mkdir(parents=True, exist_ok=True)
        rows, header = 0, None
        with out.open("w") as f:
            for a in range(0, n, step):
                txt = get_text(f"{base}/rows/{a}:{min(n, a + step) - 1}/CSV", timeout=300)
                lines = txt.splitlines()
                if not lines:
                    continue
                if header is None:
                    header = lines[0]; f.write(header + "\n")
                f.write("\n".join(lines[1:]) + "\n"); rows += len(lines) - 1
        return {"name": f"sdwis_{table.lower()}", "desc": desc, "owner": "US EPA SDWIS (Envirofacts)", "url": base, "file": out.name, "ok": rows > 0.9 * n, "rows": rows, "expected_rows": n}
    return run


def nifc_fires():
    """CAL FIRE / NIFC interagency fire perimeters: one row per fire with the ignition point, date and size."""
    def run():
        base = "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters/FeatureServer/0/query"
        feats, off = [], 0
        while True:
            q = f"{base}?where=attr_POOState%3D%27US-CA%27&outFields=attr_IncidentName,attr_FireDiscoveryDateTime,poly_GISAcres,attr_InitialLatitude,attr_InitialLongitude,attr_IncidentTypeCategory&returnGeometry=false&resultOffset={off}&resultRecordCount=2000&f=json"
            try:
                d = json.loads(get_text(q))
            except ValueError:
                break
            fs = d.get("features", [])
            feats += [x["attributes"] for x in fs]
            if len(fs) < 2000:
                break
            off += 2000
        (RAW / "nifc_fires.json").write_text(json.dumps(feats))
        return {"name": "nifc_fires", "desc": "Wildfire perimeters (ignition point, date, acres), California", "owner": "NIFC / CAL FIRE (WFIGS)", "url": base,
                "file": "nifc_fires.json", "ok": len(feats) > 500, "rows": len(feats)}
    return run


def noaa_climdiv():
    """NOAA nClimDiv county-level monthly precipitation and Palmer Drought Severity Index."""
    def run():
        res = []
        listing = get_text("https://www.ncei.noaa.gov/pub/data/cirs/climdiv/")
        for kind, desc in (("pcpncy", "County monthly precipitation"), ("pdsicy", "County monthly Palmer Drought Severity Index"), ("tmpccy", "County monthly mean temperature")):
            m = re.findall(rf'href="(climdiv-{kind}-v[\d.]+-\d+)"', listing)
            if not m:
                res.append({"name": f"noaa_{kind}", "desc": desc, "owner": "NOAA NCEI nClimDiv", "ok": False}); continue
            url = "https://www.ncei.noaa.gov/pub/data/cirs/climdiv/" + sorted(m)[-1]
            code = curl(url, RAW / f"noaa_{kind}.txt")
            res.append({"name": f"noaa_{kind}", "desc": desc, "owner": "NOAA NCEI nClimDiv", "url": url, "file": f"noaa_{kind}.txt", "ok": code == "200" and (RAW / f"noaa_{kind}.txt").stat().st_size > 1000})
        return res
    return run


def b118():
    def run():
        url = "https://gis.water.ca.gov/arcgis/rest/services/Geoscientific/i08_B118_CA_GroundwaterBasins/FeatureServer/0/query?where=1%3D1&outFields=*&f=geojson"
        code = curl(url, RAW / "b118_basins.geojson")
        return {"name": "b118_basins", "desc": "DWR Bulletin 118 groundwater basin polygons", "owner": "CA DWR", "url": url, "file": "b118_basins.geojson", "ok": code == "200" and (RAW / "b118_basins.geojson").stat().st_size > 10000}
    return run


def tasks():
    return [
        envirofacts("VIOLATION", "Dated drinking-water violations (health-based, monitoring, reporting) for every California system"),
        envirofacts("ENFORCEMENT_ACTION", "Dated enforcement actions against California systems"),
        envirofacts("WATER_SYSTEM", "System attributes: groundwater vs surface source, owner type, wholesaler, type"),
        envirofacts("LCR_SAMPLE_RESULT", "Lead and copper sample results"),
        envirofacts("SERVICE_AREA", "Service area types (residential, school, mobile home, etc.)"),
        envirofacts("GEOGRAPHIC_AREA", "Counties and cities served"),
        simple("ddw_facilities", "State Drinking Water Watch facility list: wells, intakes, treatment plants, storage per system", f"{CA_DATA}/d6d3beac-6735-4127-9324-4e70f61698d9/resource/5af27515-f0da-4cc9-92c5-0cd8eeee6843/download/drinking-water-watch-public-water-system-facilities2.csv", "ddw_facilities.csv", "CA State Water Board DDW"),
        simple("pws_rates", "Water rates reported by systems (2014-15 annual report)", f"{CA_DATA}/c71eec54-d8bf-4650-ba42-9092a2a3cf10/resource/469dae87-52cc-4c82-831c-9fe520a0f6c0/download/drinking-water-pws-water-rates-2014-15.csv", "pws_rates.csv", "CA State Water Board"),
        simple("school_lead", "Lead sampling results at California schools, by water system", f"{CA_DATA}/837e39e9-03e9-4b09-adc0-10d3368b7ec7/resource/5ebb2d68-1186-4937-acaf-8564c9a01ed6/download/monthly_posting_final.csv", "school_lead.csv", "CA State Water Board"),
        simple("water_loss_audits", "Real water loss audits (urban suppliers)", f"{CA_DATA}/d3d441c4-2c9e-4bd6-8e85-77214e728959/resource/5ba2426e-744a-46e7-8632-961dbeec0112/download/audit_data_wl.csv", "water_loss_audits.csv", "CA DWR / State Water Board"),
        simple("small_system_shortage", "DWR water shortage vulnerability scores for small water systems", "https://gis.data.cnra.ca.gov/api/download/v1/items/7090c3f1620f42a2b91d4c3ae7eb173f/csv?layers=0", "small_system_shortage.csv", "CA DWR"),
        simple("small_supplier_risk", "Drought and water shortage risk scores, small suppliers", f"{CNRA}/fb6e8009-141c-4f92-8962-6f5cdfa5d794/resource/bcf7cd12-15ae-4beb-b537-4a98a195d354/download/compall_sws0100120.xlsx", "small_supplier_risk.xlsx", "CA DWR"),
        simple("dry_wells", "Household dry-well and water shortage reports (location, date, well depth, repair cost)", f"{CNRA}/2cf184d1-2d34-46cc-8bb0-1dec86b6caf6/resource/e1fd9f48-a613-4567-8042-3d2e064d77c8/download/householdwatersupplyshortagereportingsystemdata.csv", "dry_wells.csv", "CA DWR"),
        simple("sgma_priority", "SGMA 2019 groundwater basin prioritization scores", f"{CNRA}/13ebd2d3-4e62-4fee-9342-d7c3ef3e0079/resource/7bfe794b-b64e-46ee-9d7f-2ca9593cfee2/download/sgma_2019_basin_prioritization_dashboard_data.csv", "sgma_priority.csv", "CA DWR"),
        simple("sgma_public_wells", "Public supply wells per groundwater basin (SGMA component 3)", f"{CNRA}/13ebd2d3-4e62-4fee-9342-d7c3ef3e0079/resource/cf77c5f6-7b30-4d5f-862c-12bcd94df423/download/component_3_public_supply_wells.csv", "sgma_public_wells.csv", "CA DWR"),
        b118(),
        simple("svi_2022", "CDC/ATSDR Social Vulnerability Index 2022, California tracts (Census ACS: poverty, income, housing, language, age)", "https://svi.cdc.gov/Documents/Data/2022/csv/states/California.csv", "svi_2022.csv", "CDC/ATSDR"),
        simple("census_gazetteer", "Census 2023 tract gazetteer (centroids, land area)", "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_Gaz_tracts_national.zip", "census_gazetteer.zip", "US Census Bureau"),
        simple("calenviroscreen4", "CalEnviroScreen 4.0 tract scores: pollution burden, groundwater threats, drinking water contaminants", "https://gis.data.ca.gov/api/download/v1/items/b6e0a01c423b489f8d98af641445da28/csv?layers=0", "calenviroscreen4.csv", "CA OEHHA"),
        noaa_climdiv(),
        nifc_fires(),
    ]


def main(only=None):
    RAW.mkdir(parents=True, exist_ok=True)
    jobs = tasks()
    out = []
    t0 = time.time()
    with ThreadPoolExecutor(6) as ex:
        for r in ex.map(lambda f: f(), jobs):
            for x in (r if isinstance(r, list) else [r]):
                out.append(x); print(("OK  " if x.get("ok") else "FAIL"), x["name"], x.get("rows", x.get("bytes", "")), flush=True)
    MANIFEST.write_text(json.dumps({"fetched": time.strftime("%Y-%m-%d"), "sources": out}, indent=1))
    print(f"{sum(1 for x in out if x.get('ok'))}/{len(out)} sources downloaded in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
