"""Select probability calibration using 2024->2025 training outcomes only.

Nested 5 outer / 4 inner stratified folds. Base configurations are held fixed
after training-only model selection; configuration selection is not nested.
No 2025->2026 transition is loaded by this command.
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import brier_score_loss, log_loss
from sklearn.model_selection import StratifiedKFold

from feature_policy import FEATURE_POLICY, file_hash, fingerprint
from planner_forecast import (CALIBRATION_METHODS, apply_calibration,
                              fit_calibration, planner_probabilities)

ROOT = Path(__file__).resolve().parents[1]
ARTIFACT = ROOT / 'data/planner_calibration.json'
SEED = 71


def provenance():
    return {'feature_policy': FEATURE_POLICY,
            'input_fingerprint': fingerprint(model=True),
            'selection_sha256': file_hash(ROOT / 'data/model_selection.json'),
            'code_sha256': {name: file_hash(ROOT / 'pipeline' / name)
                            for name in ('ml.py', 'planner_forecast.py', 'calibrate_planner.py')}}


def load_calibration(path=None):
    path = ARTIFACT if path is None else path
    saved = json.loads(path.read_text(encoding='utf-8'))
    if saved.get('provenance') != provenance():
        raise ValueError('Stale probability calibration; run python pipeline/calibrate_planner.py')
    if saved.get('training_transition') != [2024, 2025]:
        raise ValueError('Probability calibration must exclude diagnostic test outcomes')
    return saved


def base_prediction(train, score):
    import ml
    X, y = ml.Xy(train)
    members = [ml.fit_family(family, X, y) for family in ml.FAMILIES.values()]
    if any(m is None for m in members):
        raise ValueError('Calibration requires the complete forecast ensemble')
    return planner_probabilities([m.predict_proba(score[X.columns])[:, 1] for m in members], float(y.mean()))


def oof_base(train, score, splits, seed):
    positions = score.index.get_indexer(train.index)
    if (positions < 0).any() or not score.index.is_unique or not train.index.is_unique:
        raise ValueError('Training IDs must be unique and present in the full scoring population')
    out = np.full(len(train), np.nan)
    for a, b in StratifiedKFold(splits, shuffle=True, random_state=seed).split(train, train.y):
        out[b] = base_prediction(train.iloc[a], score)[positions[b]]
    return out


def select_method(fold_scores):
    # Fixed before diagnostic test evaluation. A 0.001 log-loss tolerance favors
    # fewer parameters when training-only evidence does not distinguish methods.
    means = {method: float(np.mean([r[method]['log_loss'] for r in fold_scores]))
             for method in CALIBRATION_METHODS}
    best = min(means.values())
    return next(method for method in CALIBRATION_METHODS if means[method] <= best + .001), means


def main():
    import ml
    ml.model_zoo.selection()  # reject incompatible tuning/calibration first
    score = ml.scoring_features(2024)
    train = ml.panel(2024, 2025)
    y = train.y.to_numpy()
    positions = score.index.get_indexer(train.index)
    outer = StratifiedKFold(5, shuffle=True, random_state=SEED)
    raw = np.full(len(train), np.nan)
    candidates = {m: np.full(len(train), np.nan) for m in CALIBRATION_METHODS}
    fold_id = np.zeros(len(train), dtype=int)
    fold_scores, maps = [], []
    for k, (a, b) in enumerate(outer.split(train, y)):
        print(f'Nested calibration fold {k+1}/5: training {len(a)}, validation {len(b)}', flush=True)
        # Inner predictions exclude each inner row from model fitting. Outer
        # validation labels are excluded from BOTH fitting and calibration.
        inner = oof_base(train.iloc[a], score, 4, SEED+k+1)
        raw[b] = base_prediction(train.iloc[a], score)[positions[b]]
        fold_id[b] = k
        rows, fitted = {}, {}
        for method in CALIBRATION_METHODS:
            fitted[method] = fit_calibration(inner, y[a], method)
            p = apply_calibration(raw[b], fitted[method])
            candidates[method][b] = p
            rows[method] = {'log_loss': float(log_loss(y[b], p, labels=[0, 1])),
                            'brier': float(brier_score_loss(y[b], p)),
                            'mean_predicted': float(p.mean()),
                            'observed_rate': float(y[b].mean())}
        fold_scores.append(rows)
        maps.append({'fold': k, 'fit_n': len(a), 'fit_events': int(y[a].sum()),
                     'validation_n': len(b), 'validation_events': int(y[b].sum()), 'maps': fitted})
    chosen, means = select_method(fold_scores)
    calibration = fit_calibration(raw, y, chosen)
    result = {'provenance': provenance(), 'training_transition': [2024, 2025],
              'training_n': len(train), 'training_events': int(y.sum()),
              'target': 'Assessment snapshot transition; annual failure calibration unverified',
              'normalization_n': len(score), 'seed': SEED,
              'method': chosen, 'calibrator': calibration,
              'selection_rule': 'Lowest mean outer-fold log loss; prefer identity, then intercept, then logit_ridge within 0.001 of minimum. No test-year inputs.',
              'folds': {'outer': 5, 'inner': 4, 'shuffle': True},
              'candidate_mean_log_loss': means, 'fold_scores': fold_scores, 'fold_maps': maps,
              'limitations': ['Within one training transition; not forward-year validation.',
                              'Base configurations selected using the entire training transition; model selection is not nested.',
                              'Few training onsets; no subgroup-specific calibration or isotonic fitting.',
                              'Assessment status reference dates and July stage-1 cutoffs differ; some outcomes precede nominal prediction cutoffs. Annual failure calibration is unverified.',
                              'Five-year conversion 1-(1-p)^5 assumes constant annual risk and is not validated.',
                              'Full scoring covariates determine member normalization, including systems with unknown outcomes.']}
    ARTIFACT.write_text(json.dumps(result, indent=2, allow_nan=False)+'\n', encoding='utf-8')
    pd.DataFrame({'PWSID': train.index, 'actual_failing': y, 'status0': train.status0.to_numpy(),
                  'outer_fold': fold_id, 'base_oof': raw, **candidates}).to_csv(ROOT/'data/planner_calibration_oof.csv', index=False)
    print(json.dumps({'chosen': chosen, 'map': calibration, 'candidate_log_loss': means}, indent=2), flush=True)


if __name__ == '__main__':
    main()
