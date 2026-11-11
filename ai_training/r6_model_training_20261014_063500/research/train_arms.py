import json
import time
import math
import copy
import sys
from pathlib import Path

# Add python path
sys.path.insert(0, str(Path(r'C:\code\AncinetEmpires\ai_training\python')))
import torch
import torch.nn as nn
import torch.optim as optim
from spatial_resnet_model import SpatialResNet, export_model_to_ts_json

def extract_coord_feature(z: torch.Tensor, coords: list) -> torch.Tensor:
    K = len(coords)
    feats = torch.zeros((K, 32), dtype=torch.float32, device=z.device)
    for i, (x, y) in enumerate(coords):
        if 0 <= x < 20 and 0 <= y < 20:
            feats[i] = z[:, y, x]
    return feats

def evaluate_model(model: SpatialResNet, samples: list, desc: str = "Val") -> dict:
    model.eval()
    total_loss = 0.0
    correct = 0
    N = len(samples)
    if N == 0:
        return {"loss": 0.0, "top1": 0.0}

    with torch.no_grad():
        for s in samples:
            x_spatial = torch.tensor(s['spatial'], dtype=torch.float32).reshape(1, 34, 20, 20)
            x_global = torch.tensor(s['global'], dtype=torch.float32).unsqueeze(0)
            z = model.forward_trunk(x_spatial)[0]

            actor_f = extract_coord_feature(z, s['candidateActorCoords'])
            landing_f = extract_coord_feature(z, s['candidateLandingCoords'])
            target_f = extract_coord_feature(z, s['candidateTargetCoords'])
            semantics = torch.tensor(s['candidateSemantics'], dtype=torch.float32)

            K = semantics.shape[0]
            global_exp = x_global.expand(K, -1)
            action_feats = torch.cat([actor_f, landing_f, target_f, semantics, global_exp], dim=-1).unsqueeze(0)
            logits = model.forward_action_logits(action_feats)[0]

            target_idx = s['targetActionIndex']
            loss = nn.functional.cross_entropy(logits.unsqueeze(0), torch.tensor([target_idx], dtype=torch.long))
            total_loss += loss.item()

            if torch.argmax(logits).item() == target_idx:
                correct += 1

    avg_loss = total_loss / N
    acc = correct / N
    return {"loss": avg_loss, "top1": acc}

