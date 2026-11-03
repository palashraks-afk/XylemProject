"""Build the Xylem dataset: join SAFER risk + affordability, model costs, optimize, stress-test, validate."""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import spearmanr, pearsonr, rankdata

sys.path.insert(0, str(Path(__file__).parent))
from costmodel import system_cost, TABLES  # noqa: E402
from optimizer import optimize, greedy_by_population  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "app" / "data"
OUT.mkdir(parents=True, exist_ok=True)

BUDGETS_M = [100, 250, 500, 1000, 2000]
N_SCEN = 200
SIGMA_SYS = float(np.log(2) / 1.645)  # state's own 0.5x-2x range convention read as a 90% interval
DEFAULTS = {"lambda_eq": 1.0, "at_risk_weight": 0.5, "small_reserve": 0.0}
rng = np.random.default_rng(20261102)


def load():
    d = pd.read_csv(RAW / "SAFER_RA.csv", encoding="utf-8-sig", low_memory=False)
    a = pd.read_excel(RAW / "2026affordability.xlsx", sheet_name="Affordability Assessment")
    a = a.rename(columns={"PWSID": "WATER_SYSTEM_NUMBER"})
    keep = ["WATER_SYSTEM_NUMBER", "Total Affordability Assessment Thresholds Met", "Poverty Prevalence",
            "Monthly Total Drinking Water Charges for 6 HCF (Avg. $70.86)"]
    a = a[keep].copy()
    a.columns = ["WATER_SYSTEM_NUMBER", "aff_thresholds", "poverty", "bill6hcf"]
    a["poverty"] = pd.to_numeric(a.poverty.astype(str).str.rstrip("%"), errors="coerce")
    a["bill6hcf"] = pd.to_numeric(a.bill6hcf.astype(str).str.replace("[$,]", "", regex=True), errors="coerce")
    a["aff_thresholds"] = pd.to_numeric(a.aff_thresholds, errors="coerce")
    d = d.merge(a, on="WATER_SYSTEM_NUMBER", how="left")
    d["county"] = d.COUNTY.str.replace(" County", "", case=False).str.strip().str.title()
    return d


def equity_components(d):
    ces_p = d.CALENVIRO_SCREEN_SCORE.rank(pct=True)
    pov_p = d.poverty.rank(pct=True)
    dac = d.SERVICE_AREA_ECONOMIC_STATUS.map({"SDAC": 1.0, "DAC": 0.67, "Non-DAC": 0.0})
    aff = (d.aff_thresholds / 3).clip(0, 1)
    return pd.DataFrame({"dac": dac, "ces": ces_p, "aff": aff, "pov": pov_p})


def benefit(pop, failing, eq, lam, ar_w):
    return pop * np.where(failing, 1.0, ar_w) * (1 + lam * eq)


def auc(score, y):
    rk = rankdata(score)
    n1, n0 = y.sum(), (~y).sum()
    return float((rk[y].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))


