"""Forecast experiments on the population the app scores (At-Risk systems), base features only (no extra datasets).
Run from the repo root: python pipeline/experiments/at_risk_subset_eval.py. Results are in AUDIT.md rows 1-4."""
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
import sys, json
sys.argv = [sys.argv[0], "--no-stage1"]            # the extra datasets are not on this machine (disk nearly full), so base features only
sys.path.insert(0, str(ROOT / "pipeline"))
import numpy as np
from sklearn.metrics import roc_auc_score
import ml

tr, te = ml.panel(2024, 2025), ml.panel(2025, 2026)
Xtr, ytr = ml.Xy(tr)
Xte, yte = ml.Xy(te)
Xte = Xte[Xtr.columns]
probs = {}
for name, fam in ml.FAMILIES.items():
    m = ml.fit_family(fam, Xtr, ytr)
    if m is not None:
        probs[name] = m.predict_proba(Xte)[:, 1]
probs["ensemble"] = np.mean([ml.rank01(p) for p in probs.values()], axis=0)
probs["total_risk_score(baseline)"] = Xte["total"].fillna(0).values
probs["status_only(baseline)"] = Xte["status0"].values.astype(float)
s0 = Xte["status0"].values
out = {}
for gname, mask in {"all non-failing (what the backtest reports)": s0 < 3, "At-Risk only (where the app uses the forecast)": s0 == 2, "At-Risk + Potentially At-Risk": s0 >= 1}.items():
    y = yte[mask]
    row = {"n": int(mask.sum()), "onsets": int(y.sum()), "rate": round(float(y.mean()), 4)}
    for k, p in probs.items():
        pp = p[mask]
        row[k] = round(float(roc_auc_score(y, pp)), 3) if len(set(pp)) > 1 else 0.5
        if k in ("ensemble", "total_risk_score(baseline)"):
            row[k + "_ci"] = ml.boot_auc(y, pp)
    out[gname] = row
print(json.dumps(out, indent=1))
