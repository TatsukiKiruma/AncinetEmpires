"""完整保留提前停止版本的实际结果及strict，不补全未运行槽。"""
from pathlib import Path
import json,collections,sys,math
HERE=Path(__file__).resolve().parent;phase=sys.argv[1];folder=HERE/(phase+'-battles')/'slots'
def read(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
assert not [p for p in folder.glob('*/actions.jsonl') if not (p.parent/'result.json').exists()]
groups=collections.defaultdict(collections.Counter);panels=collections.defaultdict(collections.Counter);risks=collections.Counter();latencies=collections.defaultdict(list);actions=0;slots=0
for p in folder.glob('*/result.json'):
    r=read(p);strict=read(p.parent/'strict-replay.json');assert strict['passed'] and strict['actions']==r['actions'];actions+=strict['actions'];slots+=1;risks.update(strict['riskWitnessAudit'])
    s=r['slot'];key='/'.join([s.get('panel','fixed'),s['opponent'],s['model']]);groups[key][r['classification']]+=1;panels[s.get('panel','fixed')+'/'+s['model']][r['classification']]+=1;latencies[key]+=r['latencySamples']['model']
quantiles={}
for key,values in latencies.items():
    values.sort();quantiles[key]={k:values[max(0,math.ceil(q*len(values))-1)] if values else None for k,q in [('p50',.5),('p95',.95),('p99',.99)]}
result=dict(phase=phase,stopped=True,qualified=False,plannedSlots=150,completedSlots=slots,strictPassed=True,strictActions=actions,riskWitnessAudit=dict(risks),groups=dict(groups),panels=dict(panels),latencies=quantiles,reason=read(folder.parent/'STOP_NEW_SLOTS.json'),sourceFreeze='source-freeze-'+phase+'.json',independentEvaluation=False)
(HERE/f'{phase}-stopped-summary.json').write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
lines=[f'# {phase}停止新增槽位记录','',f'计划150槽，实际{slots}槽/{actions}动作及所有日志反扑见证strict通过。未运行槽不补全、不计为胜负。此版本未获得教师资格，不采样。','',str(result['reason']['reason']),'', '|组|实际分类|p50/p95/p99 ms|','|---|---|---|']
for key,v in groups.items():q=quantiles[key];lines.append(f'|{key}|{json.dumps(dict(v),ensure_ascii=False)}|{q["p50"]:.2f}/{q["p95"]:.2f}/{q["p99"]:.2f}|')
(HERE/(phase.upper().replace('-','_')+'_STOPPED.md')).write_text('\n'.join(lines),encoding='utf-8');print(json.dumps(dict(slots=slots,strictActions=actions,strictPassed=True)))
