"""Stage 1 of the forecast: which systems get a new health-based drinking-water violation in the next 12 months?

The SAFER "Failing" label has only a few dozen new cases a year, too few to learn from. EPA's dated violation records give ten years of
labels, so this model learns from about 25,000 system-years instead. Its prediction becomes one input to the Failing-onset model in ml.py.

Time discipline: cycle y has cutoff July 1 of year y and predicts violations that begin in the following 12 months. A model used for cycle y
is trained only on cycles whose label window had closed by that cutoff (cycles before y). Historical features exclude undated mutable
snapshots and current population/connection counts. Terrain and location remain fixed geographic proxies. Dates describe events, not
first publication: retrospective source corrections and the current-system cohort are still limitations.
"""
import warnings
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score, average_precision_score

import model_zoo
from feature_policy import FEATURE_POLICY, fingerprint

import extra_features as ef

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data" / "raw" / "extra" / "stage1_panel_event_time_v2.pkl"
CYCLES = list(range(2017, 2027))                     # 2026 has no complete label window; it is only scored
SEED = 7
warnings.filterwarnings("ignore")


def cutoff(y):
    return f"{y}-07-01"


@lru_cache(maxsize=None)
def spine():
    s = ef.systems()
    w = pd.read_csv(ef.X / "sdwis_water_system.csv", low_memory=False).drop_duplicates("pwsid").set_index("pwsid")
    s = s.join(w[["pws_type_code", "pws_deactivation_date", "population_served_count", "service_connections_count"]], how="left")
    s["deact"] = pd.to_datetime(s.pws_deactivation_date, errors="coerce")
    return s[s.pws_type_code.isin(["CWS", "NTNCWS"]) | s.pws_type_code.isna()]


# What "a new violation" means, one stage-1 model per definition. The SAFER Failing list also reacts to monitoring and treatment failures, so
# forecasts of the broader events add signal to the health-based one (chosen on the 2024 to 2025 transition; see model_selection.py).
TARGETS = {
    "hbv": lambda v: v.is_health_based_ind == "Y",
    "any": lambda v: v.violation_category_code.isin(["MCL", "TT", "MR", "MON", "RPT", "MRDL"]),
    "monrep": lambda v: v.violation_category_code.isin(["MR", "MON", "RPT"]),
    "mcl": lambda v: v.violation_category_code == "MCL",
}


def label(pw, y, target="hbv"):
    v = ef.violations()
    c = pd.Timestamp(cutoff(y))
    hit = v[TARGETS[target](v) & (v.b > c) & (v.b <= c + pd.DateOffset(years=1))].pwsid.unique()
    return pd.Series(pw.isin(hit).astype(int), index=pw)


_LABELS = {}


def labels_for(p, target):
    """Label column for the cached panel (labels are cheap to recompute, so the cache only holds features)."""
    if target == "hbv":
        return p.y
    if target not in _LABELS:
        out = pd.Series(np.nan, index=p.index)
        for y in CYCLES[:-1]:
            sel = (p.cycle == y).to_numpy()
            out[sel] = label(p.index[sel], y, target).values
        _LABELS[target] = out
    return _LABELS[target]


def panel():
    signature = fingerprint()
    if CACHE.exists():
        cached = pd.read_pickle(CACHE)
        if cached.attrs.get("feature_policy") == FEATURE_POLICY and cached.attrs.get("cycles") == CYCLES and cached.attrs.get("input_fingerprint") == signature:
            return cached
    _LABELS.clear()
    if hasattr(spine, "cache_clear"):
        spine.cache_clear()
    for loader in (ef.systems, ef.violations, ef.enforcement, ef.school_lead_df, ef.dry_wells_df, ef.fires_df, ef.noaa, ef.dem):
        if hasattr(loader, "cache_clear"):
            loader.cache_clear()
    sp = spine()
    frames = []
    for y in CYCLES:
        c = pd.Timestamp(cutoff(y))
        pw = sp.index[(sp.deact.isna() | (sp.deact > c))]
        f = ef.historical_features(pw, cutoff(y))
        f["cycle"] = y
        f["y"] = label(pw, y).values if y < 2026 else np.nan
        frames.append(f)
        print("cycle", y, len(f), "positives", int(np.nansum(f.y)), flush=True)
    p = pd.concat(frames)
    p.index.name = "PWSID"
    p.attrs.update(feature_policy=FEATURE_POLICY, cycles=CYCLES, input_fingerprint=signature)
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    p.to_pickle(CACHE)
    return p


