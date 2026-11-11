"""只核对独立新对局的结果与文件字节，不执行回放。"""
import hashlib
import json
from pathlib import Path

here=Path(__file__).resolve().parent
root=here.parent
directory=root/'bench-range-full-verify'
results=json.loads((directory/'RESULTS.json').read_text('utf-8'))
assert len(results)==3 and all(r['natural'] and not r['error'] and r['verifyCurrentDecisions'] for r in results)
records=[]
for r in sorted(results,key=lambda r:r['executionSequence']):
    name=f"parent-{r['executionSequence']}/attempt-{r['attempt']}/decisions.jsonl.gz"
    def digest(path):
        with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()
    actual=digest(directory/name)
    expected=digest(root/'full-cpu12'/f"parent-{r['executionSequence']}/attempt-1/decisions.jsonl.gz")
    assert actual==expected
    records.append(dict(sequence=r['executionSequence'],steps=r['steps'],natural=r['natural'],sha256=actual))
value=dict(natural=3,errors=0,steps=sum(r['steps'] for r in results),currentStateCpuGpuVerification=True,
           trajectoryParityWithPriorIndependentCpuRun=True,historicalReplay=False,records=records)
(here/'RANGE_FULL_VALIDATION.json').write_text(json.dumps(value,ensure_ascii=False,indent=2),'utf-8')
print(json.dumps(value,ensure_ascii=False,indent=2))
