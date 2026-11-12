"""Independently reproduce each captured browser/demo CSV in the Python optimizer."""
import csv
import hashlib
import io
import json
import math
import re
import sys
from pathlib import Path
from urllib.parse import parse_qs

import numpy as np

root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'pipeline'))
from optimizer import optimize

systems=json.loads((root/'app/data/systems.json').read_text())
routes=json.loads((root/'app/data/routes.json').read_text())['routes']
snapshot=json.loads((root/'app/data/snapshot.json').read_text())['id']
equity=np.array([np.mean([v for v in s['eq'] if v is not None]) if any(v is not None for v in s['eq']) else np.nan for s in systems])
equity=np.where(np.isnan(equity),np.nanmedian(equity),equity)
results=[]
for file in sorted(list((root/'audit/release-qa/browser').glob('*.csv'))+list((root/'audit/demo').glob('*.csv'))):
    text=file.read_text(encoding='utf-8-sig')
    assert snapshot in text
    query=parse_qs(re.search(r'; scenario ([^;]+);',text).group(1))
    st={k: (v[0] if k=='v' else float(v[0])) for k,v in query.items()}
    costs=[min(s['cost'],routes[s['id']]['cost'])*st['m'] if st['c'] and s['id'] in routes and routes[s['id']]['viable'] else s['cost']*st['m'] for s in systems]
    weights=[1 if s['failing'] else st['a'] if st['v']=='fixed' else 1-(1-s['pf'])**st['h'] for s in systems]
    benefit=[s['pop']*w*(1+st['l']*e) for s,w,e in zip(systems,weights,equity)]
    chosen=optimize(costs,benefit,[s['conn'] for s in systems],st['b']*1e6,st['r'])
    rows=list(csv.DictReader(io.StringIO('\n'.join(l for l in text.splitlines() if not l.startswith('#')))))
    assert sorted(r['water_system_id'] for r in rows)==sorted(systems[i]['id'] for i in chosen),file
    assert sum(int(r['people']) for r in rows)==sum(systems[i]['pop'] for i in chosen)
    assert math.isclose(sum(float(r['cost_usd']) for r in rows),sum(costs[i] for i in chosen),abs_tol=0.0001,rel_tol=0)
    by_id={s['id']:i for i,s in enumerate(systems)}
    for r in rows:
        i=by_id[r['water_system_id']]
        assert math.isclose(float(r['cost_usd']),costs[i],abs_tol=0.0001,rel_tol=0)
        assert math.isclose(float(r['allocation_weight']),weights[i],abs_tol=1e-12,rel_tol=0)
        if systems[i]['pf'] is not None: assert float(r['snapshot_probability'])==systems[i]['pf']
    assert sum(max(1,math.ceil(costs[i]/250000))*250000 for i in chosen)<=st['b']*1e6
    results.append({'file':file.relative_to(root).as_posix(),'systems':len(chosen),'people':sum(systems[i]['pop'] for i in chosen),'cost':sum(costs[i] for i in chosen),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'python_membership':'PASS'})
(root/'audit/release-qa/export-reconciliation.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps({'matched_csv_exports':len(results),'result':'PASS'}))
