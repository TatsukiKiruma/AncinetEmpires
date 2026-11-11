"""检查本次研究产物间的关键数字、语法和冻结身份，不运行训练或对局。"""
import ast
import datetime
import hashlib
import json
from pathlib import Path

OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[1]


def load(path):
    return json.loads(path.read_text(encoding='utf8'))


snap=load(OUT/'snapshot_20261015_234940/summary.json')
actions=load(OUT/'native_action_stats_20261015_233607.json')
replay=load(OUT/'replay_audit/current-audit-summary.json')
plan=load(OUT/'PREREGISTRATION.json')
assert sum(actions['types'].values())==actions['actions']==4238038
assert len(actions['games_detail'])==3000
assert snap['total']['original_actions']==actions['actions']
assert snap['total']['effective_actions']==actions['actions']+snap['status_additional_actions']==7856273
assert snap['total']['natural']==2953 and snap['latest_round']==36
assert len(snap['running'])+len(snap['stopped'])+snap['total']['natural']==3000
assert sum(r['games'] for r in snap['by_map'].values())==3000
assert snap['by_players']['2']['games']==1008
assert replay['currentUniqueRevalidated']==replay['currentPassed']+replay['currentFailed']==40
assert replay['currentAcceptedTerminalIgnored'] is None
assert plan['小试']['每策略DEV父局']*plan['小试']['每父局换边槽']==plan['小试']['每策略DEV槽']==56
checks=[]
for p in OUT.rglob('*.py'):
    ast.parse(p.read_text(encoding='utf-8-sig'),filename=str(p))
    checks.append(str(p.relative_to(OUT)))
for p in OUT.rglob('*.json'):
    load(p)
for p in (OUT/'REPORT.md',OUT/'PLAN.md'):
    text=p.read_text(encoding='utf8')
    assert text.count('```')%2==0
source_check=[]
for relative,expected in replay['sourceHashesAtFinish'].items():
    actual=hashlib.sha256((ROOT/relative).read_bytes()).hexdigest()
    source_check.append({'path':relative,'equal':actual==expected,'sha256':actual})
assert all(r['equal'] for r in source_check)
manifest=load(ROOT/'captures/phone-compressed-2000-20261015/final-source-sha256.json')
generation={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==manifest[p] for p in
 ['tools/phone_training/worker.rhino.js','tools/phone_training/scenario_manifest.ts',
  'ai_training/tools/sd_training_state_generator.ts','ai_training/training_configs/sd_training_plan_20260705.json']}
receipt={'observed_at':datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(),
         'checks':'3000动作全量统计、快照加总、当前回放计数、建议预算、JSON与Python语法、关键规则源身份',
         'python_files':checks,'source_check':source_check,'generation_source_vs_2000_sealed':generation,
         'app_lint_test_build':'本轮未修改公共应用/规则，未运行这些检查；不冒称应用检查通过',
         'remaining':'训练schema、完整原生到TS逐状态转换、217回放本日未复验及33通过项终局忽略字段仍未验收'}
with (OUT/'delivery_verification.json').open('x',encoding='utf8') as f:
    json.dump(receipt,f,ensure_ascii=False,indent=2)
print(json.dumps({'python_syntax_files':len(checks),'source_hashes_equal':len(source_check),
                  'generation':generation,'critical_assertions':'passed'},ensure_ascii=False))
