"""校验多场景对局记录并生成中文评估报告。"""
import json
import sys
import hashlib
from pathlib import Path
from collections import Counter, defaultdict

root = Path(sys.argv[1] if len(sys.argv) > 1 else 'training_runs/evaluation_20260918')
rows = json.loads((root / 'results.json').read_text(encoding='utf-8'))
manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
assert len(rows) == len({r['id'] for r in rows})
assert all(r['id'] in {j['id'] for j in manifest['jobs']} for r in rows)
missing = [j['id'] for j in manifest['jobs'] if j['id'] not in {r['id'] for r in rows}]
names = {'new': '新模型', 'old': '旧试训模型', 'heuristic': '启发式'}
actions = defaultdict(Counter)
initial_hashes = defaultdict(set)
trajectories = defaultdict(set)
for r in rows:
    record = json.loads((root / 'episodes' / f"{r['id']}.json").read_text(encoding='utf-8'))
    e = record['episode']
    assert len(e['steps']) == r['stepCount']
    assert sum(s['illegal'] for s in e['steps']) == r['illegalActionCount']
    assert record['job'] == manifest['jobs'][r['id']]
    key = (r['map'], r['plan'], r['seed'], r['seat'] if r['plan'] != 'sd-normal' else 0)
    initial_hashes[key].add(e['initialObservationHash'])
    if r['plan'] == 'sd-normal':
        trajectory = [(s['playerId'], s['actionCode']) for s in e['steps']]
        trajectories[(r['map'], r['opponent'], r['seat'])].add(hashlib.sha256(json.dumps(trajectory).encode()).hexdigest())
    if r['plan'] != 'sd-normal':
        own = r['initialArmy'][str(r['subjectAlliance'])]
        assert own > max(v for k, v in r['initialArmy'].items() if k != str(r['subjectAlliance']))
    for s in e['steps']:
        if s['playerId'] == r['subjectId']:
            actions[(r['plan'], r['subject'], r['opponent'])][(s['actionCode'] or 'unknown').split(':')[0]] += 1
assert all(len(v) == 1 for v in initial_hashes.values()), '成对对照的初始局面不一致'

def stats(group):
    n = len(group)
    win = sum(r['naturalWin'] for r in group)
    loss = sum(r['winnerAlliance'] is not None and r['winnerAlliance'] != -1 and not r['naturalWin'] for r in group)
    return [n, win, loss, f'{win/n:.1%}', sum(r['timeout'] for r in group), sum(r.get('stoppedByStagnation', False) for r in group), sum(r['stoppedByMaxSteps'] for r in group), sum(r['illegalActionCount'] for r in group), sum(r['adjudicatedWin'] for r in group)]

