"""第4代输入身份、源码保全与确定性检查点。"""
import gzip
import os
import shutil
import torch
from data import DIR, ROOT
from run_league import read, save, sha


def inputs(protocol, folder):
    replay = [e for e in read(DIR / 'league-state.json')['replayBufferManifest'] if e['generation'] == 4]
    extraction = read(folder / 'extraction-summary.json')
    assert len(replay) == 1 and extraction['strictAllAttempts']
    assert not extraction['defaultMismatches'], '默认神经方案必须仍与教师纯策略一致，不能混入假纠错'
    data = [DIR / 'evaluation-exclusions.txt.gz', folder / 'league-plan.json', folder / 'league-plan-lock.json', DIR / 'phase53-audit/gen4-protocol.json']
    data += sorted((DIR.parent / 'dual_stream_v2_phase3_20261020/corpus').glob('*.jsonl.gz'))
    data += [DIR.parent / 'dual_stream_v2_phase3_20261020/split-manifest-v2-stage3.json']
    data += [DIR / (protocol['warmModel'] + '.' + s) for s in ['bin', 'json']]
    data += [DIR / 'generations/gen_03' / n for n in ['value-config.json', 'head-calibration.json', 'value-calibration.json']]
    data += [DIR / 'generations/gen_00' / n for n in ['model.bin', 'model.json', 'value-config.json', 'head-calibration.json']]
    plan = read(folder / 'league-plan.json')
    assert sha(folder / 'league-plan.json') == read(folder / 'league-plan-lock.json')['sha256']
    assert plan['distillationReferenceModel'] == protocol['warmModel'] and plan['distillationReferenceSha256'] == protocol['warmSha256']
    data += [folder / 'games' / s['id'] / name for s in plan['slots'] for name in ['samples.jsonl.gz', 'result.json', 'strict-replay.json', 'extraction.json']]
    data += [DIR / s['initialPath'] for s in plan['slots']]
    names = ['train_gen4_phase53.py', 'gen4_train_inputs.py', 'gen4_semantic_cache.py', 'gen4_policy_audit.py', 'gen4_dev_gates.py', 'semantic_joint_loss.py', 'prior_distillation.py', 'phase52_io.py', 'mixed_stream.py', 'data.py', 'stream.ts', 'league_stream.ts', 'common.ts', 'value_target.ts', 'calibrate_frozen.py']
    sources = [DIR / n for n in names]
    sources += list((DIR.parent / 'dual_stream_v2_phase2_20261020').glob('*.py'))
    sources += [DIR.parent / 'dual_stream_v2_phase3_20261020' / n for n in ['batch_model.py', 'source_loader.ts']]
    sources += list((DIR.parent / 'dual_stream_v2_phase1_20261020').glob('*.ts'))
    sources += list((ROOT / 'src/ai_runtime/dual_v2').glob('*.ts'))
    sources += list((ROOT / 'src/game').glob('*.ts'))
    identity = dict(protocolSha256=sha(DIR / 'phase53-audit/gen4-protocol.json'), warmSha256=protocol['warmSha256'], dataIdentity={os.path.relpath(p, DIR).replace('\\','/'):sha(p) for p in data}, sourceIdentity={p.relative_to(ROOT).as_posix():sha(p) for p in sources}, replayBufferManifest=replay)
    path = folder / 'training-input-identity.json'
    if path.exists(): assert read(path) == identity, '恢复时源码、数据或协议身份变化'
    else: save(path, identity)
    for source in sources:
        target = folder / 'training-source-snapshot' / source.relative_to(ROOT); target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists(): assert sha(target) == sha(source)
        else: shutil.copyfile(source, target)
    save(folder / 'training-source-snapshot.json', identity['sourceIdentity'])
    return identity


def save_ids(path, ids):
    value = {k:sorted(v) for k,v in ids.items()}
    payload = gzip.compress(__import__('json').dumps(value, ensure_ascii=False, separators=(',',':')).encode(), mtime=0)
    if path.exists(): assert path.read_bytes() == payload, '实际消费ID变化'
    else: path.write_bytes(payload)
    return dict(path=path.relative_to(DIR).as_posix(), sha256=sha(path), counts={k:len(v) for k,v in value.items()})


def checkpoint(path, value):
    settings = read(DIR / 'phase53-audit/gen4-protocol.json')['resource']
    used = sum(p.stat().st_size for p in DIR.rglob('*') if p.is_file() and not p.is_symlink())
    assert used + 20_000_000 < settings['evidenceCapBytes'] and shutil.disk_usage(DIR).free > settings['minimumFreeBytes'] + 20_000_000, '检查点暂存必须满足预登记证据与空闲守卫'
    temporary = path.with_suffix('.pt.tmp'); torch.save(value, temporary); temporary.replace(path)
