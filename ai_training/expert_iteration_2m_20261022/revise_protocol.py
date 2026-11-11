"""正式对局前修订未运行计划：核验地图，配对换边，区分不同来源的谱系。"""
import hashlib
import json
from pathlib import Path
DIR=Path(__file__).resolve().parent


def main():
    maps=[r['name'] for r in json.loads((DIR/'available-maps.json').read_text('utf-8')) if r['playerCount']==2]
    assert len(maps)==8
    protocol=json.loads((DIR/'protocol.json').read_text('utf-8'))
    target=DIR/'protocol-v2.json';assert not target.exists()
    plan=[]
    for g in range(1,4):
        for i in range(200):
            family=i//2;opponent='Original-APKlikeAI-Hard' if i<100 else 'self' if ((i-100)//2)%2==0 else 'historical'
            plan.append(dict(id=f'g{g}-{i:03}',generation=g,split='train',map=maps[family%8],seat=i%2,opponent=opponent,seed=22100000+g*10000+family,
                openingLineage=f'g{g}-family-{family:03}',budgetMs=4000,explorationTemperature=0,setup=dict(initialGold=300,unitLimit=30,levelCap=3)))
    protocol.update(revision=2,reason='初版存在不可用地图名及地图/座位混杂；在正式对局之前修正，原件保留',samplingPlan='sampling-plan-v2.json',
        finalPlan=[dict(id=f'final-{i:03}',map=maps[(i//2)%8],seat=i%2,seed=99221000+i//2,openingLineage=f'final-family-{i//2:03}') for i in range(100)],
        finalStatus='尚未封存独立开局；必须按谱系与训练/开发排重后冻结，不能直接把标准初态不同seed称独立测试',
        sourceSampling=dict(nativePolicy=.01,nativeNaturalValue=.08,historicalReplayPolicy=.2,newHumanPrefix=1,perGameLimit=None,totalLimit=None),
        valueSelection='独立摘要抽样双方全部阶段，不按胜方/击杀/占领筛选；漂移状态关闭Value',
        runtimeOpponentIdentity='项目移植Original-APKlikeAI-Hard；与缺失的困难APK原生数据分别标记',
        concurrencySelection='工程探针8进程总吞吐较高，单根节点减少约20%；正式对局并发仍需小批量验证',
        completion=False)
    target.write_text(json.dumps(protocol,ensure_ascii=False,indent=2),'utf-8')
    (DIR/'sampling-plan-v2.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2),'utf-8')
    (DIR/'RUN_STATE.json').write_text(json.dumps(dict(status='engineering_and_short_training',overallComplete=False,protocol='protocol-v2.json',protocolSha256=hashlib.sha256(target.read_bytes()).hexdigest(),formalPretrainingComplete=False,generationsComplete=0,sampledFormalParents=0,finalEvaluationGames=0,guiDeployed=False),ensure_ascii=False,indent=2),'utf-8')


if __name__=='__main__':main()
