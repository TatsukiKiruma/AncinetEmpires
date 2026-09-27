import os
import sys
import json
import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np

class DualHeadPyTorchNet(nn.Module):
    def __init__(self, state_dim=356, action_dim=45, trunk_hidden=[256, 256, 128], policy_hidden=[64, 64], value_hidden=[64]):
        super().__init__()
        # Trunk
        self.trunk_layers = nn.ModuleList()
        prev = state_dim
        for h in trunk_hidden:
            self.trunk_layers.append(nn.Linear(prev, h))
            prev = h
        embed_dim = prev

        # Value Head
        self.value_layers = nn.ModuleList()
        prev = embed_dim
        for v in value_hidden:
            self.value_layers.append(nn.Linear(prev, v))
            prev = v
        self.value_layers.append(nn.Linear(prev, 1))

        # Policy Head
        self.policy_layers = nn.ModuleList()
        prev = embed_dim + action_dim
        for p in policy_hidden:
            self.policy_layers.append(nn.Linear(prev, p))
            prev = p
        self.policy_layers.append(nn.Linear(prev, 1))

    def forward_trunk(self, state_t):
        x = state_t
        for layer in self.trunk_layers:
            x = torch.relu(layer(x))
        return x

    def forward_value(self, embed_t):
        x = embed_t
        for i, layer in enumerate(self.value_layers):
            if i == len(self.value_layers) - 1:
                x = torch.tanh(layer(x))
            else:
                x = torch.relu(layer(x))
        return x

    def forward_policy(self, embed_t, cand_t):
        # embed_t: [embed_dim], cand_t: [K, action_dim]
        K = cand_t.shape[0]
        embed_exp = embed_t.unsqueeze(0).expand(K, -1)
        inp = torch.cat([embed_exp, cand_t], dim=-1)
        x = inp
        for i, layer in enumerate(self.policy_layers):
            if i == len(self.policy_layers) - 1:
                x = layer(x) # Linear logit
            else:
                x = torch.relu(layer(x))
        return x.squeeze(-1) # [K]

def export_to_dual_head_json(model, out_path):
    weights = {}
    for i, layer in enumerate(model.trunk_layers):
        weights[f"trunkW{i + 1}"] = layer.weight.detach().cpu().numpy().flatten().tolist()
        weights[f"trunkB{i + 1}"] = layer.bias.detach().cpu().numpy().flatten().tolist()

    for i, layer in enumerate(model.policy_layers):
        weights[f"policyW{i + 1}"] = layer.weight.detach().cpu().numpy().flatten().tolist()
        weights[f"policyB{i + 1}"] = layer.bias.detach().cpu().numpy().flatten().tolist()

    for i, layer in enumerate(model.value_layers):
        weights[f"valueW{i + 1}"] = layer.weight.detach().cpu().numpy().flatten().tolist()
        weights[f"valueB{i + 1}"] = layer.bias.detach().cpu().numpy().flatten().tolist()

    spec = {
        "stateDim": 356,
        "actionDim": 45,
        "trunkHidden": [256, 256, 128],
        "policyHidden": [64, 64],
        "valueHidden": [64],
        "seed": 42,
        "architectureId": "NET_B"
    }

    payload = {
        "kind": "skirmish_dual_head_v2",
        "schemaVersion": 2,
        "architectureId": "NET_B",
        "stateEncoderVersion": "state-v2",
        "actionEncoderVersion": "action-v2",
        "spec": spec,
        "parameterCount": sum(p.numel() for p in model.parameters()),
        "weights": weights,
        "isStandardizationFolded": False,
        "meta": {"trainedEpochs": 15, "dataset": "5maps_skirmish"}
    }

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f)
    print(f"Exported trained model to {out_path} ({os.path.getsize(out_path)} bytes)")

def train():
    dataset_path = "training_runs/model_training_5maps/dataset_5maps.jsonl"
    if not os.path.exists(dataset_path):
        print(f"Error: dataset {dataset_path} not found")
        sys.exit(1)

    print(f"Loading samples from {dataset_path}...")
    samples = []
    with open(dataset_path, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip(): continue
            d = json.loads(line)
            samples.append(d)
    print(f"Loaded {len(samples)} samples.")

    device = torch.device("cpu")
    model = DualHeadPyTorchNet().to(device)
    optimizer = optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    mse_fn = nn.MSELoss()
    ce_fn = nn.CrossEntropyLoss()

    epochs = 15
    batch_size = 32
    num_samples = len(samples)

    print(f"Starting PyTorch training for {epochs} epochs (batch size {batch_size})...")
    for epoch in range(1, epochs + 1):
        indices = np.random.permutation(num_samples)
        total_pol_loss = 0.0
        total_val_loss = 0.0
        correct_pol = 0
        total_actions = 0

        for b_start in range(0, num_samples, batch_size):
            b_indices = indices[b_start : min(b_start + batch_size, num_samples)]
            optimizer.zero_grad()
            batch_loss = torch.tensor(0.0, device=device)

            for idx in b_indices:
                s = samples[idx]
                state_t = torch.tensor(s["stateVec"], dtype=torch.float32, device=device)
                cand_t = torch.tensor(s["candidateActions"], dtype=torch.float32, device=device)
                target_idx = s["targetActionIndex"]
                val_target = torch.tensor([s["valueTarget"]], dtype=torch.float32, device=device)

                embed = model.forward_trunk(state_t)
                val_pred = model.forward_value(embed)
                pol_logits = model.forward_policy(embed, cand_t).unsqueeze(0) # [1, K]

                v_loss = mse_fn(val_pred, val_target)
                target_t = torch.tensor([target_idx], dtype=torch.long, device=device)
                p_loss = ce_fn(pol_logits, target_t)

                sample_loss = p_loss + 1.0 * v_loss
                batch_loss = batch_loss + sample_loss

                if torch.argmax(pol_logits, dim=-1).item() == target_idx:
                    correct_pol += 1
                total_actions += 1

                total_pol_loss += p_loss.item()
                total_val_loss += v_loss.item()

            batch_loss = batch_loss / len(b_indices)
            batch_loss.backward()
            optimizer.step()

        pol_acc = (correct_pol / max(1, total_actions)) * 100
        avg_p_loss = total_pol_loss / max(1, total_actions)
        avg_v_loss = total_val_loss / max(1, total_actions)
        print(f"Epoch {epoch:2d}/{epochs}: Policy Loss={avg_p_loss:.4f}, Policy Acc={pol_acc:.1f}%, Value MSE={avg_v_loss:.4f}")

    out_json = "src/game/ai/models/trained_5map_dual_head.json"
    export_to_dual_head_json(model, out_json)
    print("Training and export complete!")

if __name__ == "__main__":
    train()
