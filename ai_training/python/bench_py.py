import time
import json
import torch
import torch.nn as nn
import torch.optim as optim
from spatial_resnet_model import SpatialResNet

def main():
    print("=== Python + PyTorch Benchmark ===")
    dataset_path = 'training_runs/agent_upgrade_20260919_01/baseline_dataset/dataset_part_pvp.jsonl'
    
    # 1. JSON Parsing Benchmark
    t0 = time.perf_counter()
    raw_records = []
    bytes_read = 0
    target_count = 300
    with open(dataset_path, 'r', encoding='utf-8') as f:
        for line in f:
            if not line.strip():
                continue
            bytes_read += len(line.encode('utf-8'))
            data = json.loads(line)
            raw_records.append(data)
            if len(raw_records) >= target_count:
                break
    t1 = time.perf_counter()
    parse_time_sec = t1 - t0
    print(f"[Python Data Parse] {len(raw_records)} samples ({bytes_read / (1024*1024):.2f} MB) parsed in {parse_time_sec:.3f}s")
    print(f"  -> Throughput: {len(raw_records)/parse_time_sec:.1f} samples/s ({(bytes_read/(1024*1024))/parse_time_sec:.2f} MB/s)")

    # 2. PyTorch Model Setup
    device = torch.device('cpu')
    model = SpatialResNet(spatial_channels=24, trunk_channels=32, global_dim=16, action_semantic_dim=24).to(device)
    optimizer = optim.Adam(model.parameters(), lr=1e-3)
    val_criterion = nn.MSELoss()
    pol_criterion = nn.CrossEntropyLoss()

    # Create dummy tensors representing 300 samples
    spatial_tensors = torch.randn(300, 24, 20, 20, device=device)
    globals_tensors = torch.randn(300, 16, device=device)
    # Each sample has 32 candidate actions with 120-dim pooled features
    cand_tensors = torch.randn(300, 32, 120, device=device)
    labels = torch.randint(0, 32, (300,), device=device)
    val_targets = torch.randn(300, 1, device=device)

    # 3. Model Forward Inference Benchmark (Batched vs Sequential)
    # 3a. Sequential (single sample like TS)
    model.eval()
    with torch.no_grad():
        t2 = time.perf_counter()
        for i in range(300):
            z = model.forward_trunk(spatial_tensors[i:i+1])
            _ = model.forward_value(z, globals_tensors[i:i+1])
            _ = model.forward_action_logits(cand_tensors[i:i+1])
        t3 = time.perf_counter()
        seq_time = t3 - t2
        print(f"[PyTorch Sequential Forward (BS=1)] 300 inferences in {seq_time:.3f}s")
        print(f"  -> Throughput: {300/seq_time:.1f} inferences/s ({(seq_time/300)*1000:.2f} ms/sample)")

    # 3b. Batched Forward (BS=64)
    with torch.no_grad():
        t4 = time.perf_counter()
        batch_size = 64
        for i in range(0, 300, batch_size):
            z = model.forward_trunk(spatial_tensors[i:i+batch_size])
            _ = model.forward_value(z, globals_tensors[i:i+batch_size])
            _ = model.forward_action_logits(cand_tensors[i:i+batch_size])
        t5 = time.perf_counter()
        batch_time = t5 - t4
        print(f"[PyTorch Batched Forward (BS=64)] 300 inferences in {batch_time:.3f}s")
        print(f"  -> Throughput: {300/batch_time:.1f} inferences/s ({(batch_time/300)*1000:.2f} ms/sample)")

    # 4. Full Training Step (Forward + Backward + Adam Step)
    model.train()
    t6 = time.perf_counter()
    batch_size = 64
    epochs = 3
    total_steps = 0
    for ep in range(epochs):
        for i in range(0, 300, batch_size):
            optimizer.zero_grad()
            sp = spatial_tensors[i:i+batch_size]
            gb = globals_tensors[i:i+batch_size]
            cd = cand_tensors[i:i+batch_size]
            lbl = labels[i:i+batch_size]
            vt = val_targets[i:i+batch_size]

            z = model.forward_trunk(sp)
            val_pred = model.forward_value(z, gb)
            pol_logits = model.forward_action_logits(cd)

            loss = val_criterion(val_pred, vt) + pol_criterion(pol_logits, lbl)
            loss.backward()
            optimizer.step()
            total_steps += len(sp)
    t7 = time.perf_counter()
    train_time = t7 - t6
    print(f"[PyTorch Full Training (Forward+Backward+Optimizer)] {total_steps} training steps in {train_time:.3f}s")
    print(f"  -> Training Throughput: {total_steps/train_time:.1f} samples/s ({train_time/epochs:.3f}s per epoch of 300 samples)")

if __name__ == '__main__':
    main()
