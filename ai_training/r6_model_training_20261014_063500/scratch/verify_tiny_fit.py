import json
import time
import sys
from pathlib import Path

# Add python path
sys.path.insert(0, str(Path(r'C:\code\AncinetEmpires\ai_training\python')))
import torch
import torch.nn as nn
import torch.optim as optim
from spatial_resnet_model import SpatialResNet, export_model_to_ts_json

def extract_coord_feature(z: torch.Tensor, coords: list) -> torch.Tensor:
    """
    z: [32, 20, 20]
    coords: list of [x, y], len = K
    Returns: [K, 32]
    """
    K = len(coords)
    feats = torch.zeros((K, 32), dtype=torch.float32, device=z.device)
    for i, (x, y) in enumerate(coords):
        if 0 <= x < 20 and 0 <= y < 20:
            feats[i] = z[:, y, x]
    return feats

def run_tiny_fit():
    print("=== Running Tiny-Fit Engineering Verification (128 Samples) ===")
    data_path = Path(r'C:\code\AncinetEmpires\ai_training\r6_model_training_20261014_063500\scratch\tiny_128_samples.json')
    with open(data_path, 'r', encoding='utf-8') as f:
        samples = json.load(f)
    print(f"Loaded {len(samples)} samples from {data_path}")

    # Build model (34 channels, 53 action semantic dims)
    # pol_in_dim = 32 * 3 + 53 = 149
    model = SpatialResNet(
        spatial_channels=34,
        trunk_channels=32,
        global_dim=20,
        action_semantic_dim=53,
        version="spatial-resnet-v2",
        num_blocks=2,
        global_policy_pool=False
    )
    optimizer = optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)

    # Convert samples to tensors
    N = len(samples)
    spatial_tensors = [torch.tensor(s['spatial'], dtype=torch.float32).reshape(34, 20, 20) for s in samples]
    global_tensors = [torch.tensor(s['global'], dtype=torch.float32) for s in samples]

    print("Beginning 120 optimization steps...")
    start_time = time.time()

    loss_history = []
    top1_history = []

    for step in range(120):
        # Sample mini-batch of 16
        batch_indices = torch.randint(0, N, (16,)).tolist()
        total_loss = 0.0
        correct_count = 0

        optimizer.zero_grad()
        for idx in batch_indices:
            s = samples[idx]
            x_spatial = spatial_tensors[idx].unsqueeze(0) # [1, 34, 20, 20]
            x_global = global_tensors[idx].unsqueeze(0)   # [1, 20]
            z = model.forward_trunk(x_spatial)[0]          # [32, 20, 20]

            actor_f = extract_coord_feature(z, s['candidateActorCoords'])
            landing_f = extract_coord_feature(z, s['candidateLandingCoords'])
            target_f = extract_coord_feature(z, s['candidateTargetCoords'])
            semantics = torch.tensor(s['candidateSemantics'], dtype=torch.float32) # [K, 53]

            # Concat to 169 dims: [actor_f, landing_f, target_f, semantics, global_f]
            K = semantics.shape[0]
            global_expanded = x_global.expand(K, -1)
            action_feats = torch.cat([actor_f, landing_f, target_f, semantics, global_expanded], dim=-1).unsqueeze(0) # [1, K, 169]
            logits = model.forward_action_logits(action_feats)[0] # [K]

            target_idx = s['targetActionIndex']
            target_tensor = torch.tensor([target_idx], dtype=torch.long)

            loss = nn.functional.cross_entropy(logits.unsqueeze(0), target_tensor)
            loss.backward()

            total_loss += loss.item()
            if torch.argmax(logits).item() == target_idx:
                correct_count += 1

        optimizer.step()

        avg_loss = total_loss / 16.0
        acc = correct_count / 16.0
        loss_history.append(avg_loss)
        top1_history.append(acc)

        if (step + 1) % 20 == 0 or step == 0:
            print(f"  Step {step+1:3d}/120 | Loss: {avg_loss:.4f} | Batch Top-1: {acc*100:.1f}%")

    elapsed = time.time() - start_time
    print(f"\nTraining completed in {elapsed:.2f}s ({elapsed/120*1000:.1f}ms/step).")

    # Evaluate memorization on full 128 samples
    model.eval()
    with torch.no_grad():
        full_correct = 0
        for idx, s in enumerate(samples):
            x_spatial = spatial_tensors[idx].unsqueeze(0)
            x_global = global_tensors[idx].unsqueeze(0)
            z = model.forward_trunk(x_spatial)[0]
            actor_f = extract_coord_feature(z, s['candidateActorCoords'])
            landing_f = extract_coord_feature(z, s['candidateLandingCoords'])
            target_f = extract_coord_feature(z, s['candidateTargetCoords'])
            semantics = torch.tensor(s['candidateSemantics'], dtype=torch.float32)
            K = semantics.shape[0]
            global_expanded = x_global.expand(K, -1)
            action_feats = torch.cat([actor_f, landing_f, target_f, semantics, global_expanded], dim=-1).unsqueeze(0)
            logits = model.forward_action_logits(action_feats)[0]

            target_idx = s['targetActionIndex']
            if torch.argmax(logits).item() == target_idx:
                full_correct += 1

    final_acc = full_correct / N
    print(f"Final 128-sample Memorization Accuracy: {full_correct}/{N} ({final_acc*100:.2f}%)")

    # Export to JSON
    out_model_json = Path(r'C:\code\AncinetEmpires\ai_training\r6_model_training_20261014_063500\scratch\tiny_fitted_model.json')
    export_model_to_ts_json(model, str(out_model_json), encoder_schema_id="spatial34_global20_actionSemantics53_v19")
    print(f"Exported fitted model to {out_model_json}")

    return {
        "initial_loss": loss_history[0],
        "final_loss": loss_history[-1],
        "final_accuracy": final_acc,
        "elapsed_seconds": elapsed
    }

if __name__ == '__main__':
    run_tiny_fit()
