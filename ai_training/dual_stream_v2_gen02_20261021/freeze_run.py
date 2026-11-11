"""冻结本次运行合同和源码快照，禁止以旧收据跨越源码身份。"""
import json
import shutil
from datetime import datetime, timezone
from bootstrap import HERE, OLD, ROOT, digest


def main():
    target = HERE / 'RUN_CONTRACT.json'
    previous = None
    snapshot_root = HERE / 'run-source-snapshot'
    if target.exists():
        assert not list(HERE.glob('**/actions.jsonl.gz')), '已有动作证据，必须新建运行目录'
        previous = digest(target)
        history = HERE / 'run-contract-history'
        history.mkdir(exist_ok=True)
        archive = history / (previous + '.json')
        assert not archive.exists(), '旧合同已经归档，拒绝重复修订'
        shutil.copyfile(target, archive)
        snapshot_root = HERE / ('run-source-snapshot-' + previous[:12])
        assert not snapshot_root.exists(), '源码快照路径已经存在'
    files = []
    for folder, patterns in [(HERE, ['*.py', '*.ts', '*.mjs']), (ROOT / 'src/ai_runtime/dual_v2', ['*.ts']), (ROOT / 'src/game', ['*.ts']), (HERE.parent / 'dual_stream_v2_phase2_20261020', ['*.py']), (HERE.parent / 'dual_stream_v2_phase1_20261020', ['*.ts'])]:
        for pattern in patterns:
            files += list(folder.glob(pattern))
    files += [HERE.parent / 'dual_stream_v2_phase3_20261020' / name for name in ['batch_model.py', 'source_loader.ts']]
    files += list((ROOT / 'src/game/ai').rglob('*.ts'))
    files += [HERE.parent / 'data_acceptance_20261016/replay/core.ts', ROOT / 'package.json', ROOT / 'package-lock.json']
    sources = {}
    for source in sorted(set(files)):
        name = str(source.relative_to(ROOT)).replace('\\', '/')
        sources[name] = digest(source)
        destination = snapshot_root / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
    start = json.loads((HERE / 'START_SNAPSHOT.json').read_text('utf-8'))
    protected = {n: h for n, h in start['files'].items() if n in ['src\\App.tsx', 'src\\game\\ai\\neural_ai_adapter.ts', 'src\\game\\ai\\ai_worker.ts', 'src\\main.tsx', 'src\\index.css']}
    assert all(digest(ROOT / n) == h for n, h in protected.items()), '受保护入口相对本次开工变化'
    contract = dict(schema='dual-v2-gen02-run-v2', frozenAt=datetime.now(timezone.utc).isoformat(), generation=2, parentGeneration=0, parentModelSha256=digest(OLD / 'generations/gen_00/model.bin'), predecessorStateSha256=digest(OLD / 'league-state.json'), training=dict(epochs=1, seed=20261023, baseRate=20000 / 141381, learningRate=.0001, cosineMinimum=.05, optimizer='AdamW', weightDecay=.0001, gradientClip=1., expertWeightScale=.5, championKl=.5, rootScalarWeight=0., frozen='共享空间/实体编码器与价值头、价值校准及外置动作偏置', trainable='Who/Where/What/目标指针与内部headBias', mixing='源批次轮流读取，8局专家流轮转，128样本/64MB有界洗牌，输入SHA与游标恢复', oldExpertPool='隔离保留，不进入本代'), evaluation=dict(panels=dict(fixed=20, expanded=20, **{'3ffa': 4, '4ffa': 8, '2v2': 4}), strategies=['pure', 'turn_search'], sameRuntimeChampionRebuilt=True, independentBlindTest=False, useBattleForHyperparameters=False, maxDecisionMs=1000, queueMaximumMsExclusive=1, retaliation='每候选相同两条敌方链及相同墙钟机会；静态覆盖单列，未完成不得接管'), disk=dict(directoryMaximumBytes=295000000, minimumFreeGiB=12, historyReadOnly=True, oldDirectoryBaselineBytes=start['oldDirectoryBytes']), protectedEntrypoints=protected, sourceIdentity=sources, runtimeIdentity={n: h for n, h in sources.items() if n.startswith('src/ai_runtime/dual_v2/') and not n.endswith('.test.ts')})
    if previous:
        contract.update(previousContractSha256=previous, revisionReason='首次启动零动作即暴露Python同名calibrate导入遮蔽；显式绑定本代模块后重新冻结，不复用旧数值或对局收据', sourceSnapshot=str(snapshot_root.relative_to(HERE)), schema='dual-v2-gen02-run-v2.1')
    target.write_text(json.dumps(contract, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(dict(sourceFiles=len(sources), contractSha256=digest(target), oldGenerationEvidenceRewritten=False)))


if __name__ == '__main__':
    main()
