"""仅为尚未采样的第2代升级训练合同；同运行时基准保留原身份并建立关联。"""
import importlib.util
import importlib.metadata
import json
import msvcrt
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from bootstrap import HERE, ROOT, digest


def main():
    lease = (HERE / 'run.lease').open('a+b'); lease.seek(0)
    msvcrt.locking(lease.fileno(), msvcrt.LK_NBLCK, 1)
    try:
        old_path = HERE / 'RUN_CONTRACT.json'
        old = json.loads(old_path.read_text('utf-8')); previous_sha = digest(old_path)
        state = json.loads((HERE / 'league-state.json').read_text('utf-8'))
        assert state['currentGeneration'] == 1 and state['championGeneration'] == 0
        assert not (HERE / 'generations/gen_02/league-plan.json').exists(), '已经采样登记，不允许此修订'
        assert not list((HERE / 'generations/gen_02').glob('**/actions.jsonl.gz'))
        changed = [n for n, h in old['sourceIdentity'].items() if digest(ROOT / n) != h]
        allowed = {f'ai_training/{HERE.name}/' + name for name in ['mixed_batches.py', 'test_v2_contracts.py', 'extract.ts', 'promotion_contract.py']}
        assert set(changed) == allowed, f'超出训练流修订范围:{changed}'
        assert all(digest(ROOT / n) == h for n, h in old['runtimeIdentity'].items()), '推理发生变化，必须新建全部基准'
        spec = importlib.util.spec_from_file_location('frozen_coordinator', HERE / 'run_league.py')
        coordinator = importlib.util.module_from_spec(spec); spec.loader.exec_module(coordinator)
        try:
            coordinator.verify_runtime_contract()
            raise RuntimeError('旧守卫没有拒绝变化的训练源码')
        except AssertionError as error:
            guard_rejection = str(error)
        receipts = {}
        for name in ['champion-pure-arena', 'champion-search-arena']:
            plan_path, summary_path = HERE / name / 'plan.json', HERE / name / 'arena-summary.json'
            plan, summary = coordinator.read(plan_path), coordinator.read(summary_path)
            assert summary['complete'] and summary['completedSlots'] == 56 and summary['strictAllAttempts']
            assert plan['runContractSha256'] == previous_sha and plan['runtimeIdentity'] == old['runtimeIdentity']
            receipts[name] = dict(planSha256=digest(plan_path), summarySha256=digest(summary_path), contractSha256=previous_sha, unchangedInference=True, slots=56)
        parity_path = HERE / 'generations/gen_00/tri-runtime-parity.json'
        assert coordinator.read(parity_path)['passed']
        receipts['gen00Parity'] = dict(sha256=digest(parity_path), runtimeIdentity=old['runtimeIdentity'], unchangedInference=True)
        revision = HERE / 'training-revisions/v2_2'; revision.mkdir(parents=True, exist_ok=False)
        shutil.copyfile(old_path, revision / 'previous-run-contract.json')
        snapshot = revision / 'source-snapshot'
        identities = dict(old['sourceIdentity'])
        additions = [HERE / 'source_counts.ts', HERE / 'league_quality.ts', HERE / 'revise_training_v22.py', ROOT / 'ai_training/run.mjs', HERE.parent / 'dual_stream_v2_phase3_20261020/calibrate.py', HERE.parent / 'dual_stream_v2_phase3_20261020/train.py']
        for source in additions:
            identities[str(source.relative_to(ROOT)).replace('\\', '/')] = digest(source)
        for name in identities:
            source = ROOT / name; identities[name] = digest(source)
            target = snapshot / name; target.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(source, target)
        updated = dict(old)
        updated.update(schema='dual-v2-gen02-run-v2.2', frozenAt=datetime.now(timezone.utc).isoformat(), previousContractSha256=previous_sha, revisionReason='按精确样本进度交错，并将60局采样双方超时、反扑、数值及队列质量直接纳入晋升；推理不变', sourceIdentity=identities, sourceSnapshot=str(snapshot.relative_to(HERE)), sameRuntimeReceipts=receipts, frozenBeforeGeneration2Sampling=True)
        updated['training'] = dict(old['training'], mixing='按精确准入样本总数的累计进度交错；8局专家轮转；128样本/64MB确定性洗牌', sourceCountContract='sample-progress-interleave-v3')
        updated['evaluation'] = dict(old['evaluation'], leagueQualitySources='60局采样的双方超时、错误/未知停止、真实反扑完成度、数值、根最大和队列最大均直接进入晋升', promotionContractSourceSha256=digest(HERE / 'promotion_contract.py'))
        updated['runtimeVersions'] = dict(python=sys.version, executable=sys.executable, torch=importlib.metadata.version('torch'), numpy=importlib.metadata.version('numpy'), node=subprocess.check_output(['node', '--version'], text=True).strip())
        coordinator.save(revision / 'revision-receipt.json', dict(previousContractSha256=previous_sha, changed=changed, added=[str(p.relative_to(ROOT)) for p in additions], originalGuardRejected=True, guardRejection=guard_rejection, runtimeUnchanged=True, baselineReceiptsPreserved=receipts, noGeneration2SamplingYet=True, promotionSourceUnchanged=digest(HERE / 'promotion_contract.py') == old['sourceIdentity'][f'ai_training/{HERE.name}/promotion_contract.py']))
        coordinator.save(old_path, updated)
        coordinator.verify_runtime_contract()
        print(json.dumps(dict(schema=updated['schema'], sha256=digest(old_path), originalGuardRejected=True, runtimeUnchanged=True, baselineSlots=112)))
    finally:
        lease.seek(0); msvcrt.locking(lease.fileno(), msvcrt.LK_UNLCK, 1); lease.close()


if __name__ == '__main__':
    main()
