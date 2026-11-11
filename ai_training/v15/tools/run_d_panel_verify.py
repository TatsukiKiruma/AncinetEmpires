#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""V15/T15-09B：开发面板执行前后的身份与覆盖面核验（owner C 的执行侧证据）。

检查项（任务书 §10.2「逐模型校验权重/schema/runtimeId 后再执行」）：
  1. 权重文件真实字节 SHA 的前 12 位必须等于该模型所有行的 modelId 里的 sha12；
  2. 每个模型行声明的 encoderSchema 必须是冻结 schema（候选）或 heuristic/na（镜像）；
  3. 全表 runtimeId 相关的引擎/策略源码摘要、rngContract、actionFilter、caps 必须逐行一致；
  4. 计划里的 240 个候选臂 gameId 与 8 个镜像实体（按座位展开 20 行）逐项对账：
     已执行/自然完成/截断/错误/缺失分别列出，不把"没跑"写成"完成"。

用法：
  python v15/tools/run_d_panel_verify.py --run-root v15/out/v15_20260925_core \
      --models "c2:42=<path>,c2:1337=<path>,..."
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
FROZEN_CAPS = {'maxStepsAtomicActions': 12000, 'wallTimeoutMs': 300000}
EXPECTED_RNG = 'heuristic-seatstream-v1'


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as fh:
        for b in iter(lambda: fh.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--run-root', default='v15/out/v15_20260925_core')
    ap.add_argument('--panel', default='dev')
    ap.add_argument('--models', default='', help='modelKey=path,...')
    args = ap.parse_args()
    run_root = (REPO / args.run_root).resolve()
    protocol = json.loads((run_root / 'T15-00' / 'protocol.json').read_text(encoding='utf-8'))
    blocks = protocol['devPanelRootList']['blocks']
    models = {}
    for item in args.models.split(','):
        item = item.strip()
        if item and '=' in item:
            k, v = item.split('=', 1)
            models[k] = (REPO / v).resolve()

    rows: list[dict] = []
    files = sorted((run_root / 'T15-09' / 'matches').glob(f'{args.panel}_*.games.jsonl'))
    for path in files:
        for line in path.read_text(encoding='utf-8', errors='replace').splitlines():
            line = line.strip()
            if line:
                row = json.loads(line)
                row['_file'] = path.name
                rows.append(row)

    report: dict = {'schema': 'v15_dev_panel_verification_1', 'runId': protocol['runId'],
                    'panelId': args.panel, 'files': [p.name for p in files], 'rows': len(rows),
                    'checks': {}, 'coverage': {}}

    # 1) 权重 sha12 与 modelId 一致
    sha_checks = {}
    for key, path in models.items():
        if not path.exists():
            sha_checks[key] = {'status': 'MISSING_FILE', 'path': str(path)}
            continue
        sha12 = sha256_file(path)[:12]
        mine = [r for r in rows if r.get('arm') == 'CANDIDATE' and r.get('modelTag') == key]
        bad = [r.get('gameId') for r in mine
               if f':{sha12}|' not in str(r.get('gameId')) or r.get('checkpointSha256') != sha256_file(path)]
        sha_checks[key] = {
            'status': 'OK' if mine and not bad else ('NO_ROWS' if not mine else 'MISMATCH'),
            'checkpointPath': str(path).replace('\\', '/'),
            'checkpointSha256': sha256_file(path),
            'sha12': sha12, 'rows': len(mine), 'mismatched': bad[:5],
            'declaredEncoderSchema': sorted({r.get('encoderSchema') for r in mine}),
        }
    report['checks']['weightIdentity'] = sha_checks

    # 2) schema 必须是冻结值（候选）/ heuristic（镜像）
    cand_schemas = sorted({r.get('encoderSchema') for r in rows if r.get('arm') == 'CANDIDATE'})
    mir_schemas = sorted({r.get('encoderSchema') for r in rows if r.get('arm') == 'MIRROR'})
    report['checks']['schema'] = {
        'candidateSchemas': cand_schemas,
        'mirrorSchemas': mir_schemas,
        'ok': cand_schemas == ['spatial26_global20_actionSemantics53_v15'] and mir_schemas == ['heuristic/na'],
    }

    # 3) runtimeId 一致性
    # 中文：engineSourceDigest / policySourceDigest / rngContract / actionFilterVersion 必须全表唯一；
    # mapHash 与 rulesHash 天然按地图各有 1 个值（两张图），因此单独按「地图内唯一」检查。
    fields = ['engineSourceDigest', 'policySourceDigest', 'rngContract', 'actionFilterVersion']
    uniq = {f: sorted({str(r.get(f)) for r in rows}) for f in fields}
    per_map = {}
    for r in rows:
        per_map.setdefault(str(r.get('mapName')), {'mapHash': set(), 'rulesHash': set()})
        per_map[str(r.get('mapName'))]['mapHash'].add(str(r.get('mapHash')))
        per_map[str(r.get('mapName'))]['rulesHash'].add(str(r.get('rulesHash')))
    per_map = {m: {k: sorted(v) for k, v in d.items()} for m, d in per_map.items()}
    caps = {f: sorted({r.get(f) for r in rows}, key=str) for f in ('maxSteps', 'maxPlies', 'wallTimeoutMs')}
    report['checks']['runtimeIdentity'] = {
        'uniqueValues': uniq, 'perMapHash': per_map, 'caps': caps,
        'ok': all(len(v) == 1 for v in uniq.values())
              and all(len(v['mapHash']) == 1 and len(v['rulesHash']) == 1 for v in per_map.values())
              and caps['maxSteps'] == [FROZEN_CAPS['maxStepsAtomicActions']]
              and caps['wallTimeoutMs'] == [FROZEN_CAPS['wallTimeoutMs']]
              and uniq['rngContract'] == [EXPECTED_RNG],
        'note': 'mapHash/rulesHash 按地图唯一；其余运行身份字段全表唯一。',
    }

    # 4) 计划覆盖面：240 候选臂 + 8 镜像实体（20 个座位视角行）
    by_model_block: dict[tuple, list[dict]] = defaultdict(list)
    for row in rows:
        by_model_block[(row.get('modelTag'), row.get('blockId'))].append(row)
    planned_candidate = 0
    executed_candidate = 0
    natural_candidate = 0
    per_model = {}
    missing: list[dict] = []
    for key in (models or sorted({r.get('modelTag') for r in rows if r.get('arm') == 'CANDIDATE'})):
        stat = {'planned': 0, 'executed': 0, 'natural': 0, 'truncated': 0, 'errors': 0, 'missing': []}
        for block in blocks:
            for seat in block['candidateSeats']:
                stat['planned'] += 1
                planned_candidate += 1
                match = [r for r in by_model_block.get((key, block['blockId']), [])
                         if r.get('arm') == 'CANDIDATE' and r.get('candidateSeat') == seat]
                if not match:
                    stat['missing'].append(f"{block['blockId']}#seat{seat}")
                    missing.append({'model': key, 'blockId': block['blockId'], 'seat': seat, 'arm': 'CANDIDATE'})
                    continue
                stat['executed'] += 1
                executed_candidate += 1
                kind = match[0].get('outcomeKind')
                if kind.startswith('NATURAL'):
                    stat['natural'] += 1
                    natural_candidate += 1
                elif kind in ('POLICY_ERROR', 'ENGINE_ERROR'):
                    stat['errors'] += 1
                else:
                    stat['truncated'] += 1
        per_model[key] = stat

    mirror_stat = {'plannedEntities': len(blocks), 'observedEntities': 0, 'plannedSeatRows': 0,
                   'observedSeatRows': 0, 'naturalSeatRows': 0, 'missing': []}
    mirror_rows = [r for r in rows if r.get('arm') == 'MIRROR']
    for block in blocks:
        mirror_stat['plannedSeatRows'] += len(block['candidateSeats'])
        mine = [r for r in mirror_rows if r.get('blockId') == block['blockId']]
        if len(mine) == len(block['candidateSeats']):
            mirror_stat['observedEntities'] += 1
        else:
            mirror_stat['missing'].append(block['blockId'])
        mirror_stat['observedSeatRows'] += len(mine)
        mirror_stat['naturalSeatRows'] += sum(1 for r in mine if str(r.get('outcomeKind')).startswith('NATURAL'))

    report['coverage'] = {
        'candidate': {'planned': planned_candidate, 'executed': executed_candidate,
                      'natural': natural_candidate,
                      'naturalRate': None if not planned_candidate else natural_candidate / planned_candidate,
                      'missingCount': len(missing), 'missing': missing[:20]},
        'mirror': mirror_stat,
        'perModel': per_model,
        'integrity': {
            'duplicateGameIds': len(rows) - len({r.get('gameId') for r in rows}),
            'errorRows': sum(1 for r in rows if r.get('outcomeKind') in ('POLICY_ERROR', 'ENGINE_ERROR')),
            'fallbackRows': sum(1 for r in rows if r.get('fallbackUsed') is True),
            'rowsWithErrorText': sum(1 for r in rows if r.get('error')),
        },
    }
    out = run_root / 'T15-09' / f'{args.panel}_panel_verification.json'
    out.write_text(json.dumps(report, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'[verify-panel] → {out}')
    print(f"  权重身份: { {k: v['status'] for k, v in sha_checks.items()} }")
    print(f"  schema: {report['checks']['schema']}")
    print(f"  runtimeId 一致: {report['checks']['runtimeIdentity']['ok']}")
    print(f"  候选臂 {executed_candidate}/{planned_candidate} 自然 {natural_candidate}；"
          f"镜像实体 {mirror_stat['observedEntities']}/{mirror_stat['plannedEntities']}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
