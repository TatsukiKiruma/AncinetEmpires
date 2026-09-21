"""
AncientEmpires - Spatial ResNet Offline Training Pipeline (Path B)

Loads spatial dataset (.jsonl), trains 2D Convolutional ResNet with
hierarchical candidate action scoring & value head, and exports weights
directly to TypeScript-loadable JSON format.
"""

import os
import sys
import json
import shutil
import argparse
from typing import List, Dict, Any, Tuple

try:
    import numpy as np
    import torch
    import torch.nn as nn
    import torch.optim as optim
    from torch.utils.data import Dataset, DataLoader, random_split
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False


if not TORCH_AVAILABLE:
    def main():
        print("Error: PyTorch and NumPy are required to execute train_spatial_resnet.py.")
        print("Please install them via: pip install torch numpy")
        sys.exit(1)
else:
    from spatial_resnet_model import SpatialResNet, export_model_to_ts_json, load_model_from_ts_json

    class SpatialDataset(Dataset):
        def __init__(self, jsonl_path: str):
            self.samples = []
            with open(jsonl_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    s = json.loads(line)
                    cand_actions = s.get("candidateActions", [])
                    for c in cand_actions:
                        sem_raw = c.get("semantics", [])
                        sem_padded = sem_raw[:32] + [0.0] * max(0, 32 - len(sem_raw))
                        c["semantics_padded"] = np.array(sem_padded, dtype=np.float32)

                    self.samples.append({
                        "sampleId": s.get("sampleId"),
                        "spatial_tensor": np.array(s["spatialTensor"], dtype=np.float32).reshape(24, 20, 20),
                        "global_features": np.array(s["globalFeatures"], dtype=np.float32),
                        "candidates": cand_actions,
                        "target_idx": s.get("targetActionIndex", 0),
                        "value_target": s.get("valueTarget"),
                        "episodeId": s.get("episodeId"),
                        "rootFamilyId": s.get("rootFamilyId"),
                    })

            print(f"Loaded {len(self.samples)} spatial samples from {jsonl_path}")

        def __len__(self) -> int:
            return len(self.samples)

        def __getitem__(self, idx: int) -> Dict[str, Any]:
            return self.samples[idx]


    def pool_coords_batch(z: torch.Tensor, coords: List[Any]) -> torch.Tensor:
        """
        Vectorized pooling of [K, 32] feature vectors from z [32, 20, 20] across K coordinates.
        """
        K = len(coords)
        if K == 0:
            return torch.zeros((0, 32), dtype=torch.float32, device=z.device)
        y = []
        x = []
        valid = []
        for c in coords:
            if c is not None and isinstance(c, dict) and "x" in c and "y" in c:
                cx, cy = c["x"], c["y"]
                if 0 <= cx < 20 and 0 <= cy < 20:
                    x.append(cx)
                    y.append(cy)
                    valid.append(1.0)
                    continue
            x.append(0)
            y.append(0)
            valid.append(0.0)
        y_t = torch.tensor(y, dtype=torch.long, device=z.device)
        x_t = torch.tensor(x, dtype=torch.long, device=z.device)
        val_t = torch.tensor(valid, dtype=torch.float32, device=z.device).unsqueeze(-1)
        pooled = z[:, y_t, x_t].permute(1, 0)
        return pooled * val_t


    def run_epoch(
        model: SpatialResNet,
        dataloader: DataLoader,
        optimizer: optim.Optimizer | None,
        device: torch.device,
        value_weight: float = 0.5,
        is_train: bool = True
    ) -> Tuple[float, float, float]:
        if is_train:
            model.train()
        else:
            model.eval()

        total_loss = 0.0
        total_pol_loss = 0.0
        total_val_loss = 0.0
        correct_actions = 0
        total_actions = 0

        ce_loss_fn = nn.CrossEntropyLoss()
        mse_loss_fn = nn.MSELoss()

        with torch.set_grad_enabled(is_train):
            for batch in dataloader:
                if is_train and optimizer:
                    optimizer.zero_grad()

                spatial_t = batch["spatial_tensor"].to(device)  # [B, 24, 20, 20]
                global_f = batch["global_features"].to(device)  # [B, G]
                is_v2 = getattr(model, "version", "spatial-resnet-v2") == "spatial-resnet-v2"

                # Pad or slice global features for value head
                target_g_dim = 20 if is_v2 else 16
                if global_f.size(-1) < target_g_dim:
                    pad = torch.zeros((global_f.size(0), target_g_dim - global_f.size(-1)), dtype=torch.float32, device=device)
                    global_f_val = torch.cat([global_f, pad], dim=-1)
                else:
                    global_f_val = global_f[:, :target_g_dim]

                # Forward Trunk & Value
                z = model.forward_trunk(spatial_t)  # [B, 32, 20, 20]
                val_pred = model.forward_value(z, global_f_val).squeeze(-1)  # [B]

                batch_size = spatial_t.size(0)
                batch_pol_loss = torch.tensor(0.0, device=device)

                for b in range(batch_size):
                    cand_list = batch["candidates"][b]
                    target_i = batch["target_idx"][b]
                    if len(cand_list) == 0:
                        continue

                    K = len(cand_list)
                    z_b = z[b]  # [32, 20, 20]
                    glob_b = global_f_val[b]  # [20 or 16]

                    act_coords = [c.get("actorCoord") for c in cand_list]
                    land_coords = [c.get("landingCoord") for c in cand_list]
                    tgt_coords = [c.get("targetCoord") for c in cand_list]

                    v_act = pool_coords_batch(z_b, act_coords)
                    v_land = pool_coords_batch(z_b, land_coords)
                    v_tgt = pool_coords_batch(z_b, tgt_coords)

                    sem_list = [c["semantics_padded"] for c in cand_list]
                    sem_tensor = torch.from_numpy(np.stack(sem_list, axis=0)).to(device)

                    if is_v2:
                        glob_expanded = glob_b.unsqueeze(0).expand(K, -1)
                        cand_feats = torch.cat([v_act, v_land, v_tgt, sem_tensor, glob_expanded], dim=-1)
                    else:
                        sem_24 = sem_tensor[:, :24]
                        cand_feats = torch.cat([v_act, v_land, v_tgt, sem_24], dim=-1)

                    cand_tensor = cand_feats.unsqueeze(0)  # [1, K, pol_dim]
                    logits = model.forward_action_logits(cand_tensor)  # [1, K]

                    target_tensor = torch.tensor([target_i], dtype=torch.long, device=device)
                    loss_step = ce_loss_fn(logits, target_tensor)
                    batch_pol_loss = batch_pol_loss + loss_step

                    pred_top = torch.argmax(logits, dim=-1).item()
                    if pred_top == target_i:
                        correct_actions += 1
                    total_actions += 1

                batch_pol_loss = batch_pol_loss / max(1, batch_size)

                # Value Loss (masked for None targets)
                val_targets_raw = batch["value_target"]
                valid_val_mask = [vt is not None for vt in val_targets_raw]
                if any(valid_val_mask):
                    val_t = torch.tensor(
                        [vt for vt in val_targets_raw if vt is not None],
                        dtype=torch.float32,
                        device=device
                    )
                    val_p = val_pred[torch.tensor(valid_val_mask, device=device)]
                    batch_val_loss = mse_loss_fn(val_p, val_t)
                else:
                    batch_val_loss = torch.tensor(0.0, device=device)

                loss = batch_pol_loss + value_weight * batch_val_loss

                if is_train and optimizer:
                    if not torch.isfinite(loss):
                        raise RuntimeError(f"Non-finite loss encountered: {loss.item()}")
                    loss.backward()
                    for name, param in model.named_parameters():
                        if param.grad is not None and not torch.all(torch.isfinite(param.grad)):
                            raise RuntimeError(f"Non-finite gradient in {name} during backpropagation!")
                    optimizer.step()

                total_loss += loss.item()
                total_pol_loss += batch_pol_loss.item()
                total_val_loss += batch_val_loss.item()

        n = max(1, len(dataloader))
        acc = correct_actions / max(1, total_actions)
        return total_loss / n, total_pol_loss / n, acc


    def collate_samples(batch: List[Dict[str, Any]]) -> Dict[str, Any]:
        spatial_t = torch.from_numpy(np.stack([s["spatial_tensor"] for s in batch], axis=0))
        # Support variable length globals by padding to max length in batch
        max_g = max(len(s["global_features"]) for s in batch)
        padded_g = [
            np.pad(s["global_features"], (0, max_g - len(s["global_features"])))
            for s in batch
        ]
        global_f = torch.from_numpy(np.stack(padded_g, axis=0))
        return {
            "spatial_tensor": spatial_t,
            "global_features": global_f,
            "candidates": [s["candidates"] for s in batch],
            "target_idx": [s["target_idx"] for s in batch],
            "value_target": [s["value_target"] for s in batch]
        }


    def main():
        parser = argparse.ArgumentParser(description="Train Spatial ResNet for AncientEmpires (Path B)")
        parser.add_argument("--dataset", type=str, default="training_runs/spatial_dataset/spatial_train_scaled_30k.jsonl", help="Input .jsonl dataset")
        parser.add_argument("--epochs", type=int, default=8, help="Number of training epochs")
        parser.add_argument("--lr", type=float, default=1e-3, help="Learning rate")
        parser.add_argument("--batch-size", type=int, default=32, help="Batch size")
        parser.add_argument("--val-split", type=float, default=0.1, help="Validation ratio")
        parser.add_argument("--out-model", type=str, default="training_runs/models/spatial_resnet_v2_checkpoint.json", help="Output JSON checkpoint")
        parser.add_argument("--out-last-model", type=str, default=None, help="Output JSON checkpoint for last epoch (defaults to out-model with _last suffix)")
        parser.add_argument("--out-metrics", type=str, default=None, help="Output path for metrics JSON (defaults to model-specific metrics file)")
        parser.add_argument("--value-weight", type=float, default=0.0, help="Weight for value head loss (default: 0.0 for policy-only)")
        parser.add_argument("--deploy-to-src", action="store_true", default=False, help="Explicitly deploy to src/game/ai/models/ (default: False)")
        parser.add_argument("--seed", type=int, default=42, help="Random seed")
        parser.add_argument("--model-version", type=str, default="spatial-resnet-v2", choices=["spatial-resnet-v1", "spatial-resnet-v2"])
        parser.add_argument("--num-blocks", type=int, default=2, choices=[2, 4], help="Number of ResNet trunk blocks (2 or 4)")
        parser.add_argument("--split-manifest", type=str, default=None, help="Path to unified split_manifest.json")
        parser.add_argument("--init-checkpoint", type=str, default=None, help="Path to initial JSON checkpoint to warm-start from")
        parser.add_argument("--consumed-manifest", type=str, default=None, help="Path to export consumed samples manifest JSON")
        args = parser.parse_args()

        torch.manual_seed(args.seed)
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"=======================================================")
        print(f"[Path B Training] Spatial ResNet Scaled PyTorch Engine ({args.model_version}, {args.num_blocks} blocks)")
        print(f"Device: {device} (CPU Threads: {torch.get_num_threads()})")
        print(f"Dataset: {args.dataset}")
        print(f"Blocks: {args.num_blocks} | Batch Size: {args.batch_size} | Epochs: {args.epochs} | LR: {args.lr}")
        if args.split_manifest:
            print(f"Split Manifest: {args.split_manifest}")
        print(f"=======================================================\n")

        full_dataset = SpatialDataset(args.dataset)
        total_len = len(full_dataset)

        val_indices: List[int] = []
        train_indices: List[int] = []

        if args.split_manifest and os.path.exists(args.split_manifest):
            with open(args.split_manifest, "r", encoding="utf-8") as f:
                manifest_data = json.load(f)
            train_roots = set(manifest_data.get("trainRootFamilies", []))
            val_roots = set(manifest_data.get("valRootFamilies", []))
            for idx, sample in enumerate(full_dataset.samples):
                r_id = sample.get("rootFamilyId")
                if r_id in val_roots:
                    val_indices.append(idx)
                else:
                    train_indices.append(idx)
            if len(val_indices) == 0 and len(train_indices) > 1:
                val_target = max(1, int(len(train_indices) * args.val_split))
                val_indices = train_indices[-val_target:]
                train_indices = train_indices[:-val_target]
                print(f"[Manifest Split Warning] Manifest yielded 0 validation samples. Allocated {len(val_indices)} samples to validation to ensure non-empty validation partition.")
            print(f"[Manifest Split] Applied unified split_manifest: Train = {len(train_indices)} samples ({len(train_roots)} roots) | Validation = {len(val_indices)} samples ({len(val_roots)} roots)\n")
        else:
            # Grouped split by episodeId / rootFamilyId to prevent leakage across state frames
            episode_groups: Dict[str, List[int]] = {}
            for idx, sample in enumerate(full_dataset.samples):
                ep_id = sample.get("rootFamilyId") or sample.get("episodeId") or f"ep_{idx // 60}"
                if ep_id not in episode_groups:
                    episode_groups[ep_id] = []
                episode_groups[ep_id].append(idx)

            group_keys = sorted(list(episode_groups.keys()))
            import random
            rng = random.Random(args.seed)
            rng.shuffle(group_keys)

            val_target_count = max(1, int(total_len * args.val_split))
            cur_val_count = 0

            for k in group_keys:
                idxs = episode_groups[k]
                if cur_val_count < val_target_count:
                    val_indices.extend(idxs)
                    cur_val_count += len(idxs)
                else:
                    train_indices.extend(idxs)

        if len(train_indices) == 0:
            raise ValueError(f"Partition error: train set is empty with {total_len} samples.")
        if len(val_indices) == 0:
            raise ValueError(f"Partition error: validation set is empty with {total_len} samples.")

        train_data = torch.utils.data.Subset(full_dataset, train_indices)
        val_data = torch.utils.data.Subset(full_dataset, val_indices)
        total_roots = (len(train_roots) + len(val_roots)) if (args.split_manifest and os.path.exists(args.split_manifest)) else len(group_keys)
        print(f"Final Partition: Train = {len(train_data)} samples | Validation = {len(val_data)} samples (Grouped by {total_roots} roots)\n")

        if args.consumed_manifest:
            train_ids = [str(full_dataset.samples[i].get("sampleId")) for i in train_indices if full_dataset.samples[i].get("sampleId") is not None]
            val_ids = [str(full_dataset.samples[i].get("sampleId")) for i in val_indices if full_dataset.samples[i].get("sampleId") is not None]
            if len(train_ids) == 0:
                raise ValueError(f"consumed_manifest error: train_sample_ids is empty for {len(train_indices)} train samples!")
            if len(val_ids) == 0:
                raise ValueError(f"consumed_manifest error: val_sample_ids is empty for {len(val_indices)} val samples!")
            consumed_info = {
                "model_version": args.model_version,
                "num_blocks": args.num_blocks,
                "dataset": os.path.abspath(args.dataset),
                "train_sample_count": len(train_indices),
                "val_sample_count": len(val_indices),
                "train_sample_ids": train_ids,
                "val_sample_ids": val_ids,
                "trainSampleIds": train_ids,
                "valSampleIds": val_ids
            }
            os.makedirs(os.path.dirname(os.path.abspath(args.consumed_manifest)), exist_ok=True)
            with open(args.consumed_manifest, "w", encoding="utf-8") as f:
                json.dump(consumed_info, f, indent=2)
            print(f"[Consumed Manifest] Exported {len(train_ids)} train and {len(val_ids)} val sample IDs to: {args.consumed_manifest}\n")

        train_loader = DataLoader(train_data, batch_size=args.batch_size, shuffle=True, collate_fn=collate_samples)
        val_loader = DataLoader(val_data, batch_size=args.batch_size, shuffle=False, collate_fn=collate_samples)

        global_dim = 20 if args.model_version == "spatial-resnet-v2" else 16
        action_semantic_dim = 32 if args.model_version == "spatial-resnet-v2" else 24

        model = SpatialResNet(
            spatial_channels=24,
            trunk_channels=32,
            global_dim=global_dim,
            action_semantic_dim=action_semantic_dim,
            version=args.model_version,
            num_blocks=args.num_blocks
        ).to(device)

        if args.init_checkpoint and os.path.exists(args.init_checkpoint):
            load_model_from_ts_json(model, args.init_checkpoint)

        optimizer = optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
        scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs, eta_min=1e-5)

        best_val_acc = -1.0
        best_epoch = 0

        print(f"Starting scaled training for {args.epochs} epochs (value_weight={args.value_weight})...\n")
        history = []
        for epoch in range(1, args.epochs + 1):
            train_loss, train_pol, train_acc = run_epoch(
                model, train_loader, optimizer, device, value_weight=args.value_weight, is_train=True
            )
            val_loss, val_pol, val_acc = run_epoch(
                model, val_loader, None, device, value_weight=args.value_weight, is_train=False
            )
            scheduler.step()

            is_best = val_acc > best_val_acc
            if is_best:
                best_val_acc = val_acc
                best_epoch = epoch
                for name, param in model.named_parameters():
                    if not torch.all(torch.isfinite(param.data)):
                        raise RuntimeError(f"Non-finite parameter weight in {name} before export!")
                os.makedirs(os.path.dirname(os.path.abspath(args.out_model)), exist_ok=True)
                export_model_to_ts_json(model, args.out_model)
                if args.deploy_to_src:
                    deployed_path = "src/game/ai/models/spatial_resnet_checkpoint.json"
                    os.makedirs(os.path.dirname(deployed_path), exist_ok=True)
                    shutil.copyfile(args.out_model, deployed_path)

            if epoch == args.epochs:
                last_model_path = args.out_last_model
                if not last_model_path:
                    base, ext = os.path.splitext(args.out_model)
                    last_model_path = f"{base}_last{ext}"
                os.makedirs(os.path.dirname(os.path.abspath(last_model_path)), exist_ok=True)
                export_model_to_ts_json(model, last_model_path)
                print(f"Exported final epoch checkpoint to: {last_model_path}")

            best_mark = " [*BEST]" if is_best else ""
            print(
                f"[Epoch {epoch:02d}/{args.epochs:02d}] "
                f"Train Loss: {train_loss:.4f} (Acc: {train_acc*100:.2f}%) | "
                f"Val Loss: {val_loss:.4f} (Acc: {val_acc*100:.2f}%){best_mark}"
            )
            history.append({
                "epoch": epoch,
                "train_loss": train_loss,
                "train_acc": train_acc,
                "val_loss": val_loss,
                "val_acc": val_acc
            })

        metrics_file = args.out_metrics
        if not metrics_file:
            base, _ = os.path.splitext(args.out_model)
            metrics_file = f"{base}_metrics.json"
        os.makedirs(os.path.dirname(os.path.abspath(metrics_file)), exist_ok=True)
        with open(metrics_file, "w", encoding="utf-8") as f:
            json.dump({
                "model_version": args.model_version,
                "num_blocks": args.num_blocks,
                "dataset": args.dataset,
                "value_weight": args.value_weight,
                "seed": args.seed,
                "best_val_acc": best_val_acc,
                "best_epoch": best_epoch,
                "train_samples": len(train_data),
                "val_samples": len(val_data),
                "history": history
            }, f, indent=2)

        consumed_manifest_file = os.path.join(os.path.dirname(os.path.abspath(args.out_model)), "consumed_samples_manifest.json")
        with open(consumed_manifest_file, "w", encoding="utf-8") as f:
            json.dump({
                "model_version": args.model_version,
                "num_blocks": args.num_blocks,
                "dataset": args.dataset,
                "train_sample_count": len(train_data),
                "val_sample_count": len(val_data),
                "train_sample_ids": [full_dataset.samples[idx].get("sampleId") for idx in train_indices if full_dataset.samples[idx].get("sampleId")],
                "val_sample_ids": [full_dataset.samples[idx].get("sampleId") for idx in val_indices if full_dataset.samples[idx].get("sampleId")]
            }, f, indent=2)

        print(f"\n=======================================================")
        print(f"[Training Complete] Best Validation Accuracy: {best_val_acc * 100:.2f}% (Epoch {best_epoch})")
        print(f"Best model checkpoint: {args.out_model}")
        print(f"Metrics saved to: {metrics_file}")
        print(f"Consumed samples manifest: {consumed_manifest_file}")
        print(f"=======================================================\n")


if __name__ == "__main__":
    main()
