"""汇总开发记录并按真实缺失判门禁，不把中断局改记为自然负局。"""
import datetime
import gzip
import json
import math
from pathlib import Path


def teacher_valid(row):
    if not row:
        return False
    keys = ['actionCodes', 'qValues', 'anchoredScores', 'evaluatedMask', 'vetoMask', 'probabilities']
    length = len(row['actionCodes'])
    if any(len(row[key]) != length for key in keys):
        return False
    probs = row['probabilities']
    if any(not math.isfinite(p) or p < 0 for p in probs):
        return False
    for i, (q, score, evaluated, veto) in enumerate(zip(row['qValues'], row['anchoredScores'], row['evaluatedMask'], row['vetoMask'])):
        if evaluated != (q is not None) or evaluated != (score is not None):
            return False
        if evaluated and (not math.isfinite(q) or not math.isfinite(score)):
            return False
        if (not evaluated or veto) and probs[i] != 0:
            return False
    allowed = [i for i in range(length) if row['evaluatedMask'][i] and not row['vetoMask'][i]]
    if bool(allowed) != row['available']:
        return False
    if not allowed:
        return sum(probs) == 0
    if abs(sum(probs) - 1) > 1e-10:
        return False
    maximum = max(row['anchoredScores'][i] for i in allowed)
    weights = {i: math.exp((row['anchoredScores'][i] - maximum) / row['temperature']) for i in allowed}
    total = sum(weights.values())
    return all(abs(probs[i] - value / total) < 1e-10 for i, value in weights.items())


