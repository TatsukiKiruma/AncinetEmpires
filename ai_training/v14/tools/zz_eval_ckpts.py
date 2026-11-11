import json, torch, pathlib, sys
sys.path.insert(0, "python")
import train_spatial_resnet as T
from spatial_resnet_model import SpatialResNet

run = pathlib.Path("v14/out/v14_20260924_t14")
rows = [json.loads(l) for l in (run/"T14-04/tiny_fit_dataset.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]

def evaluate(state_path, label):
    state = torch.load(state_path, map_location="cpu", weights_only=False)
    model = SpatialResNet(spatial_channels=26, trunk_channels=32, global_dim=20,
                          action_semantic_dim=53, version="spatial-resnet-v2", num_blocks=2)
    model.load_state_dict(state["model"])
    model.eval()
    correct = 0; total = 0; max_logit = 0.0; wrong = []
    with torch.no_grad():
        for row in rows:
            cands = row["candidateActions"]
            if not cands: continue
            spatial = torch.tensor(row["spatialTensor"], dtype=torch.float32).reshape(1, 26, 20, 20)
            glob = torch.tensor(row["globalFeatures"], dtype=torch.float32).unsqueeze(0)
            z = model.forward_trunk(spatial)
            import numpy as np
            feats = []
            for c in cands:
                sem = np.array(list(c.get("semantics", []))[:53] + [0.0]*max(0,53-len(c.get("semantics", []))), dtype=np.float32)
                feats.append(sem)
            v_act = T.pool_coords_batch(z[0], [c.get("actorCoord") for c in cands])
            v_land = T.pool_coords_batch(z[0], [c.get("landingCoord") for c in cands])
            v_tgt = T.pool_coords_batch(z[0], [c.get("targetCoord") for c in cands])
            sem_t = torch.from_numpy(np.stack(feats))
            glob_e = glob[0].unsqueeze(0).expand(len(cands), -1)
            logits = model.forward_action_logits(torch.cat([v_act, v_land, v_tgt, sem_t, glob_e], dim=-1).unsqueeze(0))[0]
            best = int(torch.argmax(logits))
            max_logit = max(max_logit, float(torch.max(torch.abs(logits))))
            total += 1
            if best == int(row["targetActionIndex"]): correct += 1
            else: wrong.append((row["sampleId"], row["targetActionCode"], row["candidateActionCodes"][best], len(cands)))
    print(f"{label}: epoch={state.get('epoch')} top1={correct}/{total} = {correct/total:.4f} maxAbsLogit={max_logit:.3f}")
    for w in wrong[:8]: print("   wrong:", w)

for ep in [99, 149, 199, 249, 279, 299]:
    p = pathlib.Path(f"v14/out/v14_20260924_t14/T14-04/run_s42/ckpt_ep{ep+1:03d}.pt")
    if p.exists(): evaluate(p, f"ckpt-ep{ep+1}")
    else: print("missing", p)
