"""从实际决策台账复核旧搜索策略的内部异常与随机合同。"""
import pathlib,json,collections
S=pathlib.Path(__file__).resolve().parents[1];out=[]
for name in ['b100_q','b100_r']:
    games=[];configs=set();kinds=collections.Counter()
    for g in range(20):
        decisions=0;maxexc=0;internal=0;calls=0;last_rng=None
        with (S/f'runs/dev_{name}/game_{g}.jsonl').open(encoding='utf8') as f:
            for line in f:
                x=json.loads(line);d=x.get('diagnostics')
                if not d:continue
                q=d['decision'];decisions+=1;maxexc=max(maxexc,d['exceptions']);internal+=q['internalExceptions'];configs.add(json.dumps(d['config'],sort_keys=True));kinds[q['queryKeyKind']]+=1
                assert q['chosenInAllowed'] and q['chosenActionCode']==x['actionCode']
                if name=='b100_r':
                    if last_rng is not None:assert q['rngBeforeHex']==last_rng
                    last_rng=q['rngAfterHex'];calls+=q['rngCalls']
        games.append({'game':g,'decisions':decisions,'exceptionCounter':maxexc,'internalExceptionEvents':internal,'rngCalls':calls if name=='b100_r' else None})
    assert len(configs)==1
    out.append({'strategy':name,'games':games,'config':json.loads(next(iter(configs))),'queryKeyKinds':dict(kinds),'exceptionCounterTotal':sum(g['exceptionCounter'] for g in games),'rngNote':'R使用诊断中的持久状态；Q每状态独立派生，通用runner RNG不是B100内部随机状态。'})
(S/'evidence/b100_runtime_audit.json').write_text(json.dumps({'passed':True,'strategies':out},ensure_ascii=False,indent=2),encoding='utf8');print([(r['strategy'],r['exceptionCounterTotal'],r['queryKeyKinds']) for r in out])
