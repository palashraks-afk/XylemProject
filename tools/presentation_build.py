"""Bind the static UI and frozen assets for a same-build HTTPS device preview.

Run --write only after deliberate UI changes. Default verifies without writing.
This never rebuilds data/models or revises the frozen diagnostic receipt.
"""
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def current_receipt():
    files = {p.relative_to(ROOT/'app').as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
             for p in sorted((ROOT/'app').rglob('*')) if p.is_file() and p.name != 'build.json'}
    identifier = hashlib.sha256(json.dumps(files, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    return {'schema': 1, 'id': identifier, 'base_commit': 'f0fa6006032f6b614276395c5628596a63b966fa',
            'snapshot_id': json.loads((ROOT/'app/data/snapshot.json').read_text())['id'], 'sha256': files}


def verify():
    expected = json.loads((ROOT/'app/build.json').read_text())
    assert expected == current_receipt(), 'Presentation files differ; deliberately refresh the build receipt after reviewing UI changes.'
    return expected


if __name__ == '__main__':
    if sys.argv[1:] == ['--write']:
        (ROOT/'app/build.json').write_text(json.dumps(current_receipt(), indent=2)+'\n', encoding='utf-8')
    elif sys.argv[1:]:
        raise SystemExit('Usage: presentation_build.py [--write]')
    receipt = verify()
    print(json.dumps({'result': 'PASS', 'ui_build': receipt['id'], 'files': len(receipt['sha256'])}))
