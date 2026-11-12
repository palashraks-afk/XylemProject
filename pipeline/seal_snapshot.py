"""Seal the local app's generated data; the browser rejects mixed snapshots."""
import hashlib
import json
from pathlib import Path

from feature_policy import file_hash, fingerprint

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'app/data'


def main():
    forecast = json.loads((OUT / 'forecast.json').read_text())
    summary = json.loads((OUT / 'summary.json').read_text())
    provenance = forecast['metrics']['export_provenance']
    if provenance['feature_fingerprint'] != fingerprint(model=True):
        raise ValueError('Stale forecast; rebuild selection, calibration, forecast and plans')
    for key, path in [('selection_sha256', 'data/model_selection.json'),
                      ('calibration_sha256', 'data/planner_calibration.json')]:
        if provenance[key] != file_hash(ROOT / path):
            raise ValueError('Stale forecast artifact: ' + path)
    if summary['forecast_sha256'] != file_hash(OUT / 'forecast.json'):
        raise ValueError('Plans do not match forecast; run pipeline/build.py')
    hashes = {p.name: file_hash(p) for p in sorted(OUT.iterdir())
              if p.is_file() and p.name != 'snapshot.json'}
    snapshot_id = hashlib.sha256(json.dumps(hashes, sort_keys=True).encode()).hexdigest()
    result = {'id': snapshot_id, 'base_commit': '946881dd3f8ad1635598d51401b3e2a2246170ca',
              'feature_policy': forecast['metrics']['feature_policy'],
              'forecast_provenance': provenance, 'sha256': hashes,
              'limits': summary['forecast_limit']}
    (OUT / 'snapshot.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
    print(snapshot_id)


if __name__ == '__main__':
    main()