def train_arm(
    arm_name: str,
    init_mode: str, # 'warm_start' | 'scratch'
    train_samples: list,
    val_samples: list,
    total_updates = 1000,
    batch_size = 16,
    lr = 3e-4,
    seed = 42
) -> dict:
    print(f"\n==========================================")
    print(f"Starting Training: {arm_name} (Mode: {init_mode})")
    print(f"Total Updates: {total_updates}, Batch Size: {batch_size}, LR: {lr}")
    print(f"Train samples: {len(train_samples)}, Val samples: {len(val_samples)}")
    print(f"==========================================")

    torch.manual_seed(seed)

    # Initialize model
    model = SpatialResNet(
        spatial_channels=34,
        trunk_channels=32,
        global_dim=20,
        action_semantic_dim=53,
        version="spatial-resnet-v2",
        num_blocks=2,
        global_policy_pool=False
    )

    if init_mode == 'warm_start':
        pt_path = r'C:\code\AncinetEmpires\ai_training\v19\out\run_20260929_v19_02\experiments\ppo_w1\s42\ppo_w1.train_state.pt'
        state = torch.load(pt_path, map_location='cpu', weights_only=False)
        model.load_state_dict(state['model'])
        print(f"Loaded theta1 pretrained weights from {pt_path}")
    else:
        # Kaiming normal initialization for scratch arm
        for m in model.modules():
            if isinstance(m, nn.Conv2d):
                nn.init.kaiming_normal_(m.weight, mode='fan_out', nonlinearity='relu')
                if m.bias is not None:
                    nn.init.zeros_(m.bias)
            elif isinstance(m, nn.Linear):
                nn.init.kaiming_normal_(m.weight, mode='fan_out', nonlinearity='relu')
                if m.bias is not None:
                    nn.init.zeros_(m.bias)
        print("Initialized model weights from scratch (Kaiming Normal)")

    optimizer = optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=total_updates, eta_min=1e-5)

    # Evaluate pre-training baseline on val
    initial_val = evaluate_model(model, val_samples, "Initial Val")
    print(f"Initial Val Loss: {initial_val['loss']:.4f}, Initial Val Top-1: {initial_val['top1']*100:.2f}%")

    N_train = len(train_samples)
    spatial_tensors = [torch.tensor(s['spatial'], dtype=torch.float32).reshape(34, 20, 20) for s in train_samples]
    global_tensors = [torch.tensor(s['global'], dtype=torch.float32) for s in train_samples]

    history = []
    start_time = time.time()

    # Fixed pseudo-random batch indices for exact comparability
    rng = torch.Generator().manual_seed(seed)

    for step in range(total_updates):
        model.train()
        batch_indices = torch.randint(0, N_train, (batch_size,), generator=rng).tolist()

        optimizer.zero_grad()
        batch_loss = 0.0
        batch_correct = 0

        for idx in batch_indices:
            s = train_samples[idx]
            x_spatial = spatial_tensors[idx].unsqueeze(0)
            x_global = global_tensors[idx].unsqueeze(0)
            z = model.forward_trunk(x_spatial)[0]

            actor_f = extract_coord_feature(z, s['candidateActorCoords'])
            landing_f = extract_coord_feature(z, s['candidateLandingCoords'])
            target_f = extract_coord_feature(z, s['candidateTargetCoords'])
            semantics = torch.tensor(s['candidateSemantics'], dtype=torch.float32)

            K = semantics.shape[0]
            global_exp = x_global.expand(K, -1)
            action_feats = torch.cat([actor_f, landing_f, target_f, semantics, global_exp], dim=-1).unsqueeze(0)
            logits = model.forward_action_logits(action_feats)[0]

            target_idx = s['targetActionIndex']
            loss = nn.functional.cross_entropy(logits.unsqueeze(0), torch.tensor([target_idx], dtype=torch.long))
            loss.backward()

            batch_loss += loss.item()
            if torch.argmax(logits).item() == target_idx:
                batch_correct += 1

        nn.utils.clip_grad_norm_(model.parameters(), max_norm=0.5)
        optimizer.step()
        scheduler.step()

        if (step + 1) % 100 == 0 or step == 0:
            step_train_loss = batch_loss / batch_size
            step_train_top1 = batch_correct / batch_size
            val_res = evaluate_model(model, val_samples, "Val")
            cur_lr = scheduler.get_last_lr()[0]
            print(f"Step {step+1:4d}/{total_updates} | LR: {cur_lr:.2e} | TrainLoss: {step_train_loss:.4f} (Top1: {step_train_top1*100:4.1f}%) | ValLoss: {val_res['loss']:.4f} (Top1: {val_res['top1']*100:4.1f}%)")
            history.append({
                "step": step + 1,
                "train_loss": step_train_loss,
                "train_top1": step_train_top1,
                "val_loss": val_res['loss'],
                "val_top1": val_res['top1'],
                "lr": cur_lr
            })

    elapsed = time.time() - start_time
    final_val = evaluate_model(model, val_samples, "Final Val")
    print(f"\nTraining {arm_name} finished in {elapsed:.1f}s ({elapsed/total_updates*1000:.1f}ms/update).")
    print(f"Final Val Top-1: {final_val['top1']*100:.2f}%, Val Loss: {final_val['loss']:.4f}")

    # Export to JSON
    out_dir = Path(r'C:\code\AncinetEmpires\ai_training\r6_model_training_20261014_063500\artifacts\models')
    out_dir.mkdir(parents=True, exist_ok=True)
    out_json = out_dir / f"{arm_name}.json"

    export_model_to_ts_json(
        model,
        str(out_json),
        encoder_schema_id="spatial34_global20_actionSemantics53_v19"
    )
    print(f"Saved {arm_name} to {out_json}")

    return {
        "arm_name": arm_name,
        "init_mode": init_mode,
        "elapsed_seconds": elapsed,
        "initial_val": initial_val,
        "final_val": final_val,
        "history": history,
        "output_json": str(out_json)
    }

def main():
    data_dir = Path(r'C:\code\AncinetEmpires\ai_training\r6_model_training_20261014_063500\scratch\data')
    train_path = data_dir / 'train_pool.json'
    val_path = data_dir / 'val_pool.json'

    if not train_path.exists() or not val_path.exists():
        print(f"Data not found at {train_path}. Please collect data first.")
        return

    with open(train_path, 'r', encoding='utf-8') as f:
        train_samples = json.load(f)
    with open(val_path, 'r', encoding='utf-8') as f:
        val_samples = json.load(f)

    ledger_path = Path(r'C:\code\AncinetEmpires\ai_training\r6_model_training_20261014_063500\artifacts\training_ledger.json')

    # Run Arm A: θ1 Pretrained Warm Start
    arm_a_result = train_arm(
        arm_name="arm_a_warm_start",
        init_mode="warm_start",
        train_samples=train_samples,
        val_samples=val_samples,
        total_updates=800,
        batch_size=16,
        lr=3e-4,
        seed=42
    )

    # Run Arm B: Kaiming Random Scratch Control
    arm_b_result = train_arm(
        arm_name="arm_b_scratch",
        init_mode="scratch",
        train_samples=train_samples,
        val_samples=val_samples,
        total_updates=800,
        batch_size=16,
        lr=3e-4,
        seed=42
    )

    summary = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "schema": "r6_training_ledger_v1",
        "train_samples_count": len(train_samples),
        "val_samples_count": len(val_samples),
        "total_updates": 800,
        "batch_size": 16,
        "arm_a": arm_a_result,
        "arm_b": arm_b_result
    }

    with open(ledger_path, 'w', encoding='utf-8') as f:
        json.dump(summary, f, indent=2)
    print(f"\nTraining ledger saved to: {ledger_path}")

if __name__ == '__main__':
    main()
