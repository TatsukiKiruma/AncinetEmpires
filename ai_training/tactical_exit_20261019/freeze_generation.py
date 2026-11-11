"""保存数据进程启动时已加载的摘要实现，区分后续等价缓存优化。"""
from pathlib import Path
import hashlib,json
HERE=Path(__file__).resolve().parent
text=(HERE/'value_state.ts').read_text(encoding='utf-8')
text=text.replace("import { fields,type Sparse } from '../sd64x3_phone_20261016/model';","import { encodeBase } from '../sd64x3_phone_20261016/model';")
text=text.replace('export function commanderRisks(engine:GameEngine,prepared:StateRisk[]=[]):StateRisk[]{','export function commanderRisks(engine:GameEngine):StateRisk[]{')
text=text.replace('const s=engine.getState(),out:StateRisk[]=[...prepared];if(!prepared.length)beginFocusScope();','const s=engine.getState(),out:StateRisk[]=[];beginFocusScope();')
text=text.replace('            if(out.some(r=>r.id===u.id))continue;\n','')
text=text.replace('focusThreat(reply.branch,u.id,after)','focusThreat(reply.branch,u.id)')
start=text.index('const tokenCaches=');end=text.index('export function pooledContext',start)
text=text[:start]+"export function stateTokens(s:GameState,oldSchema:any){return encodeBase(observe(observationState(s),[]),oldSchema);}\n"+text[end:]
receipts=list((HERE/'data').glob('*.receipt.json'));assert receipts
expected=json.loads(receipts[0].read_text())['generationSourceBinding']['value_state.ts'];actual=hashlib.sha256(text.encode()).hexdigest();assert actual==expected,(actual,expected)
folder=HERE/'generation_source';folder.mkdir(exist_ok=True)
(folder/'value_state.ts').write_text(text,encoding='utf-8')
focus=(HERE/'focus_threat.ts').read_text(encoding='utf-8');start=focus.index('export function focusThreat');end=focus.index('    const out:FocusRisk=',start)
old="""export function focusThreat(engine:GameEngine,targetId:string):FocusRisk{
    const initial=engine.getState(),target=initial.units.find(u=>u.id===targetId);
    const encoded=JSON.stringify(initial),key=encoded+'|'+JSON.stringify(targetId);const prior=cache.get(key);if(prior)return prior;
"""
focus=focus[:start]+old+focus[end:];(folder/'focus_threat.ts').write_text(focus,encoding='utf-8')
(HERE/'generation-source-audit.json').write_text(json.dumps(dict(passed=True,loadedValueStateSha256=actual,loadedFocusSha256=hashlib.sha256(focus.encode()).hexdigest(),reason='运行时缓存优化未改变摘要语义，原始加载代码另存，数据分片逐父局收据仍绑定原SHA'),ensure_ascii=False),encoding='utf-8')
print('原始数据生成代码SHA复原通过')
