"""
AncientEmpires - Spatial ResNet Offline Training Pipeline (Path B)

Loads spatial dataset (.jsonl), trains 2D Convolutional ResNet with
hierarchical candidate action scoring & value head, and exports weights
directly to TypeScript-loadable JSON format.
"""

import os
import sys
import json
import argparse
from typing import List, Dict, Any, Tuple

try:
    import numpy as np
    import torch
    import torch.nn as nn
    import torch.optim as optim
    from torch.utils.data import Dataset, DataLoader
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


    def train_epoch(
        model: SpatialResNet,
        dataloader: DataLoader,
        optimizer: optim.Optimizer,
        device: torch.device,
        value_weight: float = 0.5
    ) -> Tuple[float, float, float]:
        model.train()
        total_loss = 0.0
        total_pol_loss = 0.0
        total_val_loss = 0.0
        correct_actions = 0
        total_actions = 0

        ce_loss_fn = nn.CrossEntropyLoss()
        mse_loss_fn = nn.MSELoss()

        for batch in dataloader:
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
            loss.backward()
            optimizer.step()

            total_loss += loss.item()
            total_pol_loss += batch_pol_loss.item()
            total_val_loss += batch_val_loss.item()

        n = max(1, len(dataloader))
        acc = correct_actions / max(1, total_actions)
        return total_loss / n, total_pol_loss / n, acc


    def main():
        parser = argparse.ArgumentParser(description="Train Spatial ResNet for AncientEmpires (Path B)")
        parser.add_argument("--dataset", type=str, default="training_runs/spatial_dataset/spatial_pilot_01.jsonl", help="Input .jsonl dataset")
        parser.add_argument("--epochs", type=int, default=10, help="Number of training epochs")
        parser.add_argument("--lr", type=float, default=1e-3, help="Learning rate")
        parser.add_argument("--batch-size", type=int, default=8, help="Batch size")
        parser.add_argument("--out-model", type=str, default="training_runs/models/spatial_resnet_checkpoint.json", help="Output JSON checkpoint")
        parser.add_argument("--seed", type=int, default=42, help="Random seed")
        args = parser.parse_args()

        torch.manual_seed(args.seed)
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"Using device: {device}")

        if not os.path.exists(args.dataset):
            print(f"Dataset {args.dataset} does not exist. Generating pilot data...")
            os.system(f"npx tsx tools/skirmish_spatial_dataset_export.ts --episodes 10 --out {args.dataset}")

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

        dataset = SpatialDataset(args.dataset)
        dataloader = DataLoader(dataset, batch_size=args.batch_size, shuffle=True, collate_fn=collate_samples)

        model = SpatialResNet().to(device)
        optimizer = optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)

        print(f"Starting training for {args.epochs} epochs...")
        for epoch in range(1, args.epochs + 1):
            loss, pol_loss, acc = train_epoch(model, dataloader, optimizer, device)
            print(f"[Epoch {epoch:02d}/{args.epochs:02d}] Loss: {loss:.4f} | Policy Loss: {pol_loss:.4f} | Action Accuracy: {acc * 100:.2f}%")

        os.makedirs(os.path.dirname(args.out_model), exist_ok=True)
        export_model_to_ts_json(model, args.out_model)
        print("Training complete.")


if __name__ == "__main__":
    main()