lines = ['# BC 多场景实战评估（2026-09-18）', '', f'状态：按用户要求停止。已完成 {len(rows)}/{len(manifest["jobs"])} 局；未完成编号 {missing}。未完成局不计为超时或胜负，表格分母仅包含已完成局。', '',
    '评估纯 BC ranker，未启用 hybrid/blend，未修改游戏默认策略。旧版对照仅为此前 5,000 样本、1 epoch 的 smoke-bc 试训模型，不代表历史正式最优模型。', '',
    '计划 120 局：常规 48 局（4 地图 × 3 种子 × 2 对手 × 2 席位），优势残局 72 局（2 地图 × 3 档优势 × 2 种子 × 3 策略 × 2 行动顺序）。种子为 9101801—9101803；残局用前两个。', '',
    '每局使用绝对上限 400 ply（第 200 回合）、25,600 动作；保留 runner 默认停滞保护。残局从第 35 回合开始，剩余约 166 回合；相同行动顺序的各策略使用相同预算。自然胜率以所有对局为分母，超时裁定胜不计入自然胜率。延迟在最多4个计算线程环境下测得；后半程按用户要求降至最多2个，并由第二个进程补跑排队任务；超过 2 秒仅为观测阈值，不是引擎超时规则。', '',
    '## 汇总', '', '| 分组 | 局数 | 自然胜 | 自然负 | 自然胜率 | 回合超时 | 停滞 | 步数停止 | 非法动作 | 超时裁定胜 |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
groups = defaultdict(list)
for r in rows:
    label = ('常规：新模型 vs ' + names[r['opponent']]) if r['plan'] == 'sd-normal' else ('优势残局：' + names[r['subject']])
    groups[label].append(r)
for label, group in groups.items():
    lines.append('| ' + ' | '.join(map(str, [label] + stats(group))) + ' |')
lines += ['', '## 地图与行动顺序', '', '| 地图/对手 | 先手自然胜 | 后手自然胜 |', '|---|---:|---:|']
for map_name in dict.fromkeys(r['map'] for r in rows):
    for opponent in ['heuristic', 'old']:
        group = [r for r in rows if r['map'] == map_name and r['opponent'] == opponent and r['plan'] == 'sd-normal']
        values = [f"{sum(r['naturalWin'] for r in group if r['subjectFirst'] == first)}/{sum(r['subjectFirst'] == first for r in group)}" for first in [True, False]]
        lines.append('| ' + ' | '.join([map_name + ' / ' + names[opponent]] + values) + ' |')
lines += ['', '## 优势残局分档', '', '| 优势档位 | 策略 | 自然收尾 | 超时 | 停滞 |', '|---|---|---:|---:|---:|']
for plan in dict.fromkeys(r['plan'] for r in rows if r['plan'] != 'sd-normal'):
    for policy in names:
        group = [r for r in rows if r['plan'] == plan and r['subject'] == policy]
        lines.append(f"| {plan} | {names[policy]} | {sum(r['naturalWin'] for r in group)}/{len(group)} | {sum(r['timeout'] for r in group)} | {sum(r.get('stoppedByStagnation', False) for r in group)} |")
lines += ['', '## 决策耗时', '', '| 策略 | 动作数 | 平均毫秒 | 最长毫秒 | 超过2秒次数 |', '|---|---:|---:|---:|---:|']
for policy in names:
    ts = [r['timings'][policy] for r in rows if policy in r['timings']]
    count = sum(t['calls'] for t in ts)
    lines.append(f"| {names[policy]} | {count} | {sum(t['totalMs'] for t in ts)/count:.2f} | {max(t['maxMs'] for t in ts):.2f} | {sum(t['over2000ms'] for t in ts)} |")
lines += ['', '## 异常和动作诊断', '']
for r in rows:
    if r['truncationReason'] or r['illegalActionCount']:
        lines.append(f"- 对局 {r['id']}：{r['map']}，{r['plan']}，{names[r['subject']]}，seed={r['seed']}，先手={r['subjectFirst']}；{r['truncationReason']}，自然胜={r['naturalWin']}，最终兵力={r['finalArmyValueByAlliance']}。见 episodes/{r['id']}.json。")
        episode = json.loads((root / 'episodes' / f"{r['id']}.json").read_text(encoding='utf-8'))['episode']
        tail = Counter((s['actionCode'] or 'unknown').split(':')[0] for s in episode['steps'] if s['playerId'] == r['subjectId'] and s['turnBefore'] > r['finalTurn'] - 20)
        lines.append('  最后20回合受测方动作：' + '，'.join(f'{a}={n}' for a, n in tail.most_common()))
for key, counts in actions.items():
    if key[1] == 'new':
        lines.append(f'- {key}：' + '，'.join(f'{a}={n}' for a, n in counts.most_common(8)))
lines += ['', '## 校验与解释边界', '',
    '完整性校验通过：已完成对局ID与任务清单一致、ID 唯一、步数与原始记录一致、非法动作计数一致；成对实验初始局面哈希一致，所有优势残局的初始兵力价值均高于对方。', '',
    '这是有限场景回归，非独立地图泛化基准；地图及残局生成模板可能见于训练集，多个种子也不保证产生不同轨迹。此次仅覆盖 SD 双人对局，未覆盖三人、四人或 SO。模型 SHA256、完整矩阵见 manifest.json，逐局统计见 results.json，完整行为见 episodes/。', '',
    '复现：`node --openssl-legacy-provider --import tsx tools/skirmish_multiscenario_eval.ts --workers 2 --out-dir training_runs/evaluation_repeat`；汇总：`python tools/skirmish_multiscenario_report.py training_runs/evaluation_repeat`。']
lines += ['', f'常规对局的 16 个地图/对手/席位组合中，有 {sum(len(v) == 1 for v in trajectories.values())} 组在三个种子下产生完全相同的动作轨迹。不能把这些重复轨迹视为独立的随机证据。']
normal_h = [r for r in rows if r['plan'] == 'sd-normal' and r['opponent'] == 'heuristic']
end_new = [r for r in rows if r['plan'] != 'sd-normal' and r['subject'] == 'new']
lines += ['', '## 结论与下一步', '',
    f"新模型对启发式 AI 自然胜 {sum(r['naturalWin'] for r in normal_h)}/{len(normal_h)}；优势残局自然收尾 {sum(r['naturalWin'] for r in end_new)}/{len(end_new)}。本轮结果不支持替换现有启发式 AI。", '',
    '建议下一步针对已保存的停滞/超时局面修复终结能力，检查训练时最多64个候选与实战全合法候选排序的分布差异，并评估 BC-hybrid/BC-blend 的收益。验证集第2轮高于第3轮，也值得在后续训练中保留最佳验证轮次。以上为后续实验方向，尚未证明具体成因。']
(root / 'summary.json').write_text(json.dumps({'completed': len(rows), 'planned': len(manifest['jobs']), 'incompleteJobIds': missing, 'groups': {k: dict(zip(['episodes','naturalWins','naturalLosses','naturalWinRate','timeouts','stagnations','maxStepStops','illegalActions','adjudicatedWins'], stats(v))) for k,v in groups.items()}}, ensure_ascii=False, indent=2), encoding='utf-8')
(root / 'report.md').write_text(('\n'.join(lines) + '\n').replace('4 工作线程', str(manifest.get('workerCount', 4)) + ' 工作线程'), encoding='utf-8')
print('\n'.join(lines[:18]))