def finalize(games, missing, output, here, old, save, tree_hashes):
    ids = json.loads((old / 'DEV_SUBSET.json').read_text(encoding='utf-8-sig'))['ids']
    if len(games) + len(missing) != len(ids) or set(ids) != {g['id'] for g in games} | set(missing):
        raise RuntimeError('最终局号覆盖与冻结面板不一致')
    buckets = {n: {'scheduled': 6, 'completed': 0, 'natural': 0, 'wins': 0, 'rankSum': 0,
                   'roots': 0, 'substantive': 0, 'invalidTeacher': 0, 'teacherAvailable': 0,
                   'teacherUnavailable': 0, 'timeForfeits': 0, 'policyFallbacks': 0} for n in [2, 3, 4]}
    game_telemetry = []
    actions = {}
    response_reasons = {}
    for game in games:
        bucket = buckets[game['players']]
        bucket['completed'] += 1
        bucket['natural'] += bool(game['natural'])
        bucket['wins'] += game['classification'] == 'natural_win'
        bucket['rankSum'] += game['normalizedRank'] or 0
        bucket['timeForfeits'] += game['classification'] == 'time_forfeit'
        roots = substantive = decisions = 0
        directory = Path(game['artifactDirectory'])
        with gzip.open(directory / 'search.jsonl.gz', 'rt', encoding='utf-8') as stream:
            for line in stream:
                row = json.loads(line)
                decisions += 1
                if row.get('queued') or row.get('stopReason') == 'unique_action':
                    continue
                roots += 1
                compared = len({c['rootAction'] for c in row['candidates'] if c['responseComplete']}) >= 2
                substantive += compared
                bucket['invalidTeacher'] += not teacher_valid(row.get('teacher'))
                bucket['teacherAvailable'] += bool(row.get('teacher', {}).get('available'))
                bucket['teacherUnavailable'] += not row.get('teacher', {}).get('available', False)
                bucket['policyFallbacks'] += row.get('stopReason') == 'policy_top1_fallback'
                for candidate in row['candidates']:
                    for reason in candidate.get('responseReasons', []):
                        response_reasons[reason] = response_reasons.get(reason, 0) + 1
        bucket['roots'] += roots
        bucket['substantive'] += substantive
        game_telemetry.append({'id': game['id'], 'roots': roots, 'expectedRoots': game['roots'],
                               'rootCoverage': roots == game['roots'], 'substantive': substantive, 'decisions': decisions})
        with gzip.open(directory / 'steps.jsonl.gz', 'rt', encoding='utf-8') as stream:
            for line in stream:
                row = json.loads(line)
                if row['side'] == 'model':
                    kind = row['action']['type']
                    actions[kind] = actions.get(kind, 0) + 1
    for n, bucket in buckets.items():
        bucket['missing'] = 6 - bucket['completed']
        bucket['substantiveRate'] = bucket['substantive'] / max(1, bucket['roots'])
        bucket['conservativeWin'] = bucket['wins'] / 6
        bucket['conservativeRank'] = bucket['rankSum'] / 6
    roots = sum(b['roots'] for b in buckets.values())
    comparisons = sum(b['substantive'] for b in buckets.values())
    summary = {'byPlayers': buckets, 'completed': len(games), 'planned': len(ids), 'missing': missing,
               'completeCoverage': not missing and all(g['rootCoverage'] for g in game_telemetry),
               'availableRootCoverage': all(g['rootCoverage'] for g in game_telemetry),
               'substantiveRate': comparisons / max(1, roots), 'roots': roots, 'substantiveComparisons': comparisons,
               'timeForfeits': sum(b['timeForfeits'] for b in buckets.values()),
               'invalidTeacher': sum(b['invalidTeacher'] for b in buckets.values()),
               'equalWin': sum(b['conservativeWin'] for b in buckets.values()) / 3,
               'equalRank': sum(b['conservativeRank'] for b in buckets.values()) / 3,
               'modelActions': actions, 'responseReasons': response_reasons, 'games': game_telemetry,
               'trainingUpdates': 0, 'sealedAccess': 0, 'runtimeMixed': True}
    reasons = []
    if not summary['completeCoverage']:
        reasons.append('完整遥测覆盖不足，两个基础设施中断局不能生成完整教师与实绩')
    if summary['substantiveRate'] <= .9:
        reasons.append('总体实质比较率没有严格超过90%')
    if buckets[4]['substantiveRate'] < .85:
        reasons.append('4P实质比较率低于85%')
    if summary['timeForfeits'] or summary['invalidTeacher']:
        reasons.append('存在时间判负或非法教师分布')
    gate = {'status': 'development_gate_rejected' if reasons else 'development_screen_only', 'reasons': reasons,
            'summary': summary, 'sealedAccess': 0, 'trainingUpdates': 0, 'unstartedConfigs': ['C2', 'C3'],
            'remainingDevelopment': 'Dev-54未启动；本轮不锁定候选或创建封存令牌'}
    save(here / 'SEARCH_TELEMETRY_AUDIT.json', summary, True)
    save(here / 'DEVELOPMENT_GATE_REPORT.json', gate, True)
    table = '\n'.join(f"| {n}P | {b['completed']}/6 | {b['wins']} | {b['missing']} | {b['substantiveRate']:.2%} |" for n, b in buckets.items())
    text = f'''# 第四阶段V5开发收尾报告

完成时间：{datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat()}。

本次完成剩余三个从未尝试的开发局，累计完成{len(games)}/18局，均按原始结果分类。此前13份完成收据已逐文件SHA核验；p3-10-s0与p4-16-s2两局中断原件原样保留、未重跑，不能记成自然负局或用新结果覆盖。

| 人数 | 完成/计划 | 独胜 | 缺失 | 实质比较率 |
|---|---:|---:|---:|---:|
{table}

已落盘根遥测覆盖完整：{summary['availableRootCoverage']}。总体实质比较率{summary['substantiveRate']:.2%}，时间判负{summary['timeForfeits']}，非法教师分布{summary['invalidTeacher']}。教师检查同时校验纯Q、锚定J、掩码、温度softmax和不可用标签。含缺失按零计的等权保守独胜率{summary['equalWin']:.4f}、排名分{summary['equalRank']:.4f}仅作评分，不替代自然胜负。

开发门禁结论：{'；'.join(reasons)}。流程停止在开发集，不执行C2/C3、Dev-54、候选锁定或封存验收。

监督器改用允许READ/WRITE/DELETE共享的Win32心跳读取，有界重试共享冲突；无效样本不刷新最后有效心跳。真实独占句柄、并发替换、持续拒绝访问、磁盘耗尽及失效心跳回归通过。继续使用有界压缩写入、磁盘余量检查、独立隐藏宿主和进程外看门狗。冻结搜索算法、模型和配置未变；评测器/监督器身份变化完整记录，不能将混合版本结果视为纯算法受控对照。

训练更新0，封存访问0。唯一Omni-Base权重SHA256为1d3b6d01b91de9cbd56693b9140ca769e9df06c490701adccfd8fc701fb4a6a6。旧stage4及全部异常文件保持原样。下一轮算法改进需要新的版本化研究与预注册，不能越过本次拒绝门禁。
'''
    for file in [here / 'REPORT.md', here / 'DEVELOPMENT_GATE_REPORT.md', old / 'DEVELOPMENT_GATE_REPORT.md']:
        with file.open('x', encoding='utf-8') as stream:
            stream.write(text)
    save(old / 'DEVELOPMENT_GATE_REPORT.json', gate, True)
    closed = {'stage': 'development_gate_rejected', 'completed': len(games), 'missing': missing,
              'childrenRemaining': 0, 'sealedAccess': 0, 'trainingUpdates': 0,
              'report': str(here / 'REPORT.md'), 'updatedMs': int(datetime.datetime.now().timestamp() * 1000)}
    save(here / 'RUN_CLOSED.json', closed, True)
    save(here / 'PROGRESS.json', closed)
    save(old / 'PROGRESS.json', closed)
    evidence = {**tree_hashes(output), **tree_hashes(here)}
    # 可变进度与正在写入的宿主标准流只作观察，不放进不可变证据清单。
    evidence = {file: digest for file, digest in evidence.items() if not file.endswith('PROGRESS.json') and not file.endswith('.stdout.log') and not file.endswith('.stderr.log')}
    save(here / 'EVIDENCE_MANIFEST.json', {'files': evidence, 'sealedAccess': 0, 'trainingUpdates': 0}, True)
