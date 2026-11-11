"""从原始动作重算时延、节点、覆盖和配对不确定性，不平均各局分位数。"""
import gzip
import json
import math
import random
from collections import Counter
from pathlib import Path
DIR=Path(__file__).resolve().parent


def quantiles(values):
    values=sorted(values)
    def q(p):
        if not values:return None
        x=(len(values)-1)*p;i=int(x);return values[i]+(values[min(i+1,len(values)-1)]-values[i])*(x-i)
    return dict(count=len(values),p50=q(.5),p95=q(.95),p99=q(.99),max=q(1))


def paired(a,b):
    right={r['id']:r for r in b};new=lost=n=0
    for old in a:
        candidate=right.get(old['id'])
        if not candidate or not old['natural'] or not candidate['natural']:continue
        n+=1;new+=old['outcome']!='win' and candidate['outcome']=='win';lost+=old['outcome']=='win' and candidate['outcome']!='win'
    discordant=new+lost;p=min(1.,2*sum(math.comb(discordant,k) for k in range(min(new,lost)+1))/2**discordant) if discordant else 1.
    return dict(naturalComparablePairs=n,newWins=new,lostWins=lost,exactMcNemarTwoSided=p,qualification='开发结果、地图相关及多重比较未校正，不证明稳定泛化')


def summary(folder):
    totals=Counter();roots=[];queue=[];opponent=[];stops=Counter();network_known=False;coverage_known=False
    for result_file in Path(folder).glob('*/result.json'):
        result=json.loads(result_file.read_text('utf-8'));totals['games']+=1;totals[result['outcome']]+=1
        for name in ['runtimeDecisions','nativeFallbacks','rejectedPlans','runtimeErrors']:totals['hard_'+name]+=result['hardTelemetry'][name]
        with gzip.open(result_file.parent/'actions.jsonl.gz','rt',encoding='utf-8') as f:
            for line in f:
                row=json.loads(line);t=row['telemetry'];totals['actualActions']+=1
                if row['side']!='model':opponent.append(row['elapsedMs']);continue
                if t.get('queued'):queue.append(row['elapsedMs']);continue
                roots.append(row['elapsedMs']);stops[t.get('stopReason','legacy_contract')]+=1
                totals['over4000']+=row['elapsedMs']>4000;totals['ownNodes']+=t.get('ownNodes',t.get('nodes',0));totals['responseNodes']+=t.get('responseNodes',0)
                if 'networkCalls' in t:network_known=True
                if 'rootLegal' in t:coverage_known=True
                for name in ['networkCalls','networkMs','encodeCalls','encodeMs','cloneMs','clones','legalMs','legalCalls','responseChains','responseComplete','responseTruncated']:totals[name]+=t.get(name,0)
                totals['candidateLegal']+=t.get('rootLegal',0);totals['candidateExplored']+=len(t.get('rootCovered',[]));totals['candidateOmitted']+=len(t.get('rootOmitted',[]))
    return dict(totals=totals,rootLatency=quantiles(roots),queueLatency=quantiles(queue),opponentLatency=quantiles(opponent),stopReasons=stops,
                candidateCoverage=totals['candidateExplored']/max(1,totals['candidateLegal']) if coverage_known else None,networkTelemetryAvailable=network_known,
                legacyRetaliationNodesUnknown=not network_known,qualification='旧搜索nodes不包含被重置的反扑计数；不得与新总节点直接等同')


def main():
    result={}
    for directory in (DIR/'controls').glob('*') if (DIR/'controls').exists() else []:
        if directory.is_dir():result[directory.name]=summary(directory)
    baseline=DIR/'controls/old-frozen/summary.json'
    pairs={}
    if baseline.exists():
        left=json.loads(baseline.read_text('utf-8'))['results']
        for p in (DIR/'controls').glob('*/summary.json'):pairs[p.parent.name]=paired(left,json.loads(p.read_text('utf-8'))['results'])
    final_file=DIR/'final-evaluation/summary.json';final=None
    if final_file.exists():
        final=json.loads(final_file.read_text('utf-8'));groups={}
        for r in final['results']:groups.setdefault(r['job']['openingLineage'],[]).append(float(r['outcome']=='win'))
        values=[sum(v)/len(v) for v in groups.values()];rng=random.Random(221966910)
        bootstrap=sorted(sum(rng.choice(values) for _ in values)/len(values) for _ in range(5000))
        final['clusterWinFraction95']=[bootstrap[124],bootstrap[4874]]
        final['uncertaintyQualification']='按预登记开局谱系整组重抽样；以全部尝试为分母的自然胜比例。地图相关、未知历史谱系和候选选择使其不能解释为所有地图总体置信区间。'
        final['performance']=summary(DIR/'final-evaluation')
    (DIR/'COMPARISONS.json').write_text(json.dumps(dict(controls=result,pairedAgainstFrozen=pairs,final=final),ensure_ascii=False,indent=2),'utf-8')


if __name__=='__main__':main()
