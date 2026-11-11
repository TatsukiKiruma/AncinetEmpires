import json

def inspect_model_json(path, name):
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    print(f"=== {name} ===")
    print("Keys:", list(data.keys()))
    if 'schema' in data:
        print("Schema:", data['schema'])
    if 'model_config' in data:
        print("Model config:", data['model_config'])
    if 'config' in data:
        print("Config:", data['config'])
    if 'metadata' in data:
        print("Metadata:", data['metadata'])
    if 'state_dict' in data:
        print("State dict keys count:", len(data['state_dict']))
        for k in list(data['state_dict'].keys())[:10]:
            shape = [len(data['state_dict'][k])] if isinstance(data['state_dict'][k], list) else type(data['state_dict'][k])
            print(f"  {k}: {shape}")
    elif 'weights' in data:
        print("Weights keys count:", len(data['weights']))
        for k in list(data['weights'].keys())[:10]:
            print(f"  {k}")

inspect_model_json(r'C:\code\AncinetEmpires\ai_training\v16\out\v16_20260926_core\experiments\P1\s2026\P1_final.json', 'P1_final')
inspect_model_json(r'C:\code\AncinetEmpires\ai_training\v19\out\run_20260929_v19_02\experiments\ppo_w1\s42\ppo_w1.json', 'theta1')
