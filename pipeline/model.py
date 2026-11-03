"""Transparent planning priorities; weights are user choices, not learned health effects."""
import numpy as np

def benefit(population, failing, equity, equity_weight=1.0, at_risk_weight=0.5,
            connections=None, small_weight=0.0):
    score = np.asarray(population) * np.where(failing, 1.0, at_risk_weight) * (1 + equity_weight * np.asarray(equity))
    if connections is not None:
        score = score * (1 + small_weight * (np.asarray(connections) <= 500))
    return score

