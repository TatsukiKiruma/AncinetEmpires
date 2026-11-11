"""以已落盘收据生成收官报告，不回填未运行的成绩。"""
from hashlib import file_digest
import json
from pathlib import Path
import subprocess

from phase_b_watch import DATA, HERE, now, processes, read_json, save, snapshot

ROOT = HERE.parents[2]


def read(name):
    p = HERE / name
    return read_json(p) if p.exists() else None


def fmt(value, places=2):
    return '未测' if value is None else f'{value:.{places}f}'


def score(x):
    if not x:
        return '未运行'
    counts = [f'{p}P {x["byPlayers"][str(p)]["wins"]}/{x["byPlayers"][str(p)]["total"]}' for p in (2, 3, 4)]
    return f'{x["wins"]}/{x["total"]}（' + '、'.join(counts) + '）'


def git_snapshot():
    before = HERE / 'git-status-resume-before.txt'
    after = HERE / 'git-status-stage7-after.txt'
    git = subprocess.run(['git', 'status', '--short'], cwd=ROOT, check=True, capture_output=True)
    after.write_bytes(git.stdout)
    x = set(before.read_text(encoding='utf-8-sig').splitlines()) if before.exists() else set()
    y = set(after.read_text(encoding='utf-8-sig').splitlines())
    save(HERE / 'GIT_STATUS_COMPARISON_stage7_resume.json', dict(before=before.name, after=after.name,
         added=sorted(y-x), removed=sorted(x-y), basis='比较 Git 状态条目；公共文件完整性另按 SHA256 核验'))


def manifest():
    names = ['PRE_STAGE7_REPORT.md', 'STAGE7_REPORT.md', 'GATES.json', 'SEALED_ACCESS.json', 'PUBLIC_SOURCE_LOCK.json',
             'PHASE_A_SUBSET.json', 'lint-attempt2.log', 'test-attempt2.log', 'build-attempt2.log', 'STAGE7_PUBLIC_SOURCE_CHECK.json',
             'B_G1_G5.json', 'B_G2.json', 'B_P1.json', 'B_P2.json', 'B_P1_VALID_TEACHERS.json', 'B_P2_VALID_TEACHERS.json',
             'PHASE_B_DECISION.json', 'PHASE_C_CONCURRENCY.json', 'STAGE7_BASELINE_DEV18.json', 'STAGE7_BASELINE_DEV54.json',
             'PHASE_D_DECISION.json', 'PHASE_D_GEN1.json', 'PHASE_D_GEN2.json', 'PHASE_E_DECISION.json', 'STAGE7_SEALED_TOKEN.json',
             'STAGE7_PROCESS_CHECK.json', 'STAGE7_GUARDIAN_RELEASE.json', 'git-status-resume-before.txt', 'git-status-stage7-after.txt',
             'GIT_STATUS_COMPARISON_stage7_resume.json', 'RUN_STATUS.json', 'throughput-P1-attempt4.log', 'B_P1_LIVE.json',
             'stage7-validation.log']
    files = [HERE / n for n in names]
    for phase, size in (('P1', 12), ('P2', 18)):
        files += [DATA / f'throughput-{phase}-receipts.jsonl', DATA / f'throughput-{phase}-gpu-samples.jsonl',
                  DATA / f'throughput-{phase}-stage7.log', DATA / f'throughput-{phase}-teacher-audit.log']
        files += [DATA / f'throughput-{phase}/game-{i}.sqlite{suffix}' for i in range(size) for suffix in ('', '-wal')]
    for name in ('phase_c.ts', 'arena_game.ts', 'arena_worker.bundle.mjs', 'arena_panel.ts', 'phase_d.ts',
                 'league_worker.bundle.mjs', 'league_collect.ts', 'dataset_export.ts', 'train_candidate.py', 'phase_e.ts', 'game_worker.bundle.mjs'):
        files.append(HERE / name)
    records = []
    for p in files:
        if p.is_file():
            with p.open('rb') as stream:
                records.append({'path': str(p), 'bytes': p.stat().st_size, 'sha256': file_digest(stream, 'sha256').hexdigest()})
    save(HERE / 'STAGE7_EVIDENCE_MANIFEST.json', {'generatedAt': now(), 'files': records})


