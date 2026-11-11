"""在新资格评测前登记共享根编码提议方案，保留旧协议与失败原件。"""
from pathlib import Path
import json,hashlib,datetime,shutil
from numeric_receipt_valid import numeric_receipt_valid
HERE=Path(__file__).resolve().parent
read=lambda n:json.loads((HERE/n).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
save=lambda n,v:(HERE/n).write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf-8')
assert numeric_receipt_valid(HERE,'proposal')
assert read('proposal-reuse-gate.json')['passed']
assert read('teacher-r15-stopped-summary.json')['strictPassed']
revision=HERE/'revisions/r16';revision.mkdir(parents=True,exist_ok=True)
for name in ['model_battle_search_ai.ts','audit_search_risks.ts','candidate_proposal.ts','browser-proposal.json','numeric-proposal.json','proposal-reuse-gate.json','teacher-r15-stopped-summary.json']:
    target=revision/('registered-'+name)
    assert not target.exists(),target
    shutil.copy2(HERE/name,target)
p=read('search_scale_protocol_v2.json')
p.update(version='search-scale-v3',registeredAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),executeAfter='R15全部62842实际动作strict通过；新资格前登记',purpose='保留阶段4默认策略及极速Value，用720/180扩量策略共享根编码提议一条原Top6之外候选，由现有真实叶子及全部安全守卫决定是否采用',candidateCollection='相同Top6/24/150节点；保留默认、关键事件和安全根，再加入至多一个原候选外扩量策略提议；分支策略前向仍为0',rootProposal={'file':'base-policy-final.json','sha256':sha(HERE/'base-policy-final.json'),'training':'原720训练父局全覆盖；180开发仅校准，尚无专家自走或蒸馏','additionalRootForwards':1,'additionalFeatureEncodes':0,'candidateCountIncrease':0,'primaryPolicyUnchanged':True,'valueUnchanged':True},retiredExperiment='R15固定22/30胜，低于pure24；不采专家。Veto固定叶子目标保留，候选覆盖引入扩量策略提议。')
assert not (HERE/'search_scale_protocol_v3.json').exists()
save('search_scale_protocol_v3.json',p)
save('ACTIVE_SEARCH_PROTOCOL.json',dict(path='search_scale_protocol_v3.json',version=p['version'],sha256=sha(HERE/'search_scale_protocol_v3.json'),baseRootProtocol='search_scale_protocol.json'))
save('TASK_STATE.json',dict(status='running',complete=False,phase='R16共享根编码提议：三端数值与编码复用已通过，准备离线重采校准及新资格；专家0'))
with (HERE/'WORKLOG.md').open('a',encoding='utf-8') as f:f.write('\n\n## R16 扩量策略共享根编码提议\n\nR15停止后105槽、62842实际动作全部strict。固定搜索22/30胜，低于pure24；部分扩展5/5胜不当完整20槽结果。首次strict一槽失败源于旧新兵预分配actorID被误标完整同actor：兼容审计明确验证actor此前不存在、新兵真实未动仍有合法move、空后续及66见证动作，不放宽合法性，原日志和失败收据保留。未来标记仅在真实complete时为真。\n\n复用已训练720/180扩量策略作为独立根候选提议，阶段4默认策略与教师Value不变；共享同一root.x，只加一次forwardGroup，不重复全图编码，分支前向0。保留默认、关键事件与安全候选，最多替换一个普通候选，Top6/24/150预算不变。新权重已实际执行Chrome155三端数值：23状态argmax一致，前向2.8422e-14、梯度1.7764e-14；共享编码与独立infer逐项一致。新增协议v3在新资格前登记，仍使用原根池/分区/系数网格并排除全部已消费评测帧。性能与棋力尚未获新资格验证，专家0、蒸馏和最终200槽未完成。\n')
print(json.dumps(dict(passed=True,protocol=p['version'],proposalSha256=p['rootProposal']['sha256']),ensure_ascii=False))
