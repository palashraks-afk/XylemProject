"""Check the independent environment against frozen artifacts without fitting models."""
import hashlib
import importlib.metadata
import json
import sys
from pathlib import Path

root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'pipeline'))
from feature_policy import fingerprint
from calibrate_planner import load_calibration
from model_zoo import selection
import violation_model
import pandas as pd

evaluation=json.loads((root/'data/planner_evaluation.json').read_text())
versions={name:importlib.metadata.version(name) for name in evaluation['library_versions']}
assert versions==evaluation['library_versions']
forecast=json.loads((root/'app/data/forecast.json').read_text())
assert fingerprint(model=True)==forecast['metrics']['export_provenance']['feature_fingerprint']
selection();load_calibration()  # Actual artifact guards, without refitting or bypasses.
panel=violation_model.panel()   # Rebuild only the historical features, no model selection/training.
result={'python':sys.version,'executable':sys.executable,'prefix':sys.prefix,
        'base_prefix':sys.base_prefix,'sys_path':sys.path,'versions':versions,
        'feature_fingerprint':fingerprint(model=True),'historical_panel_rows':len(panel),
        'historical_panel_columns':len(panel.columns),'artifact_guards':'PASS',
        'model_fit':'not rerun; frozen results reused'}
if len(sys.argv)>1:
    old=pd.read_pickle(Path(sys.argv[1])/'data/raw/extra/stage1_panel_event_time_v2.pkl')
    pd.testing.assert_frame_equal(panel,old,check_exact=True)
    result['independent_panel_matches_preserved_cache_exactly']=True
(root/'audit/release-qa/reproduction.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
