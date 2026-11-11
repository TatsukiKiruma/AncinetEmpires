import os
import sys
import json
import time
import math
import random
import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.optim as optim
import numpy as np

# 添加 research 目录
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from model import SpatialResNetPolicyValueNet, load_from_ppo_pt, export_model_to_ts_json

class AncientEmpiresDataset:
    def __init__(self, file_path):
        print(f"Loading dataset from {file_path} ...")
        self.samples = []
        if file_path.endswith('.jsonl'):
            with open(file_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line_str = line.strip()
                    if line_str:
                        self.samples.append(json.loads(line_str))
        else:
            with open(file_path, 'r', encoding='utf-8') as f:
                self.samples = json.load(f)
        print(f"Loaded {len(self.samples)} samples from {file_path}")

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        return self.samples[idx]

def evaluate_on_val(model, val_dataset, batch_size=32, device='cpu', max_eval_samples=500):
    model.eval()
    total_loss = 0.0
    correct_top1 = 0
    correct_top3 = 0
    total_eval = min(len(val_dataset), max_eval_samples)

    # 抽取均匀采样的子集评估以控制验证开销
    step = max(1, len(val_dataset) // total_eval)
    eval_indices = list(range(0, len(val_dataset), step))[:total_eval]

    loss_fn = nn.CrossEntropyLoss()

    with torch.no_grad():
        for i in eval_indices:
            s = val_dataset[i]
            spatial = torch.tensor(s['spatial'], dtype=torch.float32, device=device).view(1, 34, 20, 20)
            glob = torch.tensor(s['global'], dtype=torch.float32, device=device).view(1, 20)

            K = len(s['candidateSemantics'])
            if K == 0:
                continue

            act_coords = torch.tensor(s['candidateActorCoords'], dtype=torch.float32, device=device)
            land_coords = torch.tensor(s['candidateLandingCoords'], dtype=torch.float32, device=device)
            tar_coords = torch.tensor(s['candidateTargetCoords'], dtype=torch.float32, device=device)
            semantics = torch.tensor(s['candidateSemantics'], dtype=torch.float32, device=device)
            target_idx = s['targetActionIndex']

            Z = model.forward_trunk(spatial)
            logits = model.forward_policy_single(
                Z.squeeze(0), glob.squeeze(0), act_coords, land_coords, tar_coords, semantics
            )

            if target_idx < K:
                loss = loss_fn(logits.unsqueeze(0), torch.tensor([target_idx], dtype=torch.long, device=device))
                total_loss += loss.item()

                pred_top1 = torch.argmax(logits).item()
                if pred_top1 == target_idx:
                    correct_top1 += 1

                top_k = min(3, K)
                _, top_indices = torch.topk(logits, top_k)
                if target_idx in top_indices.tolist():
                    correct_top3 += 1

    mean_loss = total_loss / max(1, len(eval_indices))
    top1_acc = correct_top1 / max(1, len(eval_indices))
    top3_acc = correct_top3 / max(1, len(eval_indices))

    return mean_loss, top1_acc, top3_acc

def train_policy_net(
    train_json_path,
    val_json_path,
    init_mode='warm_start',  # 'warm_start' or 'scratch'
    init_pt_path=None,
    total_updates=1200,
    batch_size=16,
    lr=3e-4,
    min_lr=1e-5,
    seed=42,
    device='cpu',
    save_dir='ai_training/r7_training_stage_20261014_083500/artifacts/models',
    experiment_id='round1_arm_a',
    surrender_penalty=0.05,
    end_turn_weight=4.0,
    recruit_weight=2.0
):
    torch.manual_seed(seed)
    np.random.seed(seed)
    random.seed(seed)

    os.makedirs(save_dir, exist_ok=True)

    train_data = AncientEmpiresDataset(train_json_path)
    val_data = AncientEmpiresDataset(val_json_path)

    model = SpatialResNetPolicyValueNet(in_channels=34, trunk_channels=32, global_dim=20, action_semantic_dim=53).to(device)

    if init_mode == 'warm_start' and init_pt_path and os.path.exists(init_pt_path):
        load_from_ppo_pt(model, init_pt_path)
    else:
        print(f"Initializing model with Kaiming Normal (Scratch)...")
        for m in model.modules():
            if isinstance(m, nn.Conv2d) or isinstance(m, nn.Linear):
                nn.init.kaiming_normal_(m.weight, mode='fan_out', nonlinearity='relu')
                if m.bias is not None:
                    nn.init.constant_(m.bias, 0)

    # 导出初始权重检查点
    initial_ckpt_path = os.path.join(save_dir, f"{experiment_id}_initial.pt")
    torch.save({
        'model_state_dict': model.state_dict(),
        'init_mode': init_mode,
        'seed': seed
    }, initial_ckpt_path)

    optimizer = optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=total_updates, eta_min=min_lr)
    loss_fn = nn.CrossEntropyLoss()

    ledger = {
        'experimentId': experiment_id,
        'initMode': init_mode,
        'seed': seed,
        'totalUpdates': total_updates,
        'batchSize': batch_size,
        'initialLr': lr,
        'minLr': min_lr,
        'trainSamplesCount': len(train_data),
        'valSamplesCount': len(val_data),
        'records': [],
        'bestValTop1': 0.0,
        'bestValLoss': 999.0,
        'bestUpdate': 0
    }

    # Step 0 初始验证
    print(f"\n--- Initial Validation (Step 0) ---")
    val_loss, val_top1, val_top3 = evaluate_on_val(model, val_data, batch_size=batch_size, device=device)
    print(f"Step 0: Val Loss={val_loss:.4f}, Val Top-1={(val_top1*100):.2f}%, Val Top-3={(val_top3*100):.2f}%")
    ledger['records'].append({
        'update': 0,
        'lr': lr,
        'trainLoss': None,
        'valLoss': val_loss,
        'valTop1': val_top1,
        'valTop3': val_top3,
        'elapsedSec': 0.0
    })
    ledger['bestValTop1'] = val_top1
    ledger['bestValLoss'] = val_loss
    ledger['bestUpdate'] = 0

    best_ckpt_path = os.path.join(save_dir, f"{experiment_id}_best.pt")
    best_json_path = os.path.join(save_dir, f"{experiment_id}_best.json")
    export_model_to_ts_json(model, best_json_path)

    train_indices = list(range(len(train_data)))
    t_start = time.time()
    accum_train_loss = 0.0
    accum_count = 0

    print(f"\nStarting training loop ({total_updates} updates)...")
    for u in range(1, total_updates + 1):
        model.train()
        optimizer.zero_grad()

        # 随机采样一个批次
        batch_idx = random.sample(train_indices, batch_size)
        batch_loss = 0.0
        valid_items = 0

        for idx in batch_idx:
            s = train_data[idx]
            spatial = torch.tensor(s['spatial'], dtype=torch.float32, device=device).view(1, 34, 20, 20)
            glob = torch.tensor(s['global'], dtype=torch.float32, device=device).view(1, 20)

            K = len(s['candidateSemantics'])
            if K == 0:
                continue

            act_coords = torch.tensor(s['candidateActorCoords'], dtype=torch.float32, device=device)
            land_coords = torch.tensor(s['candidateLandingCoords'], dtype=torch.float32, device=device)
            tar_coords = torch.tensor(s['candidateTargetCoords'], dtype=torch.float32, device=device)
            semantics = torch.tensor(s['candidateSemantics'], dtype=torch.float32, device=device)
            target_idx = s['targetActionIndex']

            if target_idx >= K:
                continue

            Z = model.forward_trunk(spatial)
            logits = model.forward_policy_single(
                Z.squeeze(0), glob.squeeze(0), act_coords, land_coords, tar_coords, semantics
            )

            # 稀有核心战术动作重权增强 (end_turn 与 recruit)
            tgt_sem = semantics[target_idx]
            weight = 1.0
            if tgt_sem[13] > 0.5:
                weight = end_turn_weight
            elif tgt_sem[5] > 0.5 or tgt_sem[6] > 0.5:
                weight = recruit_weight

            loss = loss_fn(logits.unsqueeze(0), torch.tensor([target_idx], dtype=torch.long, device=device)) * weight

            # 纯模型投降抑制正则：严格压低投降候选动作打分至 -100 以下，确保永远低于正常 end_turn
            if surrender_penalty > 0:
                is_surr = (semantics[:, 12] > 0.5)
                if is_surr.any():
                    surr_logits = logits[is_surr]
                    loss = loss + surrender_penalty * torch.sum(F.relu(surr_logits + 100.0))

            batch_loss += loss
            valid_items += 1

        if valid_items > 0:
            avg_loss = batch_loss / valid_items
            avg_loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), max_norm=0.5)
            optimizer.step()

            accum_train_loss += avg_loss.item()
            accum_count += 1

        scheduler.step()

        # 每 100 步记录与验证
        if u % 100 == 0 or u == total_updates:
            cur_lr = scheduler.get_last_lr()[0]
            avg_train_loss = accum_train_loss / max(1, accum_count)
            accum_train_loss = 0.0
            accum_count = 0

            val_loss, val_top1, val_top3 = evaluate_on_val(model, val_data, batch_size=batch_size, device=device)
            elapsed = time.time() - t_start

            print(f"Step [{u}/{total_updates}] ({elapsed:.1f}s) | LR={cur_lr:.2e} | Train Loss={avg_train_loss:.4f} | Val Loss={val_loss:.4f} | Val Top-1={(val_top1*100):.2f}% | Val Top-3={(val_top3*100):.2f}%")

            ledger['records'].append({
                'update': u,
                'lr': cur_lr,
                'trainLoss': avg_train_loss,
                'valLoss': val_loss,
                'valTop1': val_top1,
                'valTop3': val_top3,
                'elapsedSec': elapsed
            })

            # 如果验证集准确率提升，保存 Best Checkpoint
            if val_top1 > ledger['bestValTop1']:
                ledger['bestValTop1'] = val_top1
                ledger['bestValLoss'] = val_loss
                ledger['bestUpdate'] = u

                torch.save({
                    'update': u,
                    'model_state_dict': model.state_dict(),
                    'optimizer_state_dict': optimizer.state_dict(),
                    'scheduler_state_dict': scheduler.state_dict(),
                    'val_top1': val_top1,
                    'val_loss': val_loss
                }, best_ckpt_path)
                export_model_to_ts_json(model, best_json_path)
                print(f"  >>> New Best Model saved at update {u} (Val Top-1: {(val_top1*100):.2f}%)")

    # 保存 Last Checkpoint
    last_ckpt_path = os.path.join(save_dir, f"{experiment_id}_last.pt")
    last_json_path = os.path.join(save_dir, f"{experiment_id}_last.json")
    torch.save({
        'update': total_updates,
        'model_state_dict': model.state_dict(),
        'optimizer_state_dict': optimizer.state_dict(),
        'scheduler_state_dict': scheduler.state_dict(),
        'val_top1': val_top1,
        'val_loss': val_loss
    }, last_ckpt_path)
    export_model_to_ts_json(model, last_json_path)

    ledger_path = os.path.join(save_dir, f"{experiment_id}_ledger.json")
    with open(ledger_path, 'w', encoding='utf-8') as f:
        json.dump(ledger, f, indent=2)

    print(f"\nTraining completed for {experiment_id} in {time.time()-t_start:.1f}s.")
    print(f"Best Val Top-1: {(ledger['bestValTop1']*100):.2f}% at update {ledger['bestUpdate']}")
    return ledger

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description="Ancient Empires Policy Net Trainer")
    parser.add_argument('--train_json', type=str, default='ai_training/r7_training_stage_20261014_083500/artifacts/data/train_samples.jsonl')
    parser.add_argument('--val_json', type=str, default='ai_training/r7_training_stage_20261014_083500/artifacts/data/val_samples.jsonl')
    parser.add_argument('--init_mode', type=str, default='warm_start', choices=['warm_start', 'scratch'])
    parser.add_argument('--init_pt', type=str, default='ai_training/v19/out/run_20260929_v19_02/experiments/ppo_w1/s42/ppo_w1.train_state.pt')
    parser.add_argument('--total_updates', type=int, default=1200)
    parser.add_argument('--batch_size', type=int, default=16)
    parser.add_argument('--lr', type=float, default=3e-4)
    parser.add_argument('--min_lr', type=float, default=1e-5)
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--experiment_id', type=str, default='round1_arm_a')
    parser.add_argument('--surrender_penalty', type=float, default=0.05)
    parser.add_argument('--end_turn_weight', type=float, default=4.0)
    parser.add_argument('--recruit_weight', type=float, default=2.0)
    args = parser.parse_args()

    train_policy_net(
        train_json_path=args.train_json,
        val_json_path=args.val_json,
        init_mode=args.init_mode,
        init_pt_path=args.init_pt,
        total_updates=args.total_updates,
        batch_size=args.batch_size,
        lr=args.lr,
        min_lr=args.min_lr,
        seed=args.seed,
        experiment_id=args.experiment_id,
        surrender_penalty=args.surrender_penalty,
        end_turn_weight=args.end_turn_weight,
        recruit_weight=args.recruit_weight
    )
