"""Model constructors shared by the selection search, the stage-1 violation forecast and the failure-onset forecast."""
import json
from pathlib import Path

import numpy as np
from scipy.stats import rankdata
from sklearn.ensemble import ExtraTreesClassifier, HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

SEED = 7
SELECTION = Path(__file__).resolve().parents[1] / "data" / "model_selection.json"
rank01 = lambda p: rankdata(p) / len(p)  # noqa: E731


def make(kind, **kw):
    if kind == "hgb":
        return HistGradientBoostingClassifier(random_state=SEED, **kw)
    if kind == "rf":
        return make_pipeline(SimpleImputer(strategy="median"), RandomForestClassifier(n_estimators=300, class_weight="balanced_subsample", random_state=SEED, n_jobs=-1, **kw))
    if kind == "et":
        return make_pipeline(SimpleImputer(strategy="median"), ExtraTreesClassifier(n_estimators=300, class_weight="balanced_subsample", random_state=SEED, n_jobs=-1, **kw))
    if kind in ("lr", "stack"):
        return make_pipeline(SimpleImputer(strategy="median", add_indicator=True), StandardScaler(), LogisticRegression(max_iter=3000, class_weight="balanced", **kw))
    raise ValueError(kind)


def selection():
    return json.loads(SELECTION.read_text()) if SELECTION.exists() else {}


def stage1_members():
    """(kind, config) pairs of the stage-1 model chosen on validation folds; one tuned gradient-boosting model if no selection has been run."""
    s = selection().get("stage1")
    if not s:
        return [("hgb", {"max_depth": 4, "learning_rate": 0.05, "max_iter": 250, "min_samples_leaf": 40, "l2_regularization": 2.0})]
    cands = {c["name"]: c for c in s["candidates"]}
    ch = s["chosen_config"]
    if ch["family"] == "ensemble":
        return [(cands[m]["family"], cands[m]["config"]) for m in ch["members"]]
    return [(ch["family"], ch["config"])]


def stage2_config(family):
    s = selection().get("stage2")
    defaults = {"lr": ("lr", {"C": 0.3}, "full"), "hgb": ("hgb", {"max_depth": 3, "learning_rate": 0.05, "max_iter": 200, "min_samples_leaf": 15, "l2_regularization": 1.0}, "full"),
                "rf": ("rf", {"min_samples_leaf": 8, "max_features": 0.4}, "full"), "et": ("et", {"min_samples_leaf": 10, "max_features": 0.4}, "full"), "stack": ("stack", {"C": 0.1}, "stack")}
    if not s or family not in s.get("best_by_family", {}):
        return defaults[family]
    b = s["best_by_family"][family]
    return (family, b["config"], b["features"])
