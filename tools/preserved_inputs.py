"""Offline transfer of the exact raw inputs recorded in the diagnostic receipt.

No acquisition commands, caches, pickle files or silent overwrites. Standard library only.
"""
import argparse
import hashlib
import json
import shutil
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def expected():
    receipt = json.loads((ROOT/'data/planner_evaluation.json').read_text(encoding='utf-8'))
    return {p: h for p, h in receipt['input_and_code_hashes'].items() if p.startswith('data/raw/')}


def safe(root, name):
    p = PurePosixPath(name)
    if p.is_absolute() or '..' in p.parts or ':' in name or '\\' in name:
        raise ValueError('Unsafe archive path: '+name)
    target = (root / name).resolve()
    if not target.is_relative_to(root.resolve()):
        raise ValueError('Path escapes destination: '+name)
    return target


def verify(source):
    hashes = expected()
    for name, value in hashes.items():
        if digest(safe(source, name)) != value:
            raise ValueError('Input hash mismatch: '+name)
    return hashes


def pack(source, archive):
    hashes = verify(source)
    if archive.exists():
        raise FileExistsError(archive)
    archive.parent.mkdir(parents=True, exist_ok=True)
    manifest = {'schema': 1, 'receipt_sha256': digest(ROOT/'data/planner_evaluation.json'),
                'sha256': hashes, 'bytes': {p: (source/p).stat().st_size for p in hashes}}
    with zipfile.ZipFile(archive, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        z.writestr('SHA256-MANIFEST.json', json.dumps(manifest, indent=2)+'\n')
        for name in sorted(hashes):
            z.write(source/name, name)
    # Keep an inspectable manifest beside the binary transfer, and a whole-archive digest.
    archive.with_suffix('.manifest.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
    archive.with_suffix('.sha256').write_text(digest(archive)+'  '+archive.name+'\n', encoding='utf-8')
    return {'archive': str(archive), 'files': len(hashes), 'bytes': archive.stat().st_size,
            'sha256': digest(archive)}


def unpack(archive, destination):
    with zipfile.ZipFile(archive) as z:
        names = z.namelist()
        hashes = expected()
        if len(names) != len(set(names)) or set(names) != set(hashes) | {'SHA256-MANIFEST.json'}:
            raise ValueError('Unexpected or duplicate archive members')
        manifest = json.loads(z.read('SHA256-MANIFEST.json'))
        if manifest['sha256'] != hashes or manifest['receipt_sha256'] != digest(ROOT/'data/planner_evaluation.json'):
            raise ValueError('Archive manifest does not match this repository receipt')
        # Validate the complete archive and every existing destination before writing anything.
        for name, value in hashes.items():
            target = safe(destination, name)
            if target.exists() and digest(target) != value:
                raise ValueError('Refusing different existing input: '+name)
            if z.getinfo(name).file_size != manifest['bytes'][name]:
                raise ValueError('Size mismatch: '+name)
            with z.open(name) as source:
                if hashlib.file_digest(source, 'sha256').hexdigest() != value:
                    raise ValueError('Corrupt archive member: '+name)
        for name in hashes:
            target = safe(destination, name)
            if target.exists():
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with z.open(name) as source, target.open('xb') as out:
                shutil.copyfileobj(source, out)
    verify(destination)
    return {'destination': str(destination), 'verified_files': len(hashes)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('pack'); p.add_argument('source', type=Path); p.add_argument('archive', type=Path)
    p = sub.add_parser('extract'); p.add_argument('archive', type=Path); p.add_argument('destination', type=Path)
    p = sub.add_parser('verify'); p.add_argument('source', type=Path, nargs='?', default=ROOT)
    a = parser.parse_args()
    if a.command == 'pack': result = pack(a.source, a.archive)
    elif a.command == 'extract': result = unpack(a.archive, a.destination)
    else: result = {'verified_files': len(verify(a.source))}
    print(json.dumps(result, indent=2))
