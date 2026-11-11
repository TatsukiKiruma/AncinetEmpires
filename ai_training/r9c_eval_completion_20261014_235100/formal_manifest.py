import pathlib,json,hashlib
r=pathlib.Path(__file__).resolve().parent;j=r.parent/'r9b_commander_stage_20261014_231000/joint';files=list((j/'independent_dev').glob('*.json'))+list((j/'independent_dev').glob('*.jsonl'))+[j/'models_frozen.json',j/'independent_dev_manifest.json']+list(j.glob('independent_results_*.json'));assert len(list((j/'independent_dev').glob('*.json')))==42
rows=[]
for p in files:
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 rows.append({'path':str(p.resolve()),'bytes':p.stat().st_size,'sha256':h.hexdigest()})
(r/'formal_artifact_manifest.json').write_text(json.dumps({'formalSlots':42,'files':rows,'scope':'Completed formal JSON and trajectories, frozen openings/models identity, full summaries; interrupted fragments excluded from formal outcomes'},indent=2),encoding='utf8')