def feature_cols(p):
    return [c for c in p.columns if c not in ("y", "cycle")]


def model():
    return model_zoo.make("hgb", max_depth=4, learning_rate=0.05, max_iter=250, min_samples_leaf=40, l2_regularization=2.0)


def calibrate(pr, cycle):
    """Use a saved calibration map only after all its validation label windows have closed."""
    s = model_zoo.selection().get("stage1", {})
    cal = s.get("calibrator")
    val = s.get("folds", {}).get("val", [])
    if not cal or not val or cycle <= max(val):
        return pr
    return np.interp(pr, cal["x"], cal["y"])


def predict_for_cycle(y, p=None, target="hbv", calibrate_output=True):
    """Probability of a new violation of the given kind in the 12 months after cycle y, from the selected stage-1 model(s) trained on earlier cycles only."""
    p = panel() if p is None else p
    cols = feature_cols(p)
    lab = labels_for(p, target)
    mask = ((p.cycle < y) & lab.notna()).to_numpy()
    tr, ytr = p[mask], lab[mask].to_numpy()
    te = p[p.cycle == y]
    members = [model_zoo.make(k, **cfg).fit(tr[cols], ytr) for k, cfg in model_zoo.stage1_members()]
    pr = np.mean([m.predict_proba(te[cols])[:, 1] for m in members], axis=0)
    if target == "hbv" and calibrate_output:
        pr = calibrate(pr, y)
    return pd.Series(pr, index=te.index), members


def evaluate():
    p = panel()
    out = {}
    for y in (2022, 2023, 2024, 2025):
        pr, _ = predict_for_cycle(y, p)
        te = p[p.cycle == y]
        yy = te.y.values
        base = te.viol_health_5y.values                                  # naive baseline: how many health violations in the last 5 years
        out[str(y)] = {"n": int(len(te)), "positives": int(yy.sum()), "base_rate": round(float(yy.mean()), 4),
                       "auc": round(float(roc_auc_score(yy, pr.values)), 3), "auc_baseline_violation_count": round(float(roc_auc_score(yy, base)), 3),
                       "avg_precision": round(float(average_precision_score(yy, pr.values)), 3)}
    return out


def source_value(cycles=(2024, 2025)):
    """What is each source worth? Retrain without one source group at a time and see how much AUC is lost (averaged over the test cycles)."""
    p = panel()
    cols = feature_cols(p)
    if not ef.GROUPS:                                  # the cached panel does not carry the column -> source mapping; rebuild it on a few systems
        ef.historical_features(pd.Index(spine().index[:5]), cutoff(2025))
    groups = sorted(set(ef.GROUPS[c] for c in cols if c in ef.GROUPS))

    def auc_for(use):
        vals = []
        for y in cycles:
            tr = p[(p.cycle < y) & p.y.notna()]
            te = p[p.cycle == y]
            m = model().fit(tr[use], tr.y)
            vals.append(roc_auc_score(te.y, m.predict_proba(te[use])[:, 1]))
        return float(np.mean(vals))

    full = auc_for(cols)
    out = {"all_sources": round(full, 4), "drop_one": {}}
    sizes_only = [c for c in cols if c not in ef.GROUPS]
    out["size_only"] = round(auc_for(sizes_only), 4)
    for g in groups:
        keep = [c for c in cols if ef.GROUPS.get(c) != g]
        out["drop_one"][g] = {"auc_without": round(auc_for(keep), 4), "auc_lost": round(full - auc_for(keep), 4), "n_features": int(sum(ef.GROUPS.get(c) == g for c in cols))}
    return out


if __name__ == "__main__":
    import json
    print(json.dumps(evaluate(), indent=1))
