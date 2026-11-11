import argparse
import ctypes
import datetime
import hashlib
import json
import pathlib
import sys
import tarfile
import traceback
import time
import subprocess
import continuation_io as io

# 每段落盘和核验后继续同一局，只有原生胜负标志能结束一局。
sys.stdout.reconfigure(encoding='utf8')
parser = argparse.ArgumentParser()
parser.add_argument('--pid', type=int, required=True)
args = parser.parse_args()
folder = pathlib.Path(__file__).parent
local = pathlib.Path('C:/code/AncinetEmpires/captures/phone-continuation-61-20261015')
local.mkdir(exist_ok=True)
root = '/data/user/0/net.toyknight.aeii.android/files/.aeii/' + local.name
io.args = argparse.Namespace(pid=args.pid, preflight=False, min_battery=20)
io.source, io.local, io.root, io.run = folder, local, root, local.name
io.adb = 'C:/Users/SHIINA/OneDrive/Documents/闲聊/手机投屏/scrcpy-win64-v5.0.1/adb.exe'
io.base = json.loads((folder/'jobs.json').read_text(encoding='utf8'))['baseConfigName']

def write(name, value):
    partial = local/(name+'.partial')
    partial.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf8')
    partial.replace(local/name)
    if name=='continuation-status.json':
        completed=set(value['completed']);stopped=set(value.get('stopped',{}));active={j['originalId'] for j in value['pending']}
        if completed&stopped or completed&active or stopped&active or len(completed|stopped|active)!=61:
            raise RuntimeError('自然胜负、循环停止与运行中对局分类不一致')
        overrides=[]
        for ident,result in value['completed'].items():
            overrides.append(dict(original_id=ident,natural_end=True,winner_mask=result['winner_mask'],outcome_label_eligible=True,global_actions=result['global_end'],final_source=result['id'],archive=result['archive']))
        for ident,result in value.get('stopped',{}).items():
            overrides.append(dict(original_id=ident,natural_end=False,winner_mask=None,outcome_label_eligible=False,reason=result['reason'],global_actions=result['global_actions'],final_source=result['retained_final_source'],evidence=result['evidence']))
        write('continuation-outcomes.json',dict(schema='aeii-native-continuation-outcomes-v1',source_catalog='../phone-compressed-2000-20261015/dataset-3000-index.json',checked_round=value['round'],natural_ends_in_3000=2939+len(completed),stopped_cyclic_games=len(stopped),still_running=sorted(active),outcome_overrides=overrides,trajectory_segments='continuation-status.json#segments',note='循环僵持是停止采集标签，不是原生和局；保留所有轨迹，训练胜负标签禁用'))

def sha_archive_member(archive, member):
    # 导出已经核对每个成员，直接使用对应证据，避免反复扫描整个归档。
    evidence = json.loads(archive.with_suffix('.validation.json').read_text(encoding='utf8'))
    assert evidence['all_equal']
    return evidence['sha256'][member]

def policy():
    path = local/'stalemate-policy.json'
    return json.loads(path.read_text(encoding='utf8')) if path.exists() else {'confirmed': {}, 'review_pending': False}

def mark_stopped(state, job, result=None):
    decision = policy()['confirmed'][job['originalId']]
    state.setdefault('stopped', {})[job['originalId']] = dict(
        reason='confirmed_cyclic_stalemate', natural_end=False, winner_mask=None,
        outcome_label_eligible=False, evidence=decision,
        retained_final_source=job['id'] if result else job['sourceId'],
        global_actions=result['global_end'] if result else job['globalOffset'],
        retained_result=result, stopped_at=datetime.datetime.now().isoformat())

