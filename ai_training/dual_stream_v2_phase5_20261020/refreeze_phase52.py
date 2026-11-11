"""保全接口语义修复前的尝试身份，再冻结修复版。"""
from run_league import DIR, ROOT, read, sha
from freeze_phase52 import main

receipt = DIR / 'phase52-audit/runtime-freeze.json'
old = read(receipt)
source = (ROOT / 'src/ai_runtime/dual_v2/turn_search_ai.ts').read_text('utf-8')
source = source.replace(".filter(a => a.type !== 'surrender' && (neural || actor === undefined || actionActor(a) === actor))", ".filter(a => a.type !== 'surrender')")
source = source.replace("!b.engine.getLegalActions(self, { unitId: actor, skipRecruitment: true }).some(a => actionActor(a) === actor)", "!b.engine.getLegalActions(self, { unitId: actor, skipRecruitment: true }).length")
snapshot = DIR / 'phase52-audit/runtime-query-attempt01/turn_search_ai.ts.snapshot'
snapshot.parent.mkdir(exist_ok=True)
snapshot.write_text(source, encoding='utf-8', newline='')
assert sha(snapshot) == old['runtime']['src/ai_runtime/dual_v2/turn_search_ai.ts']
receipt.rename(DIR / 'phase52-audit/runtime-freeze-attempt01.json')
main()
