"""Compare browser-equivalent plans on preserved and refreshed app snapshots."""
import csv
import hashlib
import json
from pathlib import Path

import numpy as np

from optimizer import optimize, greedy_by_population

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'audit/allocation-comparison'
SETTINGS = {
    'default': {}, 'no_equity': {'l': 0}, 'high_equity': {'l': 2},
    'small_reserve_30pct': {'r': .3}, 'routes': {'c': 1},
    'equity_reserve_routes': {'l': 2, 'r': .3, 'c': 1},
    'one_year': {'h': 1}, 'ten_year': {'h': 10},
    'fixed_share_50pct': {'v': 'fixed'},
    'half_cost': {'m': .5}, 'double_cost': {'m': 2},
}


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def plan(data, scenario):
    systems, summary, routes = data
    st = {'l': 1, 'r': 0, 'h': 5, 'v': 'fc', 'a': .5, 'c': 0, 'm': 1, **scenario}
    eq = np.array([np.mean([v for v in s['eq'] if v is not None])
                   if any(v is not None for v in s['eq']) else np.nan for s in systems])
    eq = np.where(np.isnan(eq), np.nanmedian(eq), eq)
    costs = [min(s['cost'], routes[s['id']]['cost']) * st['m']
             if st['c'] and s['id'] in routes and routes[s['id']]['viable'] else s['cost'] * st['m']
             for s in systems]
    fallback = summary.get('fallback_at_risk_probability')
    if fallback is None:
        # Both old and new systems already contain the actual exported fallback.
        if any(s['pf'] is None and not s['failing'] for s in systems):
            raise ValueError('Missing exported At-Risk weight')
    weights = [1 if s['failing'] else st['a'] if st['v'] == 'fixed'
               else 1-(1-s['pf'])**st['h'] for s in systems]
    benefits = [s['pop']*w*(1+st['l']*e) for s, w, e in zip(systems, weights, eq)]
    chosen = optimize(costs, benefits, [s['conn'] for s in systems], st['b']*1e6, st['r'])
    baseline = greedy_by_population(costs, [s['pop'] for s in systems],
                                    [s['failing'] for s in systems], st['b']*1e6)
    k = summary['budgets_musd'].index(st['b'])
    stability_ok = not st['c'] and not st['r'] and st['m'] == 1 and st['v'] == 'fc' and st['l'] <= 2
    frequencies = [systems[i]['p'][k] for i in chosen]
    return {'systems': len(chosen), 'people': sum(systems[i]['pop'] for i in chosen),
            'cost_usd': sum(costs[i] for i in chosen),
            'rounded_budget_usd': sum(max(1, int(np.ceil(costs[i]/250000)))*250000 for i in chosen),
            'objective': sum(benefits[i] for i in chosen),
            'failing_systems': sum(systems[i]['failing'] for i in chosen),
            'small_systems': sum(systems[i]['conn'] <= 500 for i in chosen),
            'dac_people': sum(systems[i]['pop'] for i in chosen if (systems[i]['eq'][0] or 0)>0),
            'baseline_people': sum(systems[i]['pop'] for i in baseline),
            'mean_selection_frequency': float(np.mean(frequencies)) if stability_ok else None,
            'share_selected_in_half_scenarios': float(np.mean(np.array(frequencies)>=.5)) if stability_ok else None,
            'selected_ids': sorted(systems[i]['id'] for i in chosen)}


