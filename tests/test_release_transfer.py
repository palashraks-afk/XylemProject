"""Transfer must reject bad inputs and path escapes before modifying a destination."""
import importlib.util
from pathlib import Path
import hashlib
import json
import zipfile
import pytest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('preserved_inputs', ROOT/'tools/preserved_inputs.py')
transfer=importlib.util.module_from_spec(spec); spec.loader.exec_module(transfer)


def test_offline_transfer_preflight_and_roundtrip(tmp_path, monkeypatch):
    source=tmp_path/'source'; source.mkdir()
    (source/'data/raw').mkdir(parents=True)
    content=b'preserved bytes'; (source/'data/raw/a.txt').write_bytes(content)
    hashes={'data/raw/a.txt':hashlib.sha256(content).hexdigest()}
    monkeypatch.setattr(transfer,'expected',lambda:hashes)
    archive=tmp_path/'inputs.zip'; transfer.pack(source,archive)
    destination=tmp_path/'dest'; transfer.unpack(archive,destination)
    assert (destination/'data/raw/a.txt').read_bytes()==content
    (destination/'data/raw/a.txt').write_bytes(b'other work')
    with pytest.raises(ValueError, match='Refusing different'):
        transfer.unpack(archive,destination)
    assert (destination/'data/raw/a.txt').read_bytes()==b'other work'
    with pytest.raises(FileExistsError): transfer.pack(source,archive)
    # Even a correctly named member must be validated independently of its manifest.
    with zipfile.ZipFile(archive) as z: manifest=z.read('SHA256-MANIFEST.json')
    bad=tmp_path/'corrupt.zip'
    with zipfile.ZipFile(bad,'w') as z:
        z.writestr('SHA256-MANIFEST.json',manifest); z.writestr('data/raw/a.txt',b'x'*len(content))
    empty=tmp_path/'empty'
    with pytest.raises(ValueError,match='Corrupt archive'): transfer.unpack(bad,empty)
    assert not empty.exists()


@pytest.mark.parametrize('name',['../escape','C:/escape','data/../../escape','data\\raw\\escape'])
def test_transfer_rejects_path_escape(tmp_path,name):
    with pytest.raises(ValueError): transfer.safe(tmp_path,name)