def main():
    catalog_path = local.parent/'phone-compressed-2000-20261015/dataset-3000-index.json'
    catalog = json.loads(catalog_path.read_text(encoding='utf8'))
    games = [g for g in catalog['games'] if not g['natural_end']]
    assert len(games) == 61
    manifest_path = local/'manifest.json'
    if not manifest_path.exists():
        pending = []
        for g in games:
            oldroot = '/data/user/0/net.toyknight.aeii.android/files/.aeii/' + pathlib.Path(g['manifest']).parent.name
            archive = catalog_path.parent/g['archive']
            validation = archive.parent/'transfer-validation.json' if int(g['id'][1:]) <= 1000 else archive.with_suffix('.validation.json')
            evidence = json.loads(validation.read_text(encoding='utf8'))
            assert evidence['all_equal']
            digest = evidence['sha256'][g['entry_prefix']+'final.bin']
            pending.append(dict(id=g['id']+'-c0001', originalId=g['id'], sourceRoot=oldroot, sourceId=g['id'], globalOffset=g['actions'], seed=g['seed'], map=g['map'], planId=g['planId'], planKind=g['planKind'], compressStreams=True, maxActions=100, expected_parent_sha256=digest))
        write('manifest.json', dict(original_catalog=str(catalog_path), original_catalog_sha256=hashlib.file_digest(catalog_path.open('rb'),'sha256').hexdigest(), jobs=pending, rule='原生AI及原生胜负判定保持不变；检查点不算胜负'))
    else:
        pending = json.loads(manifest_path.read_text(encoding='utf8'))['jobs']
    state_path = local/'continuation-status.json'
    state = json.loads(state_path.read_text(encoding='utf8')) if state_path.exists() else dict(round=0, completed={}, segments=[], pending=pending)
    state.setdefault('stopped', {})
    review_process=None
    while state['pending']:
        batch = state['pending']
        round_number = state['round']+1
        name = f'continuation-round-{round_number:04d}'
        existing = io.shell('ls '+root+' 2>/dev/null || true').split()
        # 已保存的当前段仍须导出核验；尚未执行的已确认僵持局不再派发。
        excluded = [j for j in batch if j['originalId'] in policy()['confirmed'] and j['id'] not in existing]
        for j in excluded:
            mark_stopped(state, j)
        if excluded:
            batch = [j for j in batch if j not in excluded]
            state.update(pending=batch, remaining_games=len(batch), stopped_games=len(state['stopped']))
            write('continuation-status.json', state)
        if not batch:
            break
        present = [j for j in batch if j['id'] in existing]
        if not present:
            if policy().get('review_pending'):
                state['status']='循环核查中，待核查完成后继续未僵持对局'
                write('continuation-status.json', state)
                print(json.dumps({'stage':'waiting-for-cycle-review','games':len(batch)},ensure_ascii=False),flush=True)
                while policy().get('review_pending'):
                    if review_process is not None and review_process.poll() is not None and review_process.returncode:
                        raise RuntimeError('自动循环核查失败，保留数据并停止派发；见cycle-review-auto.log')
                    time.sleep(5)
                # 核查可能新增单局停止决定，重新应用策略后再启动。
                continue
            io.ready()
            io.launch(batch, 8, 'continuation.rhino.js', name)
        # 已有目录时先等待原有共享队列，禁止重复分配尚未创建目录的排队任务。
        state.update(status='续跑中，当前段生成与核验',active_round=round_number,updated_at=datetime.datetime.now().isoformat())
        write('continuation-status.json',state)
        io.wait_jobs(batch, 'continue')
        archive = local/(name+'.tar.gz')
        results = io.export([j['id'] for j in batch], archive)
        io.verify_streams(archive, results)
        by_id = {r['id']: r for r in results}
        for j in batch:
            r = by_id[j['id']]
            initial_sha = sha_archive_member(archive, j['id']+'/initial.bin')
            if initial_sha != j['expected_parent_sha256'] or r['parent_final_sha256'] != initial_sha:
                raise RuntimeError('续跑状态链摘要不一致 '+j['id'])
            if r['global_offset'] != j['globalOffset'] or r['global_end'] != j['globalOffset']+r['actions']:
                raise RuntimeError('全局动作序号不连续 '+j['id'])
            if not r['natural_end'] and r['truncation_reason'] != 'continuation_checkpoint' and not (r['truncation_reason']=='confirmed_cyclic_stalemate' and j['originalId'] in policy()['confirmed']):
                raise RuntimeError('续跑遭中断，保留该段，待检查 '+j['id'])
        audits = [dict(id='audit-'+j['id'], sourceId=j['id'], sourceRoot=root, repeats=1, fromInitial=True) for j in batch]
        existing = io.shell('ls '+root).split()
        missing = [j for j in audits if j['id'] not in existing]
        if missing:
            io.launch(missing, 4, 'replaybench.rhino.js', name+'-audit')
        io.wait_jobs(audits, 'audit')
        checks = io.export([j['id'] for j in audits], local/(name+'-audits.tar.gz'))
        if not all(c['all_states_equal'] for c in checks):
            raise RuntimeError('续跑回放不一致')
        next_jobs = []
        for j in batch:
            r = by_id[j['id']]
            r['archive'] = archive.name
            r['all_native_replays_equal'] = True
            state['segments'].append(r)
            if r['natural_end']:
                state['completed'][j['originalId']] = r
            elif j['originalId'] in policy()['confirmed']:
                mark_stopped(state, j, r)
            else:
                nxt = dict(j, id=j['originalId']+f'-c{round_number+1:04d}', sourceRoot=root, sourceId=j['id'], globalOffset=r['global_end'], maxActions=2000)
                nxt['expected_parent_sha256'] = sha_archive_member(archive, j['id']+'/final.bin')
                next_jobs.append(nxt)
        state.update(round=round_number, pending=next_jobs, updated_at=datetime.datetime.now().isoformat(), status='运行结束：自然胜负与循环僵持分别标记' if not next_jobs else '续跑中', verified_natural_ends=len(state['completed']), stopped_games=len(state['stopped']), remaining_games=len(next_jobs), original_natural_ends=2939, total_natural_ends=2939+len(state['completed']))
        write('continuation-status.json', state)
        print(json.dumps({k:state[k] for k in ('round','verified_natural_ends','remaining_games','total_natural_ends')},ensure_ascii=False),flush=True)
        settings=policy()
        interval=settings.get('auto_review_every_rounds',10)
        if next_jobs and not settings.get('review_pending') and round_number-settings.get('last_review_round',33)>=interval:
            settings['review_pending']=True
            write('stalemate-policy.json',settings)
            log=(local/'cycle-review-auto.log').open('ab')
            review_process=subprocess.Popen([sys.executable,str(folder/'cycle_review_controller.py'),'--pid',str(args.pid)],stdout=log,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW)
            log.close()
    io.sample('no-runnable-games')

ctypes.windll.kernel32.SetThreadExecutionState(0x80000001)
try:
    main()
except BaseException:
    write('controller-error.json', dict(time=datetime.datetime.now().isoformat(), traceback=traceback.format_exc()))
    raise
finally:
    ctypes.windll.kernel32.SetThreadExecutionState(0x80000000)
