"""只读比较已保存逐步记录；不推进、重放或重新推理游戏。"""
from collections import Counter
import csv
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
BASE = HERE.parent / 'stage1/arena-baseline-r2'


def read(path):
    return json.loads(Path(path).read_text('utf-8-sig'))


def rows(path):
    return [json.loads(line) for line in Path(path).read_text('utf-8').splitlines() if line]


if __name__ == '__main__':
    comparison = read(HERE / 'revisions/submission-6/TRIAL_COMPARISON.json')
    baseline = {g['id']: g for g in read(BASE / 'SUMMARY.json')['games']}
    changes = []
    for arm in comparison['arms']:
        folder = Path(read(arm['audit'])['folder']) / 'arena'
        candidate = {g['id']: g for g in read(folder / 'SUMMARY.json')['games']}
        for opponent, paired in arm['pairedComparison']['results'].items():
            for change in paired['changes']:
                if change['scoreChange'] in [None, 0]:
                    continue
                before, after = baseline[change['id']], candidate[change['id']]
                assert before['natural'] and after['natural']
                b_rows, c_rows = rows(BASE / change['id'] / 'steps.jsonl'), rows(folder / change['id'] / 'steps.jsonl')
                common = 0
                divergence = None
                for b, c in zip(b_rows, c_rows):
                    assert b['step'] == c['step']
                    if b['before'] == c['before'] and b['code'] == c['code'] and b['after'] == c['after']:
                        common += 1
                        continue
                    divergence = dict(step=c['step'], turnBaseline=b['turn'], turnCandidate=c['turn'],
                                      sameBefore=b['before'] == c['before'], sideBaseline=b['side'], sideCandidate=c['side'],
                                      actionBaseline=b['code'], actionCandidate=c['code'],
                                      candidatesBaseline=b['candidates'], candidatesCandidate=c['candidates'],
                                      baselineLatencyMs=b['ms'], candidateLatencyMs=c['ms'])
                    break
                changes.append(dict(arm=arm['arm'], id=change['id'], opponent=opponent, map=after['map'],
                                    category=after['category'], actualHand=after['actualHand'],
                                    baseline=before['classification'], candidate=after['classification'],
                                    scoreChange=change['scoreChange'], stepsBaseline=before['steps'], stepsCandidate=after['steps'],
                                    commonPrefixAtomicSteps=common, firstDivergence=divergence,
                                    baselineHardTelemetry=before.get('hardTelemetry'), candidateHardTelemetry=after.get('hardTelemetry'),
                                    baselineLatency=before['latency'], candidateLatency=after['latency']))
    assert len(changes) == 19
    report = dict(schema='stage2-saved-outcome-change-diagnosis-v1', changedArmGames=19,
                  uniqueChangedGames=len({c['id'] for c in changes}), changes=changes,
                  grouped={key: dict(Counter((f"{c[key]}/{c['baseline']}->{c['candidate']}") for c in changes))
                           for key in ['map', 'category', 'actualHand', 'opponent']},
                  runtimeReplays=0, forwardCalls=0, optimizerUpdates=0, newGames=0,
                  interpretation='仅静态观测：分支差异、地图、手序及回退共现不能证明失败原因；后续不同状态不作同态动作优劣比较。')
    (HERE / 'STATIC_CHANGE_DIAGNOSIS.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    lines = ['# 三原臂胜负变化静态诊断', '', '共19个臂×局结果变化，覆盖' + str(report['uniqueChangedGames']) + '个不同面板局ID。原有三臂未通过结论保持；没有重放、前向或新增对局。', '',
             '| 臂 | 局ID | 地图/类别 | 实际手序 | 基线→候选 | 相同原子前缀 | 首次分支 | 困难回退基线→候选 |',
             '|---|---|---|---|---|---:|---|---|']
    for c in changes:
        d = c['firstDivergence']
        telemetry = lambda t: '无' if t is None else str(t.get('nativeFallbacks', 0))
        branch = '无' if d is None else f"第{d['step']}步/{d['sideCandidate']}，同前态={d['sameBefore']}"
        lines.append(f"| {c['arm']} | {c['id']} | {c['map']}/{c['category']} | {c['actualHand']} | {c['baseline']}→{c['candidate']} | {c['commonPrefixAtomicSteps']} | {branch} | {telemetry(c['baselineHardTelemetry'])}→{telemetry(c['candidateHardTelemetry'])} |")
    lines += ['', '完整首个不同动作编码、候选数量、延迟和回退/拒绝计划/错误计数见同名JSON；不把不同分支后局面直接对齐解释为某步导致输赢。', '',
              '三原臂离线旧保留和新适应均通过，但困难得分10/9/8；高学习率简单18胜与困难8胜并存。新dev标签一致率提高而困难胜率未改善是本面板观测，不能确定是学习率、技能、建筑、先验或某个动作造成。多人仅离线，双人正常新数据格缺失和同图开发面板限制继续存在。', '',
              '只授权一次1e-4抽样seed复验；不据这些变化修改先验、搜索、loss权重或对手规则，不追加第三seed。', '']
    (HERE / 'STATIC_CHANGE_DIAGNOSIS.md').write_text('\n'.join(lines), 'utf-8')
    with (HERE / 'STATIC_CHANGE_DIAGNOSIS.csv').open('w', newline='', encoding='utf-8-sig') as stream:
        writer = csv.DictWriter(stream, fieldnames=['arm', 'id', 'opponent', 'map', 'category', 'actualHand', 'baseline', 'candidate', 'scoreChange', 'stepsBaseline', 'stepsCandidate', 'commonPrefixAtomicSteps'])
        writer.writeheader()
        writer.writerows({key: c[key] for key in writer.fieldnames} for c in changes)
    print(json.dumps(dict(changedArmGames=19, uniqueChangedGames=report['uniqueChangedGames'], runtimeReplays=0)))
