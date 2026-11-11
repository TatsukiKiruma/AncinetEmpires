#!/usr/bin/env python3
"""Read-only AncientEmpires snapshot integrity/raw-record audit. No training.
Usage: python audit_snapshot.py EXTRACTED_BUNDLE OUTPUT_DIRECTORY
"""
import argparse, collections, hashlib, json, statistics, zipfile
from pathlib import Path

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bundle', type=Path); parser.add_argument('output',type=Path)
    args=parser.parse_args(); root=args.bundle.resolve(); out=args.output.resolve()
    if out == root or root in out.parents:
        raise SystemExit('Keep audit outputs outside the source bundle.')
    out.mkdir(parents=True,exist_ok=True)
    def save(name,data):
        (out/name).write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    manifest=json.loads((root/'BUNDLE_MANIFEST.json').read_text(encoding='utf-8'))
    errors=[]
    for row in manifest['files']:
        p=(root/row['path']).resolve()
        if root not in p.parents:
            raise ValueError('Unsafe manifest path')
        if not p.is_file(): errors.append({'path':row['path'],'error':'missing'});continue
        b=p.read_bytes()
        if len(b)!=row['bytes'] or hashlib.sha256(b).hexdigest()!=row['sha256']:
            errors.append({'path':row['path'],'error':'mismatch'})
    zp=root/'provenance/AncientEmpires-clean-environment.original.zip'
    comparisons={}
    with zipfile.ZipFile(zp) as z:
        for sub in ['', 'ai_training/r4_teacher_stage_20261013_121700/env', 'ai_training/r5_eval_teacher_v2_20261014_023500/env']:
            differences=[];n=0
            for f in z.infolist():
                if f.is_dir():continue
                n+=1;p=root/sub/f.filename
                if not p.is_file() or p.read_bytes()!=z.read(f):differences.append(f.filename)
            comparisons[sub or 'root']={'n':n,'differences':differences}
    save('integrity_audit.json',{'filesVerified':len(manifest['files']),'manifestErrors':errors,'originalZipSha256':hashlib.sha256(zp.read_bytes()).hexdigest(),'environments':comparisons})
    s=root/'ai_training/r5_eval_teacher_v2_20261014_023500';timings=collections.defaultdict(list);wall=0
    for p in (s/'artifacts/failed_replays').glob('*.json'):
        d=json.loads(p.read_text(encoding='utf-8'));wall+=d['outcome']['wallDurationMs']
        for step in d['steps']:timings[d['policies'][str(step['playerId'])]].append(step['stepDurationMs'])
    summary={}
    for k,v in timings.items():
        vs=sorted(v);summary[k]={'n':len(v),'mean_ms':statistics.mean(v),'p50_ms':statistics.median(v),'p95_ms':vs[int(.95*len(v))],'max_ms':max(v),'over3000':sum(x>3000 for x in v),'sum_ms':sum(v),'wall_share':sum(v)/wall}
    save('timing_summary.json',summary)
    history={}
    for arm in ['trunk_full','head_kl']:
        rows=[]
        for p in (root/'ai_training/v19/out/coverage_20261004/arena/dev').glob(arm+'.m*.games.jsonl'):
            rows.extend(json.loads(line) for line in p.read_text(encoding='utf-8').splitlines() if line.strip())
        rows=[row for row in rows if row.get('arm')=='CANDIDATE']
        history[arm]={'records':len(rows),'outcomes':dict(collections.Counter(x.get('outcomeKind') for x in rows)),'maps':dict(collections.Counter(x.get('mapName') for x in rows)),'seat':dict(collections.Counter(x.get('candidateSeat') for x in rows))}
    save('historical_raw_counts.json',history)
    print(json.dumps({'verifiedFiles':len(manifest['files']),'integrityErrors':len(errors),'timingPolicies':list(summary),'historicalArms':history},ensure_ascii=False,indent=2))
    if errors:raise SystemExit(2)
if __name__=='__main__':main()
