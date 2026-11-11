"""保留未采纳的旧single_threat实验，使用独立名字完成本次共享缓存模块。"""
from pathlib import Path
import json,hashlib
HERE=Path(__file__).resolve().parent;REV=HERE/'revisions/r19'
old=(HERE.parent/'tactical_scale_20261018/threat.ts').read_text(encoding='utf-8')
tail=old[old.index('/** 下一敌方回合'):]
imports=old[:old.index('export interface Exposure')].replace(', getMoveCostForUnit','')
prefix=old[old.index('export interface Exposure'):old.index('let moveCache')]
local=imports+"import { beginMovementScope,cachedThreatMoves } from './movement_query_cache';\n"+prefix+'''/** 单军与集火共享权威移动集合；风险结果仍分别计算。 */
export function beginThreatScope(){beginMovementScope();}
function cachedMoves(engine:GameEngine,state:GameState,enemy:Unit){return cachedThreatMoves(engine,enemy,state);}

'''+tail
with (HERE/'shared_single_threat.ts').open('x',encoding='utf-8',newline='') as f:f.write(local)
for n in ['model_battle_search_ai.ts','leaf.ts','combined_tactics.ts']:
    p=HERE/n;s=p.read_text(encoding='utf-8');assert '../tactical_scale_20261018/threat' in s
    p.write_text(s.replace('../tactical_scale_20261018/threat','./shared_single_threat'),encoding='utf-8',newline='')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
r=dict(passed=True,referenceSha256=sha(HERE.parent/'tactical_scale_20261018/threat.ts'),currentSha256=sha(HERE/'shared_single_threat.ts'),algorithmTailExact=local[local.index('/** 下一敌方回合'):]==tail,historicalFilesUnchanged=True,oldSingleThreatExperimentPreserved=sha(HERE/'single_threat.ts'))
(REV/'single-threat-source-identity.json').write_text(json.dumps(r),encoding='utf-8')
(HERE/'TASK_STATE.json').write_text(json.dumps(dict(status='running',complete=False,phase='R19核验单军/集火共享移动缓存；R18完整失败已冻结；专家0'),ensure_ascii=False),encoding='utf-8');print(json.dumps(r))
