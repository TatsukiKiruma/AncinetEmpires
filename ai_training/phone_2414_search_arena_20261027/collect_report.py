"""取回手机对战结果，静态核对逐步日志与摘要，生成胜负和耗时报告。"""
from collections import Counter
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import shutil
import tarfile
from device import HERE, PHONE, root, call, write


def sha(file):
    with Path(file).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def stats(values):
    ordered = sorted(values)
    def q(value):
        return ordered[max(0, math.ceil(len(ordered) * value) - 1)] if ordered else None
    return {'count': len(values), 'meanMs': sum(values) / len(values) if values else None,
            'p50Ms': q(.5), 'p95Ms': q(.95), 'p99Ms': q(.99), 'maxMs': q(1),
            'over1000ms': sum(x > 1000 for x in values)}


def main():
    complete = json.loads(root('cat ' + PHONE + '/COMPLETE.json'))
    exited = json.loads(root('cat ' + PHONE + '/CONTROLLER_EXIT.json'))
    assert complete['games'] == 20 and exited['returncode'] == 0
    dest = HERE / 'results'
    assert not (dest / 'SYNC_RECEIPT.json').exists(), '已有同步结果，不覆盖'
    dest.mkdir(exist_ok=True)
    remote = '/data/local/tmp/aeii-2414-search-arena-results-20261027.tar'
    checks = '/data/local/tmp/aeii-2414-search-arena-results-20261027.sha256'
    listing = '/data/local/tmp/aeii-2414-search-arena-results-20261027.files'
    command = 'set -e\ncd ' + PHONE + '\nfind . -type f | sort > ' + listing + '\nwhile IFS= read -r F; do sha256sum "$F"; done < ' + listing + ' > ' + checks + '\ntar -cf ' + remote + ' -T ' + listing + '\nchmod 644 ' + remote + '\nsha256sum ' + remote
    archive_sha = root(command, timeout=120).split()[0]
    manifest = root('cat ' + checks)
    archive = dest / 'phone-results.tar'
    call('pull', remote, archive, timeout=120)
    assert sha(archive) == archive_sha
    expected = {}
    for line in manifest.splitlines():
        digest, name = line.split(None, 1)
        expected[name.removeprefix('./')] = digest
    with tarfile.open(archive) as tar:
        for member in tar:
            assert member.isfile()
            name = member.name.removeprefix('./')
            assert name in expected
            target = (dest / name).resolve()
            assert target.is_relative_to(dest.resolve())
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists():
                assert sha(target) == expected[name]
            else:
                with target.open('xb') as output:
                    shutil.copyfileobj(tar.extractfile(member), output)
    verified = []
    for name, digest in expected.items():
        file = dest / name
        assert file.is_file() and sha(file) == digest, name
        verified.append({'path': name, 'sha256': digest, 'bytes': file.stat().st_size})
    identity = json.loads((HERE / 'IDENTITY.json').read_text(encoding='utf-8'))
    assert json.loads((dest / 'IDENTITY.json').read_text(encoding='utf-8')) == identity
    for name, digest in identity['runtimeFiles'].items():
        assert sha(dest / name) == digest, '运行前后模型或程序身份变化：' + name
    (dest / 'PHONE_SHA256SUMS').write_text(manifest + '\n', encoding='utf-8')
    results = json.loads((dest / 'RESULTS.json').read_text(encoding='utf-8'))
    assert results == complete['results'] and len(results) == 20
    assert len({r['slot']['id'] for r in results}) == 20
    assert Counter((r['slot']['opponent'], r['slot']['seat']) for r in results) == {('hard', 0): 5, ('hard', 1): 5, ('simple', 0): 5, ('simple', 1): 5}
    buckets = {}
    for opponent in ['hard', 'simple']:
        selected = [r for r in results if r['slot']['opponent'] == opponent]
        times = {'model': [], 'modelNontrivial': [], 'forwardSumPerDecision': [], 'opponent': [], 'searchRoot': [], 'searchQueue': []}
        search = {'roots': 0, 'queuedSteps': 0, 'nodes': 0, 'networkCalls': 0, 'retaliationAttempts': 0, 'retaliationComplete': 0,
                  'takeovers': 0, 'vetoes': 0, 'rootsOver780ms': 0, 'rootsOver1000ms': 0}
        for result in selected:
            file = dest / 'matches' / result['slot']['id'] / 'steps.jsonl'
            rows = [json.loads(line) for line in file.read_text(encoding='utf-8').splitlines()]
            assert len(rows) == result['steps']
            assert sum(row['side'] == 'model' for row in rows) == result['latency']['model']['count']
            last = None
            for index, row in enumerate(rows):
                assert row['step'] == index and math.isfinite(row['totalMs']) and row['totalMs'] >= 0
                if last is not None:
                    assert row['beforeSha256'] == last
                last = row['afterSha256']
                times['model' if row['side'] == 'model' else 'opponent'].append(row['totalMs'])
                if row['side'] == 'model':
                    telemetry = row['searchTelemetry']
                    assert telemetry is not None
                    search['networkCalls'] += row['networkCalls']
                    if telemetry['queued']:
                        search['queuedSteps'] += 1
                        times['searchQueue'].append(row['totalMs'])
                    else:
                        search['roots'] += 1
                        times['searchRoot'].append(row['totalMs'])
                        search['nodes'] += telemetry['nodes']
                        search['retaliationAttempts'] += telemetry['retaliationAttempts']
                        search['retaliationComplete'] += telemetry['retaliationComplete']
                        search['takeovers'] += int(telemetry['takeover'])
                        search['vetoes'] += int(telemetry['veto'])
                        search['rootsOver780ms'] += row['totalMs'] > 780
                        search['rootsOver1000ms'] += row['totalMs'] > 1000
                    if not row['forced']:
                        times['modelNontrivial'].append(row['totalMs'])
                    if row['forwardMs'] > 0:
                        times['forwardSumPerDecision'].append(row['forwardMs'])
        buckets[opponent] = {'outcomes': dict(Counter(r['classification'] for r in selected)),
            'first': dict(Counter(r['classification'] for r in selected if r['slot']['seat'] == 0)),
            'second': dict(Counter(r['classification'] for r in selected if r['slot']['seat'] == 1)),
            'latency': {key: stats(value) for key, value in times.items()}, 'search': search,
            'hardTelemetry': {key: sum((r.get('hardTelemetry') or {}).get(key, 0) for r in selected)
                              for key in ['runtimeDecisions', 'nativeFallbacks', 'rejectedPlans', 'runtimeErrors']}}
    summary = {'checkedBeijing': dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat(),
               'games': 20, 'buckets': buckets, 'results': results, 'checkpointSha256': '338dea17879354363c7e76a9921eb97ec0bf9e2d87709661b55a9b82af86a34b',
               'searchOptions': {'budgetMs': 780, 'maxNodes': 220, 'beamWidth': 6, 'maxUnits': 3, 'defaultQueue': 'full'},
               'allFileHashesVerified': True, 'modelAndRuntimeUnchanged': True, 'staticStepChainVerified': True, 'trainingStarted': False, 'replayValidationExecuted': False}
    write(HERE / 'SUMMARY.json', summary)
    write(dest / 'SYNC_RECEIPT.json', {'files': verified, 'fileCount': len(verified), 'archiveSha256': archive_sha, 'allFileHashesVerified': True})
    lines = ['# 2414局2M模型接v6搜索后的手机20局对战结果', '',
             '在小米8（c2357770）顺序执行。模型、对手决策和权威引擎均运行于手机；电脑只负责部署、状态查询与结果整理。', '',
             '困难对手为项目的APK内嵌困难脚本桥接OriginalApkLikeHardAI，可能回退到Java源码移植；不是直接操作APK原生对局。简单对手为项目默认HeuristicAI。', '',
             '模型使用2414局导出权重，全部1966910个FP32参数；装配公共DualStreamTurnSearchAI的v6回合搜索，780毫秒主预算、220节点、束宽6、最多3单位、完整队列。不套用旧0.5M外置校准，使用2M自身价值头。网络及搜索均在手机执行，同步FIFO仅连接同机Node与PyTorch进程。', '',
             '五张官方双人图各换边一次，两类对手各10局、先后手各5局。SD、300初始金币、30人口上限、等级上限3。', '',
             '预算为每局10000动作、200回合、1800秒有效墙钟；温控等待另计。截断与错误不计自然胜负。', '',
             '| 对手 | 胜 | 负 | 和 | 截断/错误 | 模型平均毫秒 | P95毫秒 | 最大毫秒 |',
             '|---|---:|---:|---:|---:|---:|---:|---:|']
    for name, label in [('hard', 'APK困难脚本桥接'), ('simple', '简单启发式')]:
        b = buckets[name]; c = b['outcomes']; t = b['latency']['model']
        wins = c.get('model_win', 0) + c.get('surrender_win', 0)
        losses = c.get('model_loss', 0) + c.get('surrender_loss', 0)
        draws = c.get('natural_draw', 0)
        lines.append(f"| {label} | {wins} | {losses} | {draws} | {10-wins-losses-draws} | {t['meanMs']:.2f} | {t['p95Ms']:.2f} | {t['maxMs']:.2f} |")
    lines += ['', '端到端耗时包含合法动作生成、搜索分支编码、同机通信、各次网络前向、动作选择及在线合法性确认，不包含真实引擎执行和日志写入。根决策和队列动作分别统计；一根可有多次前向，不能把每步前向累计耗时当成单次网络速度。780毫秒是主搜索预算，既有反扑最多再借用70毫秒；同步前向及系统调度可使实际耗时更长，超时原样报告。', '',
              '开始前单独做3次不执行动作的前向预热。两线程PyTorch inference_mode，所有参数requires_grad=false，没有优化器、反向或训练。', '',
              '## 逐局结果', '', '| 对手 | 地图 | 模型手序 | 结果 | 动作数 | 回合数 |', '|---|---|---|---|---:|---:|']
    for r in results:
        lines.append(f"| {r['slot']['opponent']} | {r['mapName']} | {'先手' if r['slot']['seat']==0 else '后手'} | {r['classification']} | {r['steps']} | {r['rounds']} |")
    lines += ['', '## 搜索根和队列耗时', '', '| 对手 | 根数 | 根平均ms | 根P95ms | 根最大ms | 队列步数 | 队列平均ms | 队列P95ms | 搜索节点 |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|']
    for name in ['hard', 'simple']:
        b = buckets[name]; r = b['latency']['searchRoot']; q = b['latency']['searchQueue']; s = b['search']
        lines.append(f"| {name} | {r['count']} | {r['meanMs']:.2f} | {r['p95Ms']:.2f} | {r['maxMs']:.2f} | {q['count']} | {q['meanMs']:.2f} | {q['p95Ms']:.2f} | {s['nodes']} |")
    baseline = HERE.parent / 'phone_2414_arena_20261027/SUMMARY.json'
    if baseline.exists():
        old = json.loads(baseline.read_text(encoding='utf-8'))
        comparison = {}
        for name in ['hard', 'simple']:
            current = buckets[name]['outcomes']; previous = old['buckets'][name]['outcomes']
            comparison[name] = {'withoutSearch': previous, 'withSearch': current}
        summary['baselineComparison'] = comparison
        write(HERE / 'SUMMARY.json', summary)
        lines += ['', '## 同地图同种子的无搜索基线', '', json.dumps(comparison, ensure_ascii=False), '',
                  '两次评测的模型二进制SHA、地图初态、对手种子及共有公共源码完全一致。v6框架同时包含其既有战术候选排序、风险守卫和队列，区别于无搜索版softPriors直接argmax，比较反映整套推理策略，不能把差异只归因于展开节点。搜索采用墙钟预算，设备状态会影响展开节点数；仅20局开发面板，不宣称独立泛化或显著棋力提升。']
    lines += ['', '## 困难桥接诊断', '', json.dumps(buckets['hard']['hardTelemetry'], ensure_ascii=False), '',
              '完整逐步记录位于results/matches/<局ID>/steps.jsonl；每步保留动作、前后摘要、端到端/编码/前向耗时及困难桥接诊断。此次只静态核对文件摘要和保存日志链，没有重新执行任何已记录动作，不做重放校验。', '',
              '这20局用于固定地图和当前运行设置下的小样本评测；地图可能与预训练来源重叠，不视为独立未知地图泛化结论。']
    (HERE / 'REPORT.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(json.dumps({'games': 20, 'buckets': buckets, 'filesVerified': len(verified)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
