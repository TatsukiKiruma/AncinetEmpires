#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""V15/T15-08：初始状态独立性探针（发现冻结清单的真实初始条件数）。

背景（本会话实测发现）：
  `rootSeed` 变化**不会**改变 SD 计划的初始状态；同一张地图上的 4 个 dev block 与
  data_collection 的 16 对 root 里存在多组"只有 `state.metadata.sdTrainingSeed` 不同、
  其余状态逐字段相同"的 root。这会让「8 个独立 root block」「16 对 root」在
  **网络输入空间**里实际退化为更少的初始条件，直接影响 bootstrap 的独立单元解释。

做法：
  1. 用 `collect_dagger_arms_v15.ts --smoke-steps 1` 对每个 root 只跑 1 个原子步，
     把完整初始快照落盘（不产生训练数据，不写正式产物目录）；
  2. 对初始快照去掉 `metadata.sdTrainingSeed` 后逐字段比较，统计不同的初始条件数；
  3. 输出 `T15-08/root_independence_probe.json`（机器可读证据 + 最小复现命令）。

用法：
  python v15/tools/run_d_root_independence_probe.py --run-root v15/out/v15_20260925_core
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PY = sys.executable
NODE = 'node'


def initial_key(state: dict) -> str:
    """去掉只在元数据里记录 rootSeed 的字段，其余状态按规范序序列化。"""
    meta = {k: v for k, v in (state.get('metadata') or {}).items() if k != 'sdTrainingSeed'}
    rest = {k: v for k, v in state.items() if k != 'metadata'}
    return json.dumps({'state': rest, 'metadata': meta}, sort_keys=True, ensure_ascii=False)


