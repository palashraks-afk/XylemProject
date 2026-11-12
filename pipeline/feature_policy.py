"""Historical input contract and content-bound cache/artifact provenance."""
import hashlib
import importlib.metadata
import json
from functools import lru_cache
from pathlib import Path

FEATURE_POLICY = "historical-event-time-v2"
ROOT = Path(__file__).resolve().parents[1]

@lru_cache(maxsize=4096)
def _digest(path, size, mtime):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def file_hash(path):
    st = path.stat()
    return _digest(str(path), st.st_size, st.st_mtime_ns)

def fingerprint(model=False):
    # Source bytes, feature code and numerical dependencies, never generated caches.
    raw = ROOT / "data/raw"
    paths = [p for p in raw.rglob("*") if p.is_file() and p.suffix.lower() in
             (".csv", ".xlsx", ".json", ".geojson", ".zip", ".txt", ".png")]
    code = ["extra_features.py", "violation_model.py", "feature_policy.py"]
    if model:
        code += ["model_zoo.py", "model_selection.py", "ml.py"]
    paths += [ROOT / "pipeline" / f for f in code]
    versions = {p: importlib.metadata.version(p) for p in ("numpy", "pandas", "scikit-learn", "scipy", "openpyxl")}
    manifest = {p.relative_to(ROOT).as_posix(): file_hash(p) for p in sorted(paths)}
    return hashlib.sha256(json.dumps([FEATURE_POLICY, manifest, versions], sort_keys=True).encode()).hexdigest()
