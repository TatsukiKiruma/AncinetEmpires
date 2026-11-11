"""只读审核面板隔离和封存拒绝路径，不执行测试前态读取或网络前向。"""
import json
from pathlib import Path
import subprocess
from core import HERE, ROOT, DATA, read, save, validate

validate()
dev=read(HERE/'OMNI_ARENA_DEV_PANEL.json')
test=read(HERE/'OMNI_ARENA_TEST_PANEL.json')
groups=[]
stats={}
for name,panel in [('dev',dev),('test',test)]:
    assert len(panel['matches'])==54
    assert len({m['id'] for m in panel['matches']})==54
    group={s['groupId'] for s in panel['slots'] if s['groupId']}
    groups.append(group)
    for n,expected in [(2,20),(3,18),(4,16)]:
        slots=[s for s in panel['slots'] if s['players']==n]
        matches=[m for m in panel['matches'] if panel['slots'][m['slot']]['players']==n]
        assert len(matches)==expected
        for slot in slots:
            assert sorted(m['seat'] for m in matches if m['slot']==slot['slot'])==list(range(n))
        stats[f'{name}/{n}']=dict(slots=len(slots),matches=len(matches),maps=sorted({s['map'] for s in slots}),
                                 categories=sorted({s['category'] for s in slots}))
    assert len(stats[f'{name}/3']['maps'])==4
assert not groups[0]&groups[1]
assert not (HERE/'FINAL_CANDIDATE_LOCK.json').exists()
assert not (HERE/'test-initial').exists()
assert not (DATA/'SEALED_ACCESS.jsonl').exists()
result=subprocess.run(['node','--import','tsx',str(HERE/'encode_server.ts'),'--sealed'],
    input='',text=True,capture_output=True,cwd=ROOT,timeout=30,
    creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
assert result.returncode!=0 and '唯一最终候选尚未锁定' in result.stderr
save(HERE/'OMNI_PANEL_AUDIT.json',dict(passed=True,stats=stats,devTestParentGroupIntersection=0,
    sealedRawAccessBeforeLock=0,sealedForwardBeforeLock=0,testInitialMaterialized=False,
    sealedEncoderRejectPassed=True,rejection=result.stderr,
    standardStartCaveat='八张官方双人标准初态属于共享已知图基准；仅附加父局和多人父局按分区隔离'))
print(json.dumps(dict(passed=True,devGames=54,testGames=54,sealedRejected=True)))
