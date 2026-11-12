"""Check frozen results, deliberate UI provenance, and inherited evidence offline."""
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = 'f0fa6006032f6b614276395c5628596a63b966fa'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    unchanged = subprocess.check_output(['git', '-C', str(ROOT), 'diff', '--name-only', BASE, '--',
                                         'app/data', 'data', 'pipeline', '.github']).decode().strip()
    assert not unchanged, unchanged
    evaluation = json.loads((ROOT/'data/planner_evaluation.json').read_text())
    presentation = json.loads((ROOT/'audit/release-qa/presentation-provenance.json').read_text())
    checks = {**evaluation['input_and_code_hashes'], **evaluation['output_hashes']}
    for name, expected in checks.items():
        path = ROOT/name
        if name == 'app/app.js':
            assert digest(path) == presentation['current_sha256']
            assert expected == presentation['archived_sha256']
            path = ROOT/presentation['archived_path']
        assert digest(path) == expected, name
    before = ROOT/'audit/accessibility/before'
    for name in ['app.js', 'index.html', 'style.css', 'map3d.js']:
        original = subprocess.check_output(['git', '-C', str(ROOT), 'show', f'{BASE}:app/{name}'])
        assert (before/'app'/name).read_bytes() == original
    inherited = before/'original-review'
    old_manifest = json.loads((inherited/'SHA256-MANIFEST.json').read_text())
    mismatches = {name: {'expected': expected, 'observed': digest(inherited/name)}
                  for name, expected in old_manifest.items() if digest(inherited/name) != expected}
    # Keep inherited discrepancies visible, never rewrite the supplied evidence.
    receipt = {'base_commit': BASE, 'frozen_paths_unchanged': ['app/data', 'data', 'pipeline', '.github'],
               'original_diagnostic_hashes_checked': len(checks),
               'raw_input_hashes_checked': sum(n.startswith('data/raw/') for n in checks),
               'archived_evaluated_ui_and_active_ui': 'PASS', 'baseline_ui_bytes': 'PASS',
               'inherited_evidence_manifest_mismatches': mismatches,
               'local_before_evidence_sha256': {p.relative_to(before).as_posix(): digest(p)
                                               for p in sorted(before.rglob('*')) if p.is_file()},
               'model_training': 'not run; frozen results reused', 'raw_downloads': 'none'}
    (ROOT/'audit/accessibility/integrity.json').write_text(json.dumps(receipt, indent=2)+'\n')
    print(json.dumps({k:v for k,v in receipt.items() if k != 'local_before_evidence_sha256'}))


if __name__ == '__main__':
    main()