def probe(run_root: Path, manifest: Path, out_dir: Path, tag: str, pairs_purpose: str) -> dict:
    """把任意 root 清单改写成采集器可跑的形态（只跑 1 步），再比较初始状态。"""
    src = json.loads(manifest.read_text(encoding='utf-8'))
    roots = []
    for r in src['roots']:
        if r.get('purpose') not in pairs_purpose:
            continue
        if tag == 'dev_panel':
            # dev 面板清单没有 subjectSeat 字段，用候选座位第一个；只影响行为配置，不影响初始状态。
            subject = (r.get('candidateSeats') or [0])[0]
        else:
            subject = r.get('subjectSeat', (r.get('candidateSeats') or [0])[0])
        roots.append({
            'blockId': r['blockId'], 'purpose': 'dataCollection.daggerPair', 'index': r['index'],
            'mapName': r['mapName'], 'scenarioId': r['scenarioId'], 'planId': r.get('planId', 'sd-normal'),
            'playerCount': r['playerCount'], 'rootSeed': r['rootSeed'], 'episodeIndex': r['episodeIndex'],
            'rootFamilyId': r['rootFamilyId'], 'subjectSeat': subject,
            'armBehaviorPolicy': {}, 'otherSeatsBehaviorPolicy': 'H0',
        })
    probe_manifest = out_dir.parent / f'probe_manifest_{tag}.json'
    probe_manifest.write_text(json.dumps({
        'schema': 'v15_root_independence_probe_manifest_1', 'manifestId': f'probe_{tag}',
        'runId': src.get('runId'), 'purpose': '诊断：核对初始网络输入是否随 rootSeed 变化（--smoke-steps 1）',
        'daggerPairInitialCount': len(roots), 'maxDaggerPairs': len(roots), 'roots': roots,
    }, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')

    out_dir.mkdir(parents=True, exist_ok=True)
    log_path = out_dir.parent / '_logs' / f'probe_{tag}.log'
    log_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [NODE, '--openssl-legacy-provider', 'v12/tools/run-tool.mjs',
           'v15/tools/collect_dagger_arms_v15.ts', '--run-id', run_root.name, '--arm', 'D1',
           '--manifest', str(probe_manifest.relative_to(REPO)).replace('\\', '/'),
           '--out-dir', str(out_dir.relative_to(REPO)).replace('\\', '/'), '--smoke-steps', '1']
    with log_path.open('w', encoding='utf-8') as fh:
        rc = subprocess.run(cmd, cwd=str(REPO), stdout=fh, stderr=subprocess.STDOUT, shell=False).returncode

    states = {}
    for path in sorted(out_dir.glob('*.jsonl')):
        with path.open('r', encoding='utf-8') as fh:
            root = json.loads(fh.readline())
        states[root['blockId']] = {
            'rootSeed': root['rootSeed'], 'mapName': root['mapName'],
            'initialStateHash': root['initialStateHash'], 'key': initial_key(root['initialState']),
        }
    groups = defaultdict(list)
    for block, info in states.items():
        groups[info['key']].append({'blockId': block, 'rootSeed': info['rootSeed']})
    return {
        'tag': tag, 'manifest': str(manifest.relative_to(REPO)).replace('\\', '/'),
        'rootsProbed': len(states), 'distinctInitialStates': len(groups),
        'distinctInitialStateHashes': len({v['initialStateHash'] for v in states.values()}),
        'groups': sorted((sorted(g, key=lambda x: x['blockId']) for g in groups.values()),
                         key=lambda g: g[0]['blockId']),
        'rc': rc, 'command': ' '.join(cmd),
        'note': 'distinctInitialStateHashes 永远等于 root 数（stateHash 含 metadata.sdTrainingSeed）；'
                'distinctInitialStates 才是网络输入空间里的真实初始条件数。',
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--run-root', default='v15/out/v15_20260925_core')
    args = ap.parse_args()
    run_root = (REPO / args.run_root).resolve()
    task = run_root / 'T15-08'
    out = {
        'schema': 'v15_root_independence_probe_1',
        'runId': run_root.name,
        'purpose': '核对冻结清单里「独立 root」在**网络输入空间**中的真实独立度',
        'probes': [],
    }
    out['probes'].append(probe(run_root, run_root / 'T15-00' / 'root_manifests' / 'dev_panel_roots.json',
                               task / 'probe_dev_roots', 'dev_panel', {'devPanel'}))
    # 采集清单：直接用已完成的 D1 采集（每 root 的 root 行就是完整初始快照），不重复跑。
    collect = task / 'collect_D1'
    states = {}
    if collect.exists():
        for path in sorted(collect.glob('*.jsonl')):
            if path.name.endswith('.partial.jsonl'):
                continue
            with path.open('r', encoding='utf-8') as fh:
                root = json.loads(fh.readline())
            states[root['blockId']] = {'rootSeed': root['rootSeed'], 'mapName': root['mapName'],
                                       'initialStateHash': root['initialStateHash'],
                                       'key': initial_key(root['initialState'])}
    groups = defaultdict(list)
    for block, info in states.items():
        groups[info['key']].append({'blockId': block, 'rootSeed': info['rootSeed']})
    out['probes'].append({
        'tag': 'data_collection_D1', 'manifest': 'T15-00/root_manifests/data_collection_roots.json',
        'rootsProbed': len(states), 'distinctInitialStates': len(groups),
        'distinctInitialStateHashes': len({v['initialStateHash'] for v in states.values()}),
        'groups': sorted((sorted(g, key=lambda x: x['blockId']) for g in groups.values()),
                         key=lambda g: g[0]['blockId']),
        'note': '数据来自已完成的 D1 采集（root 行含完整初始快照）。',
    })
    (task / 'root_independence_probe.json').write_text(
        json.dumps(out, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    for p in out['probes']:
        print(f"[probe] {p['tag']}: roots={p['rootsProbed']} 不同初始状态={p['distinctInitialStates']} "
              f"（stateHash 不同={p['distinctInitialStateHashes']}）")
        for g in p['groups']:
            if len(g) > 1:
                print('   DUP', [x['blockId'] for x in g])
    print(f"[probe] → {task / 'root_independence_probe.json'}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
