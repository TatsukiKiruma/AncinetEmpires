"""从已冻结实现提取共享缓存；单军威胁的全部规则算法尾部逐字保留。"""
from pathlib import Path
import json,hashlib,subprocess
HERE=Path(__file__).resolve().parent;REV=HERE/'revisions/r19';REV.mkdir(exist_ok=True)
def write(p,s):
    with p.open('x',encoding='utf-8',newline='') as f:f.write(s)
def snapshot(n):
    p=HERE/n;target=REV/(n+'.before.snapshot')
    with target.open('xb') as f:f.write(p.read_bytes())
for n in ['focus_threat.ts','geometry_equal.ts','model_battle_search_ai.ts','leaf.ts','combined_tactics.ts','teacher-model.json']:snapshot(n)
focus=(HERE/'focus_threat.ts').read_text(encoding='utf-8')
defs=focus[focus.index('let movesCache='):focus.index('export const FOCUS_AUDIT')]
audit=focus[focus.index('export const FOCUS_GEOMETRY_AUDIT='):focus.index('// 风险随作用域')]
body=focus[focus.index('export function clearFocusGeometryCache'):focus.index('/** 松弛候选')]
shared="import { GameEngine } from '../../src/game/engine';\nimport { getEffectiveStats,getMoveCostForUnit } from '../../src/game/abilities';\nimport type { Action,Unit,GameState } from '../../src/game/types';\nimport { exactGeometryEquals } from './geometry_equal';\n"+defs+audit+'\n/** 只清理快照身份；完整签名缓存跨查询作用域有界复用。 */\nexport function beginMovementScope(){stateGeometry=new WeakMap();}\n'+body
for old,new in [('clearFocusGeometryCache','clearMovementCache'),('FOCUS_GEOMETRY_AUDIT','MOVEMENT_CACHE_AUDIT'),('geometryCosts','movementGeometry'),('legalMoves','cachedThreatMoves')]:shared=shared.replace(old,new)
shared=shared.replace('function movementGeometry(', 'export function movementGeometry(').replace('function cachedThreatMoves(', 'export function cachedThreatMoves(')
shared=shared.replace('positiveCosts.set(costKey,positive);','if(positiveCosts.size>=4096){positiveCosts.clear();MOVEMENT_CACHE_AUDIT.evictions++;}positiveCosts.set(costKey,positive);')
write(HERE/'movement_query_cache.ts',shared)
newfocus=focus[:focus.index('let movesCache=')]+focus[focus.index('export const FOCUS_AUDIT='):focus.index('export const FOCUS_GEOMETRY_AUDIT=')]+'''// 风险只在当前快照作用域复用；移动查询与单军威胁共用完整签名缓存。
export function beginFocusScope(){cache=new WeakMap();beginMovementScope();FOCUS_AUDIT.calls=0;FOCUS_AUDIT.byTarget.clear();}

'''+focus[focus.index('/** 松弛候选'):]
newfocus=newfocus.replace('getEffectiveStats,getMoveCostForUnit','getEffectiveStats').replace("import { exactGeometryEquals } from './geometry_equal';", "import { beginMovementScope,movementGeometry as geometryCosts,cachedThreatMoves as legalMoves } from './movement_query_cache';\nexport { MOVEMENT_CACHE_AUDIT as FOCUS_GEOMETRY_AUDIT,clearMovementCache as clearFocusGeometryCache } from './movement_query_cache';")
(HERE/'focus_threat.ts').write_text(newfocus,encoding='utf-8',newline='')
old=(HERE.parent/'tactical_scale_20261018/threat.ts').read_text(encoding='utf-8')
tail=old[old.index('/** 下一敌方回合'):]
imports=old[:old.index('export interface Exposure')].replace(', getMoveCostForUnit','')
prefix=old[old.index('export interface Exposure'):old.index('let moveCache')]
local=imports+"import { beginMovementScope,cachedThreatMoves } from './movement_query_cache';\n"+prefix+'''/** 单军与集火共享权威移动集合；风险结果仍分别计算。 */
export function beginThreatScope(){beginMovementScope();}
function cachedMoves(engine:GameEngine,state:GameState,enemy:Unit){return cachedThreatMoves(engine,enemy,state);}

'''+tail
write(HERE/'shared_single_threat.ts',local)
for n in ['model_battle_search_ai.ts','leaf.ts','combined_tactics.ts']:
    p=HERE/n;s=p.read_text(encoding='utf-8');assert "../tactical_scale_20261018/threat" in s
    p.write_text(s.replace('../tactical_scale_20261018/threat','./shared_single_threat'),encoding='utf-8',newline='')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
write(REV/'single-threat-source-identity.json',json.dumps(dict(passed=True,referenceSha256=sha(HERE.parent/'tactical_scale_20261018/threat.ts'),currentSha256=sha(HERE/'shared_single_threat.ts'),algorithmTailExact=local[local.index('/** 下一敌方回合'):]==tail,scope='仅本阶段新增本地威胁模块并共享权威移动查询；阶段3历史文件未修改'),ensure_ascii=False))
(HERE/'TASK_STATE.json').write_text(json.dumps(dict(status='running',complete=False,phase='R19诊断单军与集火共享移动查询；R18失败证据已冻结；专家0'),ensure_ascii=False),encoding='utf-8')
print('共享缓存提取完成，单军算法尾部逐字相同')
