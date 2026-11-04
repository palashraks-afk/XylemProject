"""Failure forecast: which not-yet-Failing systems become Failing by the next annual snapshot?

Strictly temporal evaluation. Train on 2024 -> 2025 transitions, test on 2025 -> 2026. Baselines are what a
reviewer would already use: the system's SAFER status, its total risk score, and whether it was ever on the Failing list.
A final model trained on both transitions scores the 2026 systems for the app.
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

import model_zoo
import violation_model as vm
from model_selection import STACK, CORE
from scipy.stats import rankdata
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, average_precision_score, brier_score_loss
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "app" / "data"
STATUS_ORD = {"Not At-Risk": 0, "Potentially At-Risk": 1, "At-Risk": 2, "Failing": 3}
SEED = 7


def num(s):
    return pd.to_numeric(s, errors="coerce")


def features(year):
    f = RAW / f"{year}risk.xlsx"
    s = pd.read_excel(f, sheet_name="Risk Assess. Results Summary")
    s.columns = [str(c).strip().replace("\n", " ") for c in s.columns]
    keep = {"PWSID": "PWSID", "Service Connections": "conn", "Population": "pop", "Water Quality Category Score": "wq",
            "Accessibility Category Score": "acc", "Affordability Category Score": "aff", "TMF Capacity Category Score": "tmf",
            "Total Risk Assessment Score": "total", "Automatically At-Risk": "auto"}
    s = s[[c for c in keep if c in s.columns]].rename(columns=keep)
    for c in ["conn", "pop", "wq", "acc", "aff", "tmf", "total"]:
        s[c] = num(s[c])
    s["auto"] = (s["auto"].astype(str).str.strip().isin(["--", "nan", ""])).map({True: 0, False: 1})
    u = pd.read_excel(f, sheet_name="Calculated Underlying Data", header=1)
    u.columns = ["PWSID"] + [f"ind{i}" for i in range(1, u.shape[1])]
    for c in u.columns[1:]:
        col = u[c]
        if col.astype(str).str.fullmatch(r"[YN]{2}").any():           # E. coli history codes: count of Y
            u[c] = col.astype(str).str.count("Y")
        elif col.astype(str).isin(["Y", "N"]).sum() > 0.5 * len(u):
            u[c] = col.map({"Y": 1, "N": 0})
        else:
            u[c] = num(col)
    d = s.merge(u, on="PWSID", how="left").drop_duplicates("PWSID")
    d["lconn"] = np.log1p(d.conn)
    d["lpop"] = np.log1p(d["pop"])
    return d


def status(year):
    if year == 2026:
        d = pd.read_csv(RAW / "SAFER_RA.csv", encoding="utf-8-sig", low_memory=False)
        return d.set_index("WATER_SYSTEM_NUMBER").FINAL_SAFER_STATUS, d.set_index("WATER_SYSTEM_NUMBER").SERVICE_AREA_ECONOMIC_STATUS
    f = RAW / f"{year}affordability.xlsx"
    a = pd.read_excel(f, sheet_name="Affordability Assessment")
    col = [c for c in a.columns if "SAFER" in str(c)][0]
    a = a.drop_duplicates("PWSID").set_index("PWSID")
    return a[col], a["Disadvantaged Community Status"]


_COORDS = None


def coords():
    global _COORDS
    if _COORDS is None:
        d = pd.read_csv(RAW / "SAFER_RA.csv", encoding="utf-8-sig", low_memory=False).set_index("WATER_SYSTEM_NUMBER")
        d = d[(d.LONGITUDE_MEASURE != 0) & d.LATITUDE_MEASURE.notna()]
        _COORDS = d[["LATITUDE_MEASURE", "LONGITUDE_MEASURE"]]
    return _COORDS


def add_spatial(x, s_year):
    """Spatial-lag features: Failing neighbours within 10 km and 25 km in the same snapshot year (excluding the system itself)."""
    from sklearn.neighbors import BallTree
    c = coords()
    fail = s_year[s_year == "Failing"].index.intersection(c.index)
    if len(fail) == 0:
        return x
    tree = BallTree(np.radians(c.loc[fail].values), metric="haversine")
    ids = x.index.intersection(c.index)
    pts = np.radians(c.loc[ids].values)
    for km, name in ((10, "nf10"), (25, "nf25")):
        cnt = tree.query_radius(pts, r=km / 6371.0, count_only=True)
        own = ids.isin(fail).astype(int)            # a Failing system would count itself; none here, but stay safe
        x.loc[ids, name] = cnt - own
    return x


def panel(y0, y1):
    """Systems not Failing in y0 with a known y1 status; label = Failing in y1."""
    x = features(y0)
    s0, dac0 = status(y0)
    s1, _ = status(y1)
    x = x.set_index("PWSID")
    if SPATIAL:
        x = add_spatial(x, s0)
    x["status0"] = s0.map(STATUS_ORD)
    x["dac"] = dac0.map({"SDAC": 2, "DAC": 1, "Non-DAC": 0})
    if STAGE1:
        add_stage1(x, y0)
    x["s1"] = s1
    x = x[x.status0.notna() & (x.status0 < 3) & x.s1.isin(list(STATUS_ORD))]
    x["y"] = (x.s1 == "Failing").astype(int)
    return x


SPATIAL = "--no-spatial" not in sys.argv
STAGE1 = "--no-stage1" not in sys.argv
_STAGE1 = {}


def stage1(year, target="hbv"):
    if (year, target) not in _STAGE1:
        _STAGE1[(year, target)] = vm.predict_for_cycle(year, target=target)[0]
    return _STAGE1[(year, target)]


STAGE1_COLS = (("hbv", "p_hbv"), ("any", "p_any"), ("monrep", "p_monrep"), ("mcl", "p_mcl"))


def add_stage1(x, year):
    """Chances of a new health-based / any / monitoring-and-reporting / MCL violation in the next 12 months (stage 1, trained on earlier cycles only), and their logits."""
    for t, col in STAGE1_COLS:
        x[col] = stage1(year, t).reindex(x.index)
        pr = x[col].clip(1e-4, 1 - 1e-4)
        x["l" + col[1:]] = np.log(pr / (1 - pr))


def Xy(x):
    cols = [c for c in x.columns if c not in ("y", "s1", "pop", "conn")]
    return x[cols], x["y"].values


class Subset:
    """A fitted model that sees only some of the columns (the stage-2 candidates differ in which features they use)."""
    def __init__(self, model, cols):
        self.model, self.cols = model, cols

    def predict_proba(self, X):
        return self.model.predict_proba(X[self.cols])


def fit_family(family, X, y):
    kind, cfg, feats = model_zoo.stage2_config(family)
    cols = [c for c in CORE if c in X.columns] if feats == "core" else [c for c in STACK if c in X.columns] if feats == "stack" else list(X.columns)
    if not cols or (feats == "stack" and len(cols) < len(STACK)):
        return None                                          # e.g. the run without stage-1 forecasts has no stack inputs
    return Subset(model_zoo.make(kind, **cfg).fit(X[cols], y), cols)


FAMILIES = {"logistic": "lr", "gradient_boosting": "hgb", "random_forest": "rf", "extra_trees": "et", "stacked_logistic": "stack"}
# the older helper names stay for scripts that import them
lr_model = lambda: model_zoo.make("lr", C=0.3)    # noqa: E731
gb_model = lambda: model_zoo.make("hgb", max_depth=3, learning_rate=0.05, max_iter=200, min_samples_leaf=15, l2_regularization=1.0)    # noqa: E731
rf_model = lambda: model_zoo.make("rf", min_samples_leaf=8, max_features=0.4)    # noqa: E731
rank01 = model_zoo.rank01


def boot_auc(y, p, n=400):
    rng = np.random.default_rng(SEED)
    vals = []
    for _ in range(n):
        i = rng.integers(0, len(y), len(y))
        if y[i].sum() in (0, len(i)):
            continue
        vals.append(roc_auc_score(y[i], p[i]))
    return [round(float(np.percentile(vals, 2.5)), 3), round(float(np.percentile(vals, 97.5)), 3)]


def recall_at(y, p, frac):
    k = max(1, int(len(y) * frac))
    return round(float(y[np.argsort(-p)[:k]].sum() / max(1, y.sum())), 3)


def evaluate(train, test):
    Xtr, ytr = Xy(train)
    Xte, yte = Xy(test)
    cols = Xtr.columns
    Xte = Xte[cols]
    res = {"train_n": int(len(ytr)), "train_positives": int(ytr.sum()), "test_n": int(len(yte)), "test_positives": int(yte.sum()),
           "test_base_rate": round(float(yte.mean()), 4)}
    base = {
        "status_only": Xte["status0"].values.astype(float),
        "total_risk_score": Xte["total"].fillna(0).values,
        "past_failing_flag": Xte["ind4"].fillna(0).values,
    }
    models = {name: fit_family(fam, Xtr, ytr) for name, fam in FAMILIES.items()}
    models = {k: v for k, v in models.items() if v is not None}
    out = {}
    for name, p in base.items():
        out[name] = {"auc": round(float(roc_auc_score(yte, p)), 3), "auc_ci95": boot_auc(yte, p), "recall_top10pct": recall_at(yte, p, 0.10)}
    probs = {}
    for name, m in models.items():
        p = m.predict_proba(Xte)[:, 1]
        probs[name] = p
        out[name] = {"auc": round(float(roc_auc_score(yte, p)), 3), "auc_ci95": boot_auc(yte, p),
                     "avg_precision": round(float(average_precision_score(yte, p)), 3), "recall_top10pct": recall_at(yte, p, 0.10),
                     "brier": round(float(brier_score_loss(yte, p)), 4)}
    # Ensemble chosen in advance for robustness, not for its test score: equal-weight rank average of the models.
    pe = np.mean([rank01(p) for p in probs.values()], axis=0)
    probs["ensemble"] = pe
    out["ensemble"] = {"auc": round(float(roc_auc_score(yte, pe)), 3), "auc_ci95": boot_auc(yte, pe),
                       "avg_precision": round(float(average_precision_score(yte, pe)), 3), "recall_top10pct": recall_at(yte, pe, 0.10)}
    res["models"] = out
    qe = pd.qcut(pd.Series(pe).rank(method="first"), 5, labels=False)
    res["calibration_ensemble"] = [{"quintile": int(k) + 1, "n": int((qe == k).sum()), "observed_rate": round(float(yte[(qe == k).values].mean()), 4)} for k in range(5)]
    # calibration of the gradient-boosting probabilities on the held-out year, by risk quintile
    q = pd.qcut(pd.Series(probs["gradient_boosting"]).rank(method="first"), 5, labels=False)
    res["calibration_gb"] = [{"quintile": int(k) + 1, "n": int((q == k).sum()),
                              "mean_predicted": round(float(probs["gradient_boosting"][q == k].mean()), 4),
                              "observed_rate": round(float(yte[(q == k).values].mean()), 4)} for k in range(5)]
    return res, models, probs


def main():
    tr = panel(2024, 2025)
    te = panel(2025, 2026)
    res, models, probs = evaluate(tr, te)
    global SPATIAL
    SPATIAL = False
    r0, _, _ = evaluate(panel(2024, 2025), panel(2025, 2026))
    SPATIAL = True
    res["spatial_ablation"] = {"gb_auc_without_spatial": r0["models"]["gradient_boosting"]["auc"],
                               "gb_auc_with_spatial": res["models"]["gradient_boosting"]["auc"],
                               "note": "Failing-neighbour counts within 10 and 25 km added essentially nothing."}
    # what the extra public data bought: the same backtest without the stage-1 violation forecast
    global STAGE1
    STAGE1 = False
    r_base, _, _ = evaluate(panel(2024, 2025), panel(2025, 2026))
    STAGE1 = True
    res["without_stage1"] = {k: r_base["models"][k] for k in ("logistic", "gradient_boosting", "random_forest", "ensemble")}
    res["stage1_failing_onset_auc"] = round(float(roc_auc_score(te.y.values, te["p_hbv"].fillna(0).values)), 3)
    sel = model_zoo.selection()
    if sel:                                       # the comparison tables the app shows (data/model_selection.json, written by model_selection.py)
        res["model_selection"] = {
            "stage1": {"chosen": sel["stage1"]["chosen"], "n_rows": sel["stage1"]["n_rows"], "n_features": sel["stage1"]["n_features"], "calibration": sel["stage1"]["calibration"],
                       "baseline_violation_count_test_auc": sel["stage1"]["baseline_violation_count_test_auc"],
                       "candidates": [{"name": c["name"], "family": c["family"], "val": c["val"], "test": c["test"]} for c in sel["stage1"]["candidates"]]},
            "stage2": {"chosen": sel["stage2"]["chosen"], "baselines": sel["stage2"]["baselines"], "ensemble": sel["stage2"]["ensemble"],
                       "candidates": [{"name": c["name"], "family": c["family"], "cv": c["cv"], "test": c["test"]} for c in sel["stage2"]["candidates"]]}}
    res["stage1_model"] = vm.evaluate()
    res["source_value"] = vm.source_value()
    src = ROOT / "data" / "extra_sources.json"
    if src.exists():
        res["sources"] = [{k: s.get(k) for k in ("name", "desc", "owner", "ok")} for s in json.loads(src.read_text())["sources"]]
    print(json.dumps(res, indent=1))
    # empirical rates: how often does each status become Failing next year (test transition)
    res["observed_failing_rate_by_status"] = {k: round(float(te[te.status0 == v].y.mean()), 4)
                                              for k, v in STATUS_ORD.items() if v < 3}
    res["observed_failing_rate_by_status_n"] = {k: int((te.status0 == v).sum()) for k, v in STATUS_ORD.items() if v < 3}

    # final model on both transitions, applied to 2026 systems
    both = pd.concat([tr, te])
    Xb, yb = Xy(both)
    cols = Xb.columns
    finals = {k: v for k, v in ((n, fit_family(f, Xb, yb)) for n, f in FAMILIES.items()) if v is not None}
    f26 = features(2026).set_index("PWSID")
    s26, dac26 = status(2026)
    if SPATIAL:
        f26 = add_spatial(f26, s26)
    f26["status0"] = s26.reindex(f26.index).map(STATUS_ORD)
    f26["dac"] = dac26.reindex(f26.index).map({"SDAC": 2, "DAC": 1, "Non-DAC": 0})
    if STAGE1:
        add_stage1(f26, 2026)
    cur = f26[f26.status0.notna() & (f26.status0 < 3)]
    # each model's probabilities are rescaled to the observed onset rate, then averaged, so values read as probabilities
    rate = float(yb.mean())
    parts = []
    for m in finals.values():
        q = m.predict_proba(cur[cols])[:, 1]
        parts.append(q * rate / max(1e-9, float(np.mean(q))))
    p = np.mean(parts, axis=0)
    forecast = {pid: round(float(min(0.95, v)), 4) for pid, v in zip(cur.index, p)}
    res["final_model_note"] = (f"Final model trained on {len(yb)} system-years ({int(yb.sum())} failing onsets), average of logistic, gradient "
                               f"boosting and random forest, each rescaled so the mean forecast equals the observed onset rate ({rate:.3f}).")
    OUT.mkdir(parents=True, exist_ok=True)
    p_viol = stage1(2026) if STAGE1 else pd.Series(dtype=float)
    (OUT / "forecast.json").write_text(json.dumps({"metrics": res, "p_fail": forecast, "p_violation": {k: round(float(v), 4) for k, v in p_viol.items() if k in forecast}}, separators=(",", ":")))
    print("scored", len(forecast), "systems; mean p", round(float(np.mean(list(forecast.values()))), 4))


if __name__ == "__main__":
    main()
