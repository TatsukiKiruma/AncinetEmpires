"""采样前绑定合格教师的策略、搜索源码、父局、前缀与种子身份。"""
from pathlib import Path
import json,hashlib
from index_consumed_inputs import evaluation_logs
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
def read(n):return json.loads((HERE/n).read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
gate=read('teacher-gate.json');assert gate['passed'],'只有合格教师可以采样'
review=HERE/'causal-guard-review.json'
if review.exists():
    r=read(review.name)
    assert r['passed'] and r['coreSha256']==sha(HERE/'model_battle_search_ai.ts'),'已登记的风险归因回归尚未核验，禁止提前采样'
source=read('source-freeze-teacher.json')
assert all(sha(ROOT/n)==v['sha256'] for n,v in source['files'].items()),'教师搜索源码已经变化，拒绝使用旧资格采样'
identity=read('teacher-model-identities.json')['models']['teacher_search']
assert identity['fileSha256']==sha(HERE/'teacher-model.json')
proposal=read('teacher-model-identities.json')['proposal'];assert proposal['fileSha256']==sha(HERE/'base-policy-final.json')
# 已消费的失败资格面板也属于评测输入，不能只对最后合格版本排重。
evaluationEntries=evaluation_logs()
evaluationLogs={e['path']:e['sha256'] for e in evaluationEntries}
assert evaluationLogs,'资格面板实际轨迹不可为空'
binding=dict(teacherRevision=gate.get('activeRevision','initial'),teacherFileSha256=identity['fileSha256'],teacherSemanticSha256=identity['semanticSha256'],rootProposal=proposal,sourceFreezeSha256=sha(HERE/'source-freeze-teacher.json'),gateSha256=sha(HERE/'teacher-gate.json'),rootsSha256=sha(HERE/'expert-roots.json'),selectionSha256=sha(HERE/'selection.json'),seedContractSha256=sha(HERE/'seed-contract.json'),isolationProtocolSha256=sha(HERE/'expert-isolation-protocol.json'),packerSha256=sha(HERE/'pack_expert.py'),evaluationLogs=evaluationLogs,interruptedEvaluationPrefixes=sum(e.get('interruptedPrefix',False) for e in evaluationEntries),evaluationIndexerSha256=sha(HERE/'index_consumed_inputs.py'),files=source['files'])
p=HERE/'expert-session-binding.json'
if p.exists():assert read(p.name)==binding,'已有专家会话身份不同，不能混用轨迹'
else:p.write_text(json.dumps(binding,ensure_ascii=False),encoding='utf-8')
print(json.dumps(dict(passed=True,teacherRevision=binding['teacherRevision'],sourceFiles=len(source['files'])),ensure_ascii=False))
