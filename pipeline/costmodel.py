"""Per-system cost model built from the state's published 2024 Cost Assessment averages.

The state does not publish per-system remediation costs. It publishes the average
long-term solution cost per service connection by system size and status (Table 7)
and total cost by county (Table 9). We apply Table 7 to each system's connection
count to get a modelled point estimate, then check the result against Table 9.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TABLES = json.loads((ROOT / "data" / "cost_tables.json").read_text())
_PC = TABLES["per_connection_usd"]
_BINS = _PC["bins"]


def size_bin(connections):
    for i, (lo, hi) in enumerate(_BINS):
        if connections >= lo and (hi is None or connections <= hi):
            return i
    return 0


def per_connection(connections, status):
    key = "failing" if status == "Failing" else "at_risk"
    i = size_bin(connections)
    v = _PC[key][i]
    if v is None:  # state lists N/A for At-Risk above 30,000 connections
        v = _PC["failing"][i]
    return v


def system_cost(connections, status):
    return max(int(connections), 1) * per_connection(max(int(connections), 1), status)
