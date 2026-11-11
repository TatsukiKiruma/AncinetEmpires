import torch

pt_path = r'C:\code\AncinetEmpires\ai_training\v19\out\run_20260929_v19_02\experiments\ppo_w1\s42\ppo_w1.train_state.pt'
state = torch.load(pt_path, map_location='cpu', weights_only=False)
print("Keys in train_state.pt:", list(state.keys()) if isinstance(state, dict) else type(state))
if isinstance(state, dict):
    for k in state.keys():
        if isinstance(state[k], dict):
            print(f"  {k}: dict with {len(state[k])} keys. Sample keys: {list(state[k].keys())[:5]}")
        else:
            print(f"  {k}: {type(state[k])}")