def main():
    d = load()
    comp = equity_components(d)
    d = pd.concat([d, comp.add_prefix("eq_")], axis=1)
    d["equity"] = comp.mean(axis=1, skipna=True)
    d["eq_n"] = comp.notna().sum(axis=1)

    ctx = d.groupby("FINAL_SAFER_STATUS").POPULATION.agg(["count", "sum"]).rename(columns={"sum": "pop"})

    s = d[d.FINAL_SAFER_STATUS.isin(["Failing", "At-Risk"])].copy().reset_index(drop=True)
    s["failing"] = s.FINAL_SAFER_STATUS.eq("Failing")
    s["conn"] = s.SERVICE_CONNECTIONS.clip(lower=1).astype(int)
    s["cost_raw"] = [system_cost(c, st) for c, st in zip(s.conn, s.FINAL_SAFER_STATUS)]

    # ---- calibration against the state's county totals (Table 9) ----
    off = TABLES["county_totals_musd"]
    g_raw = s.groupby("county").cost_raw.sum() / 1e6
    cal = pd.DataFrame([(c, sum(v), g_raw.get(c, 0.0)) for c, v in off.items()], columns=["county", "official", "raw"])
    state_off = TABLES["state_total_musd"]["total"]
    factor = float(state_off / (s.cost_raw.sum() / 1e6))
    cal["model"] = cal.raw * factor
    big = cal[(cal.official >= 10) & (cal.model > 0)]
    lr = np.log(big.official / big.model)
    calib = {
        "raw_total_musd": round(s.cost_raw.sum() / 1e6, 1),
        "official_total_musd": state_off,
        "scale_factor": round(factor, 4),
        "counties_compared": int(len(cal)),
        "spearman_county": round(float(spearmanr(cal.official, cal.model)[0]), 3),
        "pearson_county": round(float(pearsonr(cal.official, cal.model)[0]), 3),
        "log_ratio_sd_county": round(float(lr.std()), 3),
        "median_abs_pct_error_county_ge10M": round(float(np.median(np.abs(big.model / big.official - 1)) * 100), 1),
        "note": "Raw model overshoots the state total because our 2026 list has more systems than the state's 2024 list "
                "and Table 7 averages are not size-weighted; we scale to the state total and report the county-level fit.",
    }
    s["cost"] = (s.cost_raw * factor).round(0)
    s["cost_lo"] = (s.cost * 0.5).round(0)
    s["cost_hi"] = (s.cost * 2.0).round(0)
    county_logratio = (lr - lr.mean()).to_numpy()

    eq = s.equity.fillna(s.equity.median()).to_numpy()
    pops = s.POPULATION.to_numpy(float)
    failing = s.failing.to_numpy()
    conn = s.conn.to_numpy()
    costs = s.cost.to_numpy(float)
    dac_flag = (s.eq_dac.fillna(0).to_numpy() > 0)

    def run(costs_, lam, ar_w, budget, reserve=0.0):
        b = benefit(pops, failing, eq, lam, ar_w)
        return optimize(list(costs_), list(b), list(conn), budget, reserve)

    def summarize(ch):
        ch = np.array(ch, dtype=int)
        return {"systems": int(len(ch)), "people": int(pops[ch].sum()), "spent_musd": round(float(costs[ch].sum() / 1e6), 1),
                "dac_people": int(pops[ch][dac_flag[ch]].sum()), "small_systems": int((conn[ch] <= 500).sum())}

    comparison = []
    for B in BUDGETS_M:
        budget = B * 1e6
        opt = run(costs, DEFAULTS["lambda_eq"], DEFAULTS["at_risk_weight"], budget)
        base = greedy_by_population(list(costs), list(pops), list(failing), budget)
        comparison.append({"budget_musd": B, "optimizer": summarize(opt), "status_first_baseline": summarize(base)})

    # ---- Monte Carlo: cost error + weight uncertainty ----
    counties = s.county.to_numpy()
    uc = sorted(set(counties))
    cidx = np.array([uc.index(c) for c in counties])
    hits = {B: np.zeros(len(s)) for B in BUDGETS_M}
    for k in range(N_SCEN):
        cm = np.exp(rng.choice(county_logratio, size=len(uc)))[cidx]
        sm = np.exp(rng.normal(0, SIGMA_SYS, size=len(s)))
        mult = np.clip(cm * sm, 0.2, 5.0)
        lam = rng.uniform(0, 2)
        arw = rng.uniform(0.25, 0.75)
        for B in BUDGETS_M:
            hits[B][run(costs * mult, lam, arw, B * 1e6)] += 1
        if k % 50 == 0:
            print("MC", k, file=sys.stderr)
    fund_prob = {B: hits[B] / N_SCEN for B in BUDGETS_M}

    # ---- validation against funding already received since 2017 ----
    funded = (s.FUNDING_RECEIVED_SINCE_2017.fillna(0) > 0).to_numpy()
    b0 = benefit(pops, failing, eq, DEFAULTS["lambda_eq"], DEFAULTS["at_risk_weight"])
    validation = {
        "n_systems": int(len(s)),
        "n_funded_since_2017": int(funded.sum()),
        "auc_need_benefit_vs_funded": round(auc(b0, funded), 3),
        "auc_efficiency_vs_funded": round(auc(b0 / costs, funded), 3),
        "auc_population_vs_funded": round(auc(pops, funded), 3),
        "auc_failing_flag_vs_funded": round(auc(failing.astype(float), funded), 3),
        "funded_share_failing": round(float(funded[failing].mean()), 3),
        "funded_share_at_risk": round(float(funded[~failing].mean()), 3),
        "interpretation": "AUC 0.5 = no relationship. Funding since 2017 reflects need, readiness and politics, not cost-effectiveness; "
                          "this asks whether our ranking points at systems the state also chose to fund. A sanity check, not proof.",
    }

    cty = s.groupby("county").agg(systems=("conn", "size"), failing=("failing", "sum"), people=("POPULATION", "sum"),
                                  cost_musd=("cost", lambda x: round(x.sum() / 1e6, 1))).reset_index()
    cty = cty.merge(cal[["county", "official"]], on="county", how="left").rename(columns={"official": "official_musd"})
    cty["failing"] = cty.failing.astype(int)

    def rr(x, n=3):
        return None if pd.isna(x) else round(float(x), n)

    systems = []
    for i, row in s.iterrows():
        systems.append({
            "id": row.WATER_SYSTEM_NUMBER, "name": row.SYSTEM_NAME.title(), "county": row.county,
            "lat": rr(row.LATITUDE_MEASURE, 4), "lon": rr(row.LONGITUDE_MEASURE, 4),
            "pop": int(row.POPULATION), "conn": int(row.conn), "failing": bool(row.failing),
            "dac": row.SERVICE_AREA_ECONOMIC_STATUS if isinstance(row.SERVICE_AREA_ECONOMIC_STATUS, str) else "Missing",
            "eq": [rr(row.eq_dac, 2), rr(row.eq_ces, 2), rr(row.eq_aff, 2), rr(row.eq_pov, 2)],
            "cost": int(row.cost), "lo": int(row.cost_lo), "hi": int(row.cost_hi),
            "p": [round(float(fund_prob[B][i]), 2) for B in BUDGETS_M],
            "funded17": bool(funded[i]),
            "analytes": (row.PRIMARY_ANALYTES if isinstance(row.PRIMARY_ANALYTES, str) else "")[:80],
            "bill": rr(row.bill6hcf, 0),
        })
    (OUT / "systems.json").write_text(json.dumps(systems, separators=(",", ":")))

    summary = {
        "snapshot": str(d.CREATED_DATE.iloc[0]),
        "all_systems": int(len(d)),
        "status_counts": {k: {"systems": int(v["count"]), "people": int(v["pop"])} for k, v in ctx.iterrows()},
        "failing_at_risk_people": int(pops.sum()),
        "dac_share_people": round(float(pops[dac_flag].sum() / pops.sum()), 3),
        "missing_economic_status_systems": int((d.SERVICE_AREA_ECONOMIC_STATUS == "Miss/Indet").sum()),
        "missing_economic_status_in_target": int((s.SERVICE_AREA_ECONOMIC_STATUS == "Miss/Indet").sum()),
        "budgets_musd": BUDGETS_M, "defaults": DEFAULTS, "n_scenarios": N_SCEN, "sigma_system": round(SIGMA_SYS, 3),
        "calibration": calib, "comparison": comparison, "validation": validation,
        "county": cty.to_dict("records"),
        "total_modelled_cost_musd": round(float(costs.sum() / 1e6), 1),
        "cost_assumption_note": TABLES["per_connection_usd"]["_note"],
    }
    (OUT / "summary.json").write_text(json.dumps(summary, indent=1, default=str))
    s[["WATER_SYSTEM_NUMBER", "SYSTEM_NAME", "county", "FINAL_SAFER_STATUS", "POPULATION", "conn", "cost"]].to_csv(
        ROOT / "data" / "ranked_systems.csv", index=False)
    print(json.dumps({"calibration": calib, "validation": validation, "comparison": comparison}, indent=1, default=str))


if __name__ == "__main__":
    main()
