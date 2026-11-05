"""Forecast experiments on the population the app scores (At-Risk systems), base features only (no extra datasets).
Run from the repo root: python pipeline/experiments/at_risk_lag_and_subset.py. Results are in AUDIT.md rows 1-4."""
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
import sys, json
sys.argv = [sys.argv[0], "--no-stage1"]        # base features only: the extra datasets are not on this machine
sys.path.insert(0, str(ROOT / "pipeline"))
import numpy as np, pandas as pd
from sklearn.metrics import roc_auc_score
import ml

ORD = ml.STATUS_ORD


def lag_status(y0):
    if y0 == 2024:
        a = pd.read_excel(str(ROOT / "data" / "raw" / "2023affordability.xlsx"), sheet_name="Affordability Assessment").drop_duplicates("PWSID").set_index("PWSID")
        s = a["SAFER Status (1.1.2023)"].replace({"HR2W": "Failing"})
    else:
        s = ml.status(y0 - 1)[0]
    return s.map(ORD)


def with_lag(x, y0):
    ls = lag_status(y0).reindex(x.index)
    x = x.copy()
    x["lag_status"] = ls
    x["d_status"] = x["status0"] - ls
    x["lag_failing"] = (ls == 3).astype(float)
    x["lag_missing"] = ls.isna().astype(float)
    return x


tr0, te0 = ml.panel(2024, 2025), ml.panel(2025, 2026)
tr1, te1 = with_lag(tr0, 2024), with_lag(te0, 2025)


def run(tr, te, label, subset_train=None):
    if subset_train is not None:
        tr = tr[subset_train(tr)]
    Xtr, ytr = ml.Xy(tr)
    Xte, yte = ml.Xy(te)
    Xte = Xte[Xtr.columns]
    ps = {}
    for name, fam in ml.FAMILIES.items():
        m = ml.fit_family(fam, Xtr, ytr)
        if m is not None:
            ps[name] = m.predict_proba(Xte)[:, 1]
    pe = np.mean([ml.rank01(p) for p in ps.values()], axis=0)
    s0 = Xte["status0"].values
    row = {}
    for g, mask in {"all": s0 < 3, "AtRisk": s0 == 2}.items():
        y = yte[mask]
        row[g] = [round(float(roc_auc_score(y, pe[mask])), 3), ml.boot_auc(y, pe[mask], n=300)]
    print(label, json.dumps(row), flush=True)


run(tr0, te0, "A baseline (no lag)")
run(tr1, te1, "B + lag status features")
run(tr0, te0, "C train on At-Risk+Potentially only", subset_train=lambda t: t.status0 >= 1)
run(tr1, te1, "D lag + train on At-Risk+Potentially only", subset_train=lambda t: t.status0 >= 1)