def dataset(path):
    return read(path/'systems.json'), read(path/'summary.json'), read(path/'routes.json')['routes']


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    old = dataset(ROOT/'audit/app-before/data')
    new = dataset(ROOT/'app/data')
    assert [s['id'] for s in old[0]] == [s['id'] for s in new[0]], 'Population changed'
    detail, rows, changes = [], [], []
    for label, settings in SETTINGS.items():
        for budget in new[1]['budgets_musd']:
            scenario = {'b': budget, **settings}
            before, after = plan(old, scenario), plan(new, scenario)
            a, b = set(before['selected_ids']), set(after['selected_ids'])
            entry = {'setting': label, 'budget_musd': budget, 'scenario': scenario,
                     'old': before, 'new': after, 'retained': len(a&b),
                     'added': sorted(b-a), 'removed': sorted(a-b),
                     'jaccard': len(a&b)/len(a|b) if a|b else 1,
                     'retention': len(a&b)/len(a) if a else 1}
            detail.append(entry)
            row = {'setting': label, 'budget_musd': budget, 'retained': len(a&b),
                   'added': len(b-a), 'removed': len(a-b), 'jaccard': entry['jaccard'],
                   'retention': entry['retention']}
            for prefix, result in [('old', before), ('new', after)]:
                row.update({prefix+'_'+k: v for k, v in result.items() if k != 'selected_ids'})
            rows.append(row)
            for system in new[0]:
                sid = system['id']
                if (sid in a) != (sid in b):
                    changes.append({'setting': label, 'budget_musd': budget, 'id': sid,
                                    'name': system['name'], 'people': system['pop'],
                                    'old_selected': sid in a, 'new_selected': sid in b})
    (OUT/'plans.json').write_text(json.dumps(detail, indent=2)+'\n', encoding='utf-8')
    for filename, data in [('summary.csv', rows), ('membership-changes.csv', changes)]:
        with (OUT/filename).open('w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=list(data[0]))
            writer.writeheader()
            writer.writerows(data)
    lines = ['# Local allocation comparison', '',
        'Same saved California population and raw input bytes; corrected historical features, training-only reselection/calibration, training-rate fallback and full-precision browser inputs. No causal intervention benefit is measured.', '',
        'Old plans are recomputed from the preserved exported browser values; the original Python summary is retained in `../app-before/data/summary.json`. Its hidden pre-export precision can produce different plans. New Python summaries and browser inputs use identical precision.', '',
        'Defaults: equity 1, five-year exploratory horizon, no small-system reserve, routes off, cost multiplier 1. Dollar costs are modeled; the constant-annual-risk horizon conversion is unvalidated.', '',
        '| Budget | Systems old→new | Modeled people old→new | Cost $M old→new | Added / removed | Jaccard | Stress frequency old→new |',
        '|---|---:|---:|---:|---:|---:|---:|']
    for d in detail[:5]:
        a,b=d['old'],d['new']
        lines.append(f"| ${d['budget_musd']}M | {a['systems']}→{b['systems']} | {a['people']:,}→{b['people']:,} | {a['cost_usd']/1e6:.3f}→{b['cost_usd']/1e6:.3f} | {len(d['added'])} / {len(d['removed'])} | {d['jaccard']:.1%} | {a['mean_selection_frequency']:.1%}→{b['mean_selection_frequency']:.1%} |")
    lines += ['', '## Definitions and inspection', '',
        '- Systems: unique selected IDs. Modeled people: sum of their saved populations, with no adjustment for population overlap or actual remediation outcomes.',
        '- Cost: sum of effective modeled system costs (including cheaper viable route costs where enabled), before conservative $250,000 rounding used by the optimizer.',
        '- Membership stability: Jaccard = intersection / union; retention = intersection / old selected. Added/removed lists and both complete selected-ID sets are in `plans.json`; names and populations of changes are in `membership-changes.csv`.',
        '- Stress frequency: mean saved selection frequency among the selected systems, over 200 fixed-seed scenarios that vary costs, equity 0–2 and horizon 1–10. It is not outcome probability or repeatability at the displayed controls. Stored no-reserve/no-route scenarios are not reported for reserve, routing, fixed-share or cost-multiplier alternatives.',
        '- `summary.csv` contains all 55 plans: five budgets across defaults, equity 0 and 2, reserve 30%, routing, equity+reserve+routing, horizons 1 and 10, fixed share 50%, and costs 0.5× and 2×. These settings were chosen to cover existing controls, without consulting diagnostic outcomes.',
        '- All inputs and outputs are SHA-256 bound in `sha256.json`. The old snapshot is preserved byte-for-byte under `../app-before/`.', '',
        'Reproduce: `python pipeline/compare_allocations.py`.']
    (OUT/'README.md').write_text('\n'.join(lines)+'\n', encoding='utf-8')
    inputs = list((ROOT/'audit/app-before/data').iterdir()) + list((ROOT/'app/data').iterdir())
    paths = inputs + [OUT/n for n in ('plans.json', 'summary.csv', 'membership-changes.csv')]
    (OUT/'sha256.json').write_text(json.dumps({p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                                              for p in sorted(paths) if p.is_file()}, indent=2)+'\n')
    print('\n'.join(lines[6:14]))


if __name__ == '__main__':
    main()
