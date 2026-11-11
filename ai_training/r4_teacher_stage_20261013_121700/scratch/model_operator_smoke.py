import sys
import json
import time
import torch
import torch.nn as nn
import torch.optim as optim

def run_operator_smoke():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Running model operator smoke on device: {device}")

    B = 4
    C, H, W = 10, 20, 20
    U, F = 48, 16
    G = 12
    A, FA = 32, 20

    # 1. 模拟网络架构组件
    conv_net = nn.Sequential(
        nn.Conv2d(C, 64, kernel_size=3, padding=1),
        nn.ReLU(),
        nn.Conv2d(64, 64, kernel_size=3, padding=1),
        nn.ReLU(),
        nn.AdaptiveAvgPool2d((1, 1))
    ).to(device)

    unit_mlp = nn.Sequential(
        nn.Linear(F, 64),
        nn.ReLU(),
        nn.Linear(64, 32)
    ).to(device)

    global_mlp = nn.Sequential(
        nn.Linear(G, 64),
        nn.ReLU(),
        nn.Linear(64, 32)
    ).to(device)

    action_mlp = nn.Sequential(
        nn.Linear(64 + 32 + 32 + FA, 64),
        nn.ReLU(),
        nn.Linear(64, 1)
    ).to(device)

    optimizer = optim.AdamW(
        list(conv_net.parameters()) +
        list(unit_mlp.parameters()) +
        list(global_mlp.parameters()) +
        list(action_mlp.parameters()),
        lr=1e-3
    )

    # 2. 模拟输入张量
    board = torch.randn(B, C, H, W, device=device)
    units = torch.randn(B, U, F, device=device)
    global_feat = torch.randn(B, G, device=device)
    actions = torch.randn(B, A, FA, device=device)

    t0 = time.time()
    # Forward
    board_emb = conv_net(board).squeeze(-1).squeeze(-1) # [B, 64]
    unit_emb = unit_mlp(units).mean(dim=1)              # [B, 32]
    global_emb = global_mlp(global_feat)               # [B, 32]

    state_emb = torch.cat([board_emb, unit_emb, global_emb], dim=-1) # [B, 128]
    state_expanded = state_emb.unsqueeze(1).expand(-1, A, -1)        # [B, A, 128]

    act_input = torch.cat([state_expanded, actions], dim=-1)         # [B, A, 128+20]
    logits = action_mlp(act_input).squeeze(-1)                       # [B, A]

    # Loss & Backward
    target_probs = torch.softmax(torch.randn(B, A, device=device), dim=-1)
    loss = nn.functional.cross_entropy(logits, target_probs)
    optimizer.zero_grad()
    loss.backward()

    # 检查梯度是否有限
    has_nan_grad = False
    for p in action_mlp.parameters():
        if p.grad is not None and torch.isnan(p.grad).any():
            has_nan_grad = True

    optimizer.step()
    dur = time.time() - t0

    result = {
        "device": str(device),
        "cuda_available": torch.cuda.is_available(),
        "loss_finite": bool(torch.isfinite(loss).item()),
        "has_nan_grad": has_nan_grad,
        "step_duration_ms": round(dur * 1000, 2),
        "status": "PASS" if not has_nan_grad and torch.isfinite(loss).item() else "FAIL"
    }

    print("Operator smoke result:", json.dumps(result, indent=2))
    return result

if __name__ == "__main__":
    run_operator_smoke()