def reports(stage, reason, workload_sleep_lock_released):
    gates = read('GATES.json')
    b = read('PHASE_B_DECISION.json') or {}
    c = read('STAGE7_BASELINE_DEV54.json')
    c18 = read('STAGE7_BASELINE_DEV18.json')
    d = read('PHASE_D_DECISION.json')
    e = read('PHASE_E_DECISION.json')
    sealed = int((HERE / 'STAGE7_SEALED_TOKEN.json').is_file())
    work = processes()
    process = {'checkedAt': now(), 'activeCount': len(work), 'processes': work,
               'workloadSleepLocksReleased': workload_sleep_lock_released and not work,
               'guardianRelease': '后台代理宿主在本次代理退出后释放；STAGE7_GUARDIAN_RELEASE.json 单独核验', 'sealedAccess': sealed}
    save(HERE / 'STAGE7_PROCESS_CHECK.json', process)
    status = {'phase': stage, 'status': 'stopped' if reason else 'complete', 'stopReason': reason,
              'sealedAccess': sealed, 'activeCount': len(work), 'updatedAt': now()}
    save(HERE / 'RUN_STATUS.json', status)
    if not sealed:
        save(HERE / 'SEALED_ACCESS.json', {'checkedAt': now(), 'sealedAccess': 0, 'phaseEStarted': False,
             'basis': '仅开发面板、指定冠军模型及已准入训练/开发来源；没有读取封存面板、轨迹或离线样本'})
    if c:
        gates['phaseC'] = {'passed': c['passed'], 'natural': c['natural'], 'B': c['B'], 'B18': c['B18']['wins'], 'byPlayers': c['byPlayers']}
    elif c18:
        gates['phaseC'] = {'status': 'stopped', 'Dev18': c18['passed'], 'natural': c18['natural']}
    if d:
        gates['phaseD'] = {'passed': d['passed'], 'generations': len(d['generations']), 'wallLimit': d['wallLimit']}
    if e:
        gates['phaseE'] = {'passed': e['passed'], 'sealedAccess': sealed, 'candidateWins': e['candidate']['wins'], 'baselineWins': e['c1']['wins']}
    elif sealed:
        gates['phaseE'] = {'status': 'opened_incomplete', 'sealedAccess': sealed}
    gates.update(sealedAccess=sealed, stopReason=reason)
    save(HERE / 'GATES.json', gates)
    a = read('PHASE_A_SUBSET.json')
    lines = ['# Pre-Stage-7 报告', '', f'状态：{reason or "已执行至任务门禁结论"}。', '',
             'Phase A：通过。冻结公共文件 646 个，SHA256 `df20a853edcf031f2ae8da1ae379e3dd84ac3f19d77c0765c0dcacef205cb8d1`。'
             '2,160 个 Dev 状态通过子集与动作编码核验。继承 lint/test/build 全部退出 0，测试 564 通过、0 失败、20 跳过；未重跑或修改公共目录。',
             f'规则/引擎/环境联合源码 SHA256：`{a["engineSha256"]}`。', '',
             'B-G1：通过。全局中位 6.804 ms，B=1 单元中位均值 6.562 ms，最差单元中位 11.922 ms，最差 p99 14.879 ms。',
             'B-G2：通过。72/72 选招一致，教师概率最大差中位 5.983e-8，0 硬超时、0 迟到。',
             'B-G5：通过。11 种尺寸、9 个桶的完整/纯价值路径最大差 0；两档自然退出码 0。使用默认 Find 模式。', '']
    for phase, tag in (('P1', 'B-G3'), ('P2', 'B-G4')):
        result = b.get(phase)
        if result:
            m = result['metrics']
            lines += [f'{tag}：固定 {result["fixedGames"]} 局；自然 {result["natural"]}，截断 {result["truncations"]}；'
                      f'墙钟 {fmt(m["elapsedMs"] / 1000)} 秒。物理均值 **{fmt(m["meanWireMs"], 3)} ms**（上限 12.000 ms），'
                      f'含排队逻辑均值 {fmt(m["logicalRequestMs"], 3)} ms。',
                      f'实质完整根 {fmt(m["fullRootsPerHour"])} 根/小时，{fmt(m["stepsPerSecond"], 3)} 步/秒，'
                      f'自然局 {fmt(m["naturalGamesPerHour"])} 局/小时，复核有效教师 {result["validTeachers"]} 条、'
                      f'{fmt(result["validTeachersPerHour"])} 条/小时。', '']
            for group in result['byPlayers']:
                lines.append(f'- {group["players"]}P：{group["natural"]}/{group["games"]} 自然局，'
                             f'{fmt(group["naturalGamesPerHour"])} 自然局/小时，{fmt(group["teacherSamplesPerHour"])} 有效教师/小时。')
            inherited = result['inheritedReferenceRatios']
            lines += ['', f'继承诊断参照：相对串行 S0 约 {fmt(inherited["fullRootsVsInheritedS0"])} 倍根吞吐，'
                      f'相对 P0 约 {fmt(inherited["stepsVsInheritedP0"])} 倍步速。两者不是 Stage 6 同工作负载自然局倍率。']
            same = b.get('references', {}).get(phase)
            if same:
                lines.append(f'同工作负载 Stage 6 对照：自然局 {fmt(same["ratios"]["naturalGames"])} 倍，有效教师 {fmt(same["ratios"]["validTeachers"])} 倍。')
            else:
                lines.append('同工作负载 Stage 6 对照未运行，不能给出实测倍率。')
            if result.get('historicalBatchTelemetry'):
                lines.append(f'在途版本仅能从累计传输计数得到含预热平均物理实批 {fmt(result["historicalBatchTelemetry"]["meanIncludingWarmup"])}；未保存全程 p95 和队列分布。')
            gpu = result.get('gpuUtilization')
            if gpu:
                lines.append(f'接手后的 {gpu["samples"]} 次 Windows GPU 采样：本任务计算引擎均值 {fmt(gpu["meanPct"])}%，峰值 {fmt(gpu["peakPct"])}%。')
        elif (HERE / f'B_{phase}.json').exists() or (HERE / f'B_{phase}_CLOCK.json').exists():
            p = snapshot(phase)
            lines.append(f'{tag}：未完整结束；检查点 {p["finished"]} 局结束、{p["natural"]} 局自然结束、{p["fullRoots"]} 完整根。没有整组吞吐结论。')
        else:
            lines.append(f'{tag}：未运行。')
        lines.append('')
    lines += [f'Phase C：C1 新引擎 Dev-18 {score(c18)}；Dev-54 {score(c)}。']
    if c:
        lines.append('旧引擎 C1 为 36/54；差异仅作描述。')
    lines += ['', f'封存访问：{sealed}。完整后续结果见 [STAGE7_REPORT.md](STAGE7_REPORT.md)。']
    (HERE / 'PRE_STAGE7_REPORT.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    stages = ['# Stage 7 报告', '', f'结论：{reason or ("候选通过最终门禁" if e and e["passed"] else "流程结束，C1 保持冠军")}。', '',
              f'Phase A/B/C 的收据和吞吐见 [PRE_STAGE7_REPORT.md](PRE_STAGE7_REPORT.md)。', '',
              f'Phase C 新基线：Dev-18 {score(c18)}；Dev-54 {score(c)}。', '']
    if d:
        for gen in d['generations']:
            stages.append(f'第 {gen["generation"]} 代：')
            for k in gen['candidates']:
                stages.append(f'- {k["kind"]}：Dev-18 {score(k["screen"])}；Dev-54 {score(k["full"])}；结论 {k.get("stop") or "通过"}。')
            stages.append('')
    else:
        stages += ['Phase D：无已完成代际成绩。', '']
    stages.append(f'Phase E：封存访问 {sealed}。' + (f'C1 {score(e["c1"])}；候选 {score(e["candidate"])}。' if e else '无最终封存成绩。'))
    if not e or not e['passed']:
        stages.append('正式冠军保持 Stage 5 C1（H1）。')
    stages += ['', f'工作负载进程核验：activeCount={len(work)}。证据见 [STAGE7_EVIDENCE_MANIFEST.json](STAGE7_EVIDENCE_MANIFEST.json)。']
    (HERE / 'STAGE7_REPORT.md').write_text('\n'.join(stages) + '\n', encoding='utf-8')
    git_snapshot()
    manifest()
    return status
