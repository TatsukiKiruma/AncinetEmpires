"""连续两代无收益时的有限诊断，输出全部正反差异而非按最终评测调参。"""
import json
import sys
from pathlib import Path
from experiment_statistics import paired


def main():
    folder=Path(sys.argv[1]);left=json.loads((folder/'dev/champion/summary.json').read_text('utf-8'));right=json.loads((folder/'dev/candidate/summary.json').read_text('utf-8'))
    report=dict(paired=paired(left['results'],right['results']),champion=left,candidate=right,
        over4000=sum(r['over4000'] for r in right['results']),uniqueCandidateTrajectories=right['uniqueTrajectories'],
        diagnosis='检查新增/丢失胜、截断、实际展开与重复轨迹；未运行最终封存集合',
        limitedCorrection='仅在第三代开始前按预登记将学习率从1e-4减半为5e-5一次，不追加代数或网格')
    (folder/'diagnosis.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8')


if __name__=='__main__':main()
