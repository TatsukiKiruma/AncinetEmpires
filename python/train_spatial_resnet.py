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
    from spatial_resnet_model import SpatialResNet, export_model_to_ts_json

    class SpatialDataset(Dataset):
        def __init__(self, jsonl_path: str):
            self.samples = []
            with open(jsonl_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    self.samples.append(json.loads(line))

            print(f"Loaded {len(self.samples)} spatial samples from {jsonl_path}")

        def __len__(self) -> int:
            return len(self.samples)

        def __getitem__(self, idx: int) -> Dict[str, Any]:
            s = self.samples[idx]
            spatial_tensor = np.array(s["spatialTensor"], dtype=np.float32).reshape(24, 20, 20)
            global_features = np.array(s["globalFeatures"], dtype=np.float32)

            candidates = s["candidateActions"]
            target_idx = s["targetActionIndex"]
            value_target = s["valueTarget"] # float or None

            return {
                "spatial_tensor": spatial_tensor,
                "global_features": global_features,
                "candidates": candidates,
                "target_idx": target_idx,
                "value_target": value_target
            }


    def pool_coord(z: torch.Tensor, coord: Any) -> torch.Tensor:
        """
        Pools 32-dim feature vector from Z [32, 20, 20] at (coord['y'], coord['x']).
        """
        if coord is None or coord.get("x") is None or coord.get("y") is None:
            return torch.zeros((32,), dtype=torch.float32, device=z.device)
        x, y = coord["x"], coord["y"]
        if x < 0 or x >= 20 or y < 0 or y >= 20:
            return torch.zeros((32,), dtype=torch.float32, device=z.device)
        return z[:, y, x]


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
                global_f = batch["global_features"].to(device)  # [B, 16]

                # Forward Trunk & Value
                z = model.forward_trunk(spatial_t)  # [B, 32, 20, 20]
                val_pred = model.forward_value(z, global_f).squeeze(-1)  # [B]

                batch_size = spatial_t.size(0)
                batch_pol_loss = torch.tensor(0.0, device=device)

                for b in range(batch_size):
                    cand_list = batch["candidates"][b]
                    target_i = batch["target_idx"][b]
                    if len(cand_list) == 0:
                        continue

                    # Build action features for this state
                    cand_feats = []
                    z_b = z[b]  # [32, 20, 20]
                    for c in cand_list:
                        v_act = pool_coord(z_b, c.get("actorCoord"))
                        v_land = pool_coord(z_b, c.get("landingCoord"))
                        v_tgt = pool_coord(z_b, c.get("targetCoord"))
                        sem = torch.tensor(c.get("semantics", [0] * 24), dtype=torch.float32, device=device)
                        f_vec = torch.cat([v_act, v_land, v_tgt, sem], dim=-1)  # 120
                        cand_feats.append(f_vec)

                    cand_tensor = torch.stack(cand_feats, dim=0).unsqueeze(0)  # [1, K, 120]
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
                    loss.backward()
                    optimizer.step()

                total_loss += loss.item()
                total_pol_loss += batch_pol_loss.item()
                total_val_loss += batch_val_loss.item()

        n = max(1, len(dataloader))
        acc = correct_actions / max(1, total_actions)
        return total_loss / n, total_pol_loss / n, acc


    def collate_samples(batch: List[Dict[str, Any]]) -> Dict[str, Any]:
        spatial_t = torch.from_numpy(np.stack([s["spatial_tensor"] for s in batch], axis=0))
        global_f = torch.from_numpy(np.stack([s["global_features"] for s in batch], axis=0))
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
        parser.add_argument("--out-model", type=str, default="training_runs/models/spatial_resnet_scaled_checkpoint.json", help="Output JSON checkpoint")
        parser.add_argument("--deploy-to-src", action="store_true", default=True, help="Also deploy to src/game/ai/models/")
        parser.add_argument("--seed", type=int, default=42, help="Random seed")
        args = parser.parse_args()

        torch.manual_seed(args.seed)
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"=======================================================")
        print(f"[Path B Training] Spatial ResNet Scaled PyTorch Engine")
        print(f"Device: {device} (CPU Threads: {torch.get_num_threads()})")
        print(f"Dataset: {args.dataset}")
        print(f"Batch Size: {args.batch_size} | Epochs: {args.epochs} | LR: {args.lr}")
        print(f"=======================================================\n")

        full_dataset = SpatialDataset(args.dataset)
        total_len = len(full_dataset)
        val_len = int(total_len * args.val_split)
        train_len = total_len - val_len

        train_data, val_data = random_split(
            full_dataset, 
            [train_len, val_len],
            generator=torch.Generator().manual_seed(args.seed)
        )
        print(f"Dataset Partition: Train = {train_len} samples | Validation = {val_len} samples\n")

        train_loader = DataLoader(train_data, batch_size=args.batch_size, shuffle=True, collate_fn=collate_samples)
        val_loader = DataLoader(val_data, batch_size=args.batch_size, shuffle=False, collate_fn=collate_samples)

        model = SpatialResNet().to(device)
        optimizer = optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
        scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs, eta_min=1e-5)

        best_val_acc = 0.0
        best_epoch = 0

        print(f"Starting scaled training for {args.epochs} epochs...\n")
        for epoch in range(1, args.epochs + 1):
            train_loss, train_pol, train_acc = run_epoch(
                model, train_loader, optimizer, device, is_train=True
            )
            val_loss, val_pol, val_acc = run_epoch(
                model, val_loader, None, device, is_train=False
            )
            scheduler.step()

            is_best = val_acc > best_val_acc
            if is_best:
                best_val_acc = val_acc
                best_epoch = epoch
                os.makedirs(os.path.dirname(args.out_model), exist_ok=True)
                export_model_to_ts_json(model, args.out_model)
                if args.deploy_to_src:
                    deployed_path = "src/game/ai/models/spatial_resnet_checkpoint.json"
                    os.makedirs(os.path.dirname(deployed_path), exist_ok=True)
                    shutil.copyfile(args.out_model, deployed_path)

            best_mark = " [*BEST]" if is_best else ""
            print(
                f"[Epoch {epoch:02d}/{args.epochs:02d}] "
                f"Train Loss: {train_loss:.4f} (Acc: {train_acc*100:.2f}%) | "
                f"Val Loss: {val_loss:.4f} (Acc: {val_acc*100:.2f}%){best_mark}"
            )

        print(f"\n=======================================================")
        print(f"[Training Complete] Best Validation Accuracy: {best_val_acc * 100:.2f}% (Epoch {best_epoch})")
        print(f"Exported model checkpoint to: {args.out_model}")
        if args.deploy_to_src:
            print(f"Successfully deployed to: src/game/ai/models/spatial_resnet_checkpoint.json")
        print(f"=======================================================\n")


if __name__ == "__main__":
    main()
