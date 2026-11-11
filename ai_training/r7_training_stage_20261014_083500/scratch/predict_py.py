import json
import torch
import numpy as np
import os
import sys

# 添加 research 目录到 path
sys.path.insert(0, os.path.abspath('ai_training/r7_training_stage_20261014_083500/research'))
from model import SpatialResNetPolicyValueNet, load_from_ppo_pt, export_model_to_ts_json

def main():
    pt_path = 'ai_training/v19/out/run_20260929_v19_02/experiments/ppo_w1/s42/ppo_w1.train_state.pt'
    json_export_path = 'ai_training/r7_training_stage_20261014_083500/artifacts/models/theta1_baseline.json'
    fixture_path = 'ai_training/r7_training_stage_20261014_083500/artifacts/parity_fixture_100.json'
    out_py_pred = 'ai_training/r7_training_stage_20261014_083500/artifacts/py_predictions.json'

    model = SpatialResNetPolicyValueNet(in_channels=34, trunk_channels=32, global_dim=20, action_semantic_dim=53)
    load_from_ppo_pt(model, pt_path)
    model.eval()

    # 导出为 TS JSON 格式供 TS 侧加载
    export_model_to_ts_json(model, json_export_path)

    with open(fixture_path, 'r', encoding='utf-8') as f:
        samples = json.load(f)

    py_results = []
    with torch.no_grad():
        for s in samples:
            spatial = torch.tensor(s['spatial'], dtype=torch.float32).view(1, 34, 20, 20)
            glob = torch.tensor(s['global'], dtype=torch.float32).view(1, 20)

            Z = model.forward_trunk(spatial) # [1, 32, 20, 20]
            val = model.forward_value(Z, glob).item()

            K = len(s['candidateSemantics'])
            if K > 0:
                act_coords = torch.tensor(s['candidateActorCoords'], dtype=torch.float32)
                land_coords = torch.tensor(s['candidateLandingCoords'], dtype=torch.float32)
                tar_coords = torch.tensor(s['candidateTargetCoords'], dtype=torch.float32)
                semantics = torch.tensor(s['candidateSemantics'], dtype=torch.float32)

                logits = model.forward_policy_single(
                    Z.squeeze(0), glob.squeeze(0), act_coords, land_coords, tar_coords, semantics
                ).tolist()
                argmax_idx = int(np.argmax(logits))
            else:
                logits = []
                argmax_idx = -1

            py_results.append({
                'sampleId': s['sampleId'],
                'value': val,
                'actionLogits': logits,
                'argmaxIndex': argmax_idx
            })

    with open(out_py_pred, 'w', encoding='utf-8') as f:
        json.dump(py_results, f, indent=2)

    print(f"Computed PyTorch predictions for {len(py_results)} samples, saved to {out_py_pred}")

if __name__ == '__main__':
    main()
