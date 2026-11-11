import os
import hashlib
import json

r7_dir = 'ai_training/r7_training_stage_20261014_083500'

protected_files = [
    'src/game/engine.ts',
    'src/game/rules.ts',
    'src/game/types.ts',
    'src/game/env.ts',
    'src/game/apk_skirmish.ts',
    'src/game/units.ts',
    'src/game/abilities.ts',
    'src/game/terrain_rules.ts',
    'src/game/apk_terrain.ts',
    'src/game/apk_manifest.ts',
    'src/game/apk_skirmish_map_assets.ts',
    'src/game/ai/heuristic_ai.ts',
    'src/game/ai/spatial_conv_net.ts',
    'package.json',
    'ai_training/v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json',
    'ai_training/v19/out/run_20260929_v19_02/experiments/ppo_w1/s42/ppo_w1.json',
    'ai_training/v19/out/run_20260929_v19_02/experiments/ppo_w1/s42/ppo_w1.train_state.pt',
    'ai_training/v17/teachers/battle_search_b100.ts',
    'ai_training/r6_model_training_20261014_063500/artifacts/models/arm_a_warm_start.json',
    'ai_training/r6_model_training_20261014_063500/artifacts/models/arm_b_scratch.json',
    'ai_training/r6_model_training_20261014_063500/scratch/data/train_pool.json',
    'ai_training/r6_model_training_20261014_063500/scratch/data/val_pool.json'
]

hashes = {}
for p in protected_files:
    if os.path.exists(p):
        with open(p, 'rb') as f:
            h = hashlib.sha256(f.read()).hexdigest()
        hashes[p] = {'status': 'exists', 'sha256': h}
    else:
        hashes[p] = {'status': 'missing', 'sha256': None}

out_path = os.path.join(r7_dir, 'artifacts', 'protected_assets_check.json')
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump({'stage': 'R7_START', 'assets': hashes}, f, indent=2, ensure_ascii=False)

print('Protected assets check saved. Total checked:', len(protected_files))
for p, v in hashes.items():
    sha = v['sha256'][:12] if v['sha256'] else ''
    print(f"{p}: {v['status']} {sha}")
