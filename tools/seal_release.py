"""Write an inspectable local release receipt and review ZIP; no remote actions."""
import datetime
import hashlib
import json
import os
import subprocess
import sys
import zipfile
from pathlib import Path

root=Path(__file__).resolve().parents[1]
os.chdir(root)
os.environ['GIT_OPTIONAL_LOCKS']='0'
def digest(p):
    with p.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()
def read(p):return json.loads((root/p).read_text(encoding='utf-8'))
base='7e3b6d9a6b38e6cfed2fea1ee1a102caeb9dd008'
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==base
assert not subprocess.check_output(['git','diff',base,'--','pipeline','data','app/data','.github'])
saved=read('data/planner_evaluation.json')
presentation=read('audit/release-qa/presentation-provenance.json')
for name,expected in {**saved['input_and_code_hashes'],**saved['output_hashes']}.items():
    checked=root/name
    if name=='app/app.js':
        assert digest(checked)==presentation['current_sha256']
        checked=root/presentation['archived_path']
    assert digest(checked)==expected,name
browser=read('audit/release-qa/final-browser-checks.json')
assert browser['summary']=={'unique_checks':40,'passed':40,'unresolved_failures':0}
exports=read('audit/release-qa/export-reconciliation.json')
assert len(exports)==40 and all(x['python_membership']=='PASS' for x in exports)
for item in exports:assert digest(root/item['file'])==item['sha256']
for item in read('audit/release-qa/wheel-manifest.json'):
    assert digest(root.parent/'wheelhouse'/item['file'])==item['sha256']
package=read('audit/release-qa/input-package.json')
assert digest(root.parent/'preserved-inputs.zip')==package['sha256']
excluded={'audit/release-qa/release-file-sha256.json','audit/release-qa/release-receipt.json'}
names=sorted(set(subprocess.check_output(['git','ls-files','-co','--exclude-standard','-z']).decode().split('\0'))-excluded-{''})
hashes={name:digest(root/name) for name in names if (root/name).is_file()}
manifest=root/'audit/release-qa/release-file-sha256.json'
manifest.write_text(json.dumps(hashes,indent=2)+'\n')
archive=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else root.parent/'xylem-california-v1-review.zip'
if archive.exists():raise FileExistsError(archive)
with zipfile.ZipFile(archive,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for name in hashes:z.write(root/name,name)
    z.write(manifest,manifest.relative_to(root).as_posix())
receipt={'generated_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'base_commit':base,
         'branch':subprocess.check_output(['git','branch','--show-current'],text=True).strip(),
         'model_pipeline_data_workflow_unchanged':True,'evaluated_hashes_verified':len(saved['input_and_code_hashes'])+len(saved['output_hashes']),
         'raw_files_verified':sum(n.startswith('data/raw/') for n in saved['input_and_code_hashes']),
         'snapshot_id':read('app/data/snapshot.json')['id'],'browser_checks':browser['summary'],
         'independent_csv_reproductions':len(exports),'python_tests':'121 passed; audit/release-qa/tests-final.log',
         'optimizer_parity_cases':110,'delivery_files':len(hashes),'delivery_manifest_sha256':digest(manifest),
         'review_archive':str(archive),'review_archive_bytes':archive.stat().st_size,'review_archive_sha256':digest(archive),
         'review_archive_note':'Code, docs, saved results and QA evidence; no Git database, virtual environments or ignored large raw inputs. Full setup should use a Git clone plus the separate preserved-input ZIP/wheelhouse.',
         'input_archive':package,'remote_actions':'none; no push, PR, deployment, publication or outreach',
         'unverified':['full clean model-training rerun','physical phones, Safari/Firefox and screen readers','practitioner usefulness','validated annual or multi-year failure probabilities']}
(root/'audit/release-qa/release-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2))
