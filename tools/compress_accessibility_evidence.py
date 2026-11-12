"""Losslessly archive new verbose axe scans, keeping before evidence untouched."""
import gzip
import hashlib
import json
from pathlib import Path

root=Path(__file__).resolve().parents[1]/'audit/accessibility'
manifest=root/'axe-archive.json'
receipts=json.loads(manifest.read_text()) if manifest.exists() else {}
for directory in ['after', 'after-initial', 'after-final', 'verified']:
    for source in sorted((root/directory).glob('*-axe.json')):
        assert source.resolve().is_relative_to(root.resolve())
        content=source.read_bytes()
        destination=source.with_suffix('.json.gz')
        compressed=gzip.compress(content, mtime=0)
        if destination.exists():
            assert gzip.decompress(destination.read_bytes()) == content
        else:
            destination.write_bytes(compressed)
        assert gzip.decompress(destination.read_bytes()) == content
        receipts[source.relative_to(root).as_posix()]={
            'raw_sha256':hashlib.sha256(content).hexdigest(), 'raw_bytes':len(content),
            'archive':destination.relative_to(root).as_posix(),
            'archive_sha256':hashlib.sha256(destination.read_bytes()).hexdigest()}
        source.unlink()  # Verified reversible compression of task-created evidence only.
(root/'axe-archive.json').write_text(json.dumps(receipts,indent=2)+'\n')
print(json.dumps({'scans_preserved_losslessly':len(receipts),'raw_bytes':sum(v['raw_bytes'] for v in receipts.values())}))
