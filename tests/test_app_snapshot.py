"""Integration checks on the actual exported optimizer inputs and their lineage."""
import hashlib
import json
import sys
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'pipeline'))
from compare_allocations import dataset, plan


def read(path):
    return json.loads((ROOT/path).read_text(encoding='utf-8'))


def test_snapshot_manifest_and_forecast_lineage():
    manifest = read('app/data/snapshot.json')
    for name, digest in manifest['sha256'].items():
        assert hashlib.sha256((ROOT/'app/data'/name).read_bytes()).hexdigest() == digest
    summary = read('app/data/summary.json')
    assert summary['forecast_sha256'] == manifest['sha256']['forecast.json']
    forecast = read('app/data/forecast.json')
    provenance = forecast['metrics']['export_provenance']
    for key, path in [('selection_sha256', 'data/model_selection.json'),
                      ('calibration_sha256', 'data/planner_calibration.json')]:
        assert provenance[key] == hashlib.sha256((ROOT/path).read_bytes()).hexdigest()
    assert provenance['calibration_training_transition'] == [2024, 2025]
    assert provenance['normalization_n'] == len(forecast['p_fail'])


def test_export_preserves_forecast_precision_and_training_fallback():
    forecast = read('app/data/forecast.json')
    evaluation = read('data/planner_evaluation.json')
    fallback = forecast['metrics']['fallback_at_risk_probability']
    assert fallback == evaluation['training_rate_by_status']['2.0']
    missing = []
    for s in read('app/data/systems.json'):
        if s['failing']:
            assert s['pf'] is None
        elif s['id'] in forecast['p_fail']:
            assert s['pf'] == forecast['p_fail'][s['id']]
            assert s['forecast_source'] == 'planner_probabilities'
        else:
            missing.append(s['id'])
            assert s['pf'] == fallback
            assert s['forecast_source'] == 'training_status_rate'
    assert missing == read('app/data/summary.json')['fallback_at_risk_systems']


def test_exported_inputs_reproduce_python_default_plans():
    data = dataset(ROOT/'app/data')
    for comparison in data[1]['comparison']:
        result = plan(data, {'b': comparison['budget_musd']})
        expected = comparison['optimizer']
        assert result['systems'] == expected['systems']
        assert result['people'] == expected['people']
        assert round(result['cost_usd']/1e6, 1) == expected['spent_musd']
        assert result['rounded_budget_usd'] <= comparison['budget_musd']*1e6


def test_preserved_old_snapshot_bytes():
    manifest = read('audit/app-before/sha256.json')
    for name, digest in manifest.items():
        assert hashlib.sha256((ROOT/'audit/app-before'/name).read_bytes()).hexdigest() == digest


def test_allocation_comparison_reconciles_and_fixed_control_is_stable():
    rows = read('audit/allocation-comparison/plans.json')
    assert len(rows) == 55
    for row in rows:
        a,b = set(row['old']['selected_ids']),set(row['new']['selected_ids'])
        assert sorted(b-a) == row['added']
        assert sorted(a-b) == row['removed']
        assert len(a&b)/len(a|b) == pytest.approx(row['jaccard'])
        for version in ('old','new'):
            assert row[version]['rounded_budget_usd'] <= row['budget_musd']*1e6
        # Identical fixed weights remove the forecast as a source of change;
        # small changes can still arise from the deliberate equity precision fix.
        if row['setting'] == 'fixed_share_50pct':
            assert row['old']['baseline_people'] == row['new']['baseline_people']


def test_python_browser_parity_on_all_reviewed_allocations():
    result = subprocess.run(['node', str(ROOT/'tests/snapshot_parity.js')],
                            check=True, text=True, capture_output=True)
    assert json.loads(result.stdout) == {'matched': 110}


@pytest.mark.parametrize('mismatch', ['forecast', 'calibration'])
def test_seal_rejects_mixed_artifacts(tmp_path, monkeypatch, mismatch):
    import seal_snapshot
    forecast = read('app/data/forecast.json')
    summary = read('app/data/summary.json')
    if mismatch == 'forecast':
        summary['forecast_sha256'] = '0'*64
    else:
        forecast['metrics']['export_provenance']['calibration_sha256'] = '0'*64
    (tmp_path/'forecast.json').write_text(json.dumps(forecast))
    (tmp_path/'summary.json').write_text(json.dumps(summary))
    monkeypatch.setattr(seal_snapshot, 'OUT', tmp_path)
    with pytest.raises(ValueError):
        seal_snapshot.main()
    assert not (tmp_path/'snapshot.json').exists()
