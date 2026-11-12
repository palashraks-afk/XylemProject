"""Verify the static app's saved data and vendored library bytes without ML dependencies."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
snapshot = json.loads((root/'app/data/snapshot.json').read_text())
for name, expected in snapshot['sha256'].items():
    assert hashlib.sha256((root/'app/data'/name).read_bytes()).hexdigest() == expected, name
assert hashlib.sha256(json.dumps(snapshot['sha256'], sort_keys=True).encode()).hexdigest() == snapshot['id']
vendor = json.loads((root/'app/vendor/manifest.json').read_text())
for name, expected in vendor['sha256'].items():
    assert hashlib.sha256((root/'app/vendor'/name).read_bytes()).hexdigest() == expected, name
print(json.dumps({'snapshot_id':snapshot['id'], 'data_files':len(snapshot['sha256']),
                  'vendor_files':len(vendor['sha256']), 'result':'PASS'}, indent=2))
