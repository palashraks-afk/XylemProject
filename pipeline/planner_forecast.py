"""The probability calculation shared by evaluation and the app's forecast export."""
import numpy as np

METHOD = "mean_of_training_rate_rescaled_probabilities_v1"


def planner_probabilities(member_probabilities, training_rate, calibrator=None):
    """Scale each member over the entire scored non-Failing cohort, then average.

    This preserves the existing app rule, including its 0.95 cap and four-decimal
    export precision. The rate must come from training labels, never test labels.
    Normalize BEFORE selecting an evaluation subgroup: the app scores all known
    non-Failing systems, then uses the At-Risk subset in the funding planner.
    This is mean rescaling, not a fitted probability calibrator. Predictions depend
    on the scored cohort; clipping/rounding can change their final mean.
    """
    p = np.asarray(member_probabilities, dtype=float)
    if p.ndim != 2 or p.shape[0] == 0 or p.shape[1] == 0:
        raise ValueError("Expected a nonempty member-by-system probability matrix")
    if not np.isfinite(p).all() or ((p < 0) | (p > 1)).any():
        raise ValueError("Member probabilities must be finite and between zero and one")
    if not np.isfinite(training_rate) or not 0 <= training_rate <= 1:
        raise ValueError("training_rate must be between zero and one")
    scaled = p * training_rate / np.maximum(1e-9, p.mean(axis=1, keepdims=True))
    base = np.round(np.minimum(0.95, scaled.mean(axis=0)), 4)
    return apply_calibration(base, calibrator) if calibrator is not None else base


CALIBRATION_METHODS = ("identity", "intercept", "logit_ridge")

def apply_calibration(probabilities, calibrator):
    """Monotone map; fixed before scoring, without cohort/subgroup renormalization."""
    from scipy.special import expit, logit
    p = np.asarray(probabilities, dtype=float)
    if not np.isfinite(p).all() or ((p < 0) | (p > 1)).any():
        raise ValueError("Invalid probabilities")
    method = calibrator.get("method")
    if method == "identity":
        return p.copy()
    if method not in CALIBRATION_METHODS:
        raise ValueError("Unknown probability calibration method")
    slope, intercept = float(calibrator["slope"]), float(calibrator["intercept"])
    if not np.isfinite([slope, intercept]).all() or slope <= 0:
        raise ValueError("Calibration must be finite and strictly monotone")
    return expit(intercept + slope * logit(np.clip(p, 1e-6, 1-1e-6)))


def fit_calibration(probabilities, labels, method):
    """One/two parameter maps for rare events; no class balancing or test labels.

    logit_ridge shrinks slope to 1 with a fixed unit penalty; slope is positive.
    Intercept is unpenalized. Isotonic is deliberately omitted with only ~68 events.
    """
    from scipy.optimize import minimize
    from scipy.special import expit, logit
    p, y = np.asarray(probabilities, float), np.asarray(labels, float)
    if p.shape != y.shape or p.ndim != 1 or not len(y) or not np.isfinite(p).all() or not np.isfinite(y).all():
        raise ValueError("Invalid calibration training arrays")
    if ((p < 0) | (p > 1)).any() or not np.isin(y, [0, 1]).all() or len(np.unique(y)) != 2:
        raise ValueError("Calibration requires probabilities and both binary classes")
    if method not in CALIBRATION_METHODS:
        raise ValueError("Unknown probability calibration method")
    if method == "identity":
        return {"method": method, "slope": 1., "intercept": 0.}
    x = logit(np.clip(p, 1e-6, 1-1e-6))
    def objective(theta):
        a, b = theta[0], (theta[1] if method == "logit_ridge" else 1.)
        z = a + b*x
        loss = np.logaddexp(0, z).sum() - np.dot(y, z) + .5*(b-1)**2
        residual = expit(z)-y
        grad = [residual.sum()]
        if method == "logit_ridge":
            grad.append(np.dot(residual, x)+(b-1))
        return loss, np.array(grad)
    initial = [0., 1.] if method == "logit_ridge" else [0.]
    bounds = [(None, None), (.05, 10.)] if method == "logit_ridge" else [(None, None)]
    fit = minimize(objective, initial, jac=True, bounds=bounds, method="L-BFGS-B")
    if not fit.success:
        raise RuntimeError("Calibration optimization failed: " + fit.message)
    return {"method": method, "intercept": float(fit.x[0]),
            "slope": float(fit.x[1]) if method == "logit_ridge" else 1.}
