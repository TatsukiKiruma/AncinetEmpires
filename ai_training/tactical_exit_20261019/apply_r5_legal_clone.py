"""有独立语义和性能证据后应用动作列表复制优化。"""
from pathlib import Path
import hashlib,json
HERE=Path(__file__).resolve().parent;OUT=HERE/'performance_legal_clone';target=HERE.parent.parent/'src/game/engine.ts'
def read(n):return json.loads((OUT/n).read_text(encoding='utf-8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
proposal=read('proposal.json')
assert all(read(n)['passed'] for n in ['query-cache-gate.json','action-clone-gate.json','compare-gate.json'])
assert all(r['proposed']['p50']<r['old']['p50'] for r in read('compare-gate.json')['results'])
assert sha(target)==proposal['beforeSha256'] and target.read_bytes()==(OUT/'engine.ts.before').read_bytes(),'公共引擎已被改动，不能覆盖'
assert sha(OUT/'engine.ts.proposed')==proposal['proposedSha256'];target.write_bytes((OUT/'engine.ts.proposed').read_bytes())
(OUT/'applied.json').write_text(json.dumps(dict(proposal,passed=True,applied=True)),encoding='utf-8')
print('动作复制及内部只读查询提案已应用')
