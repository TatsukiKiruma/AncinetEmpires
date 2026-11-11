import json

def print_model_meta(path, name):
    with open(path, 'r', encoding='utf-8') as f:
        d = json.load(f)
    print(f"=== {name} Metadata ===")
    for k in ['version', 'numBlocks', 'architectureId', 'globalPolicyPool', 'spatialChannels', 'encoderSchemaId']:
        print(f"  {k}: {d.get(k)}")
    for k in ['stem', 'res1_1', 'res1_2', 'res2_1', 'res2_2', 'valDense1', 'valDense2', 'polDense1', 'polDense2']:
        layer = d.get(k)
        if isinstance(layer, dict):
            shapes = {param: len(val) if isinstance(val, list) else type(val) for param, val in layer.items()}
            print(f"  {k}: {shapes}")

print_model_meta(r'C:\code\AncinetEmpires\ai_training\v16\out\v16_20260926_core\experiments\P1\s2026\P1_final.json', 'P1_final')
print_model_meta(r'C:\code\AncinetEmpires\ai_training\v19\out\run_20260929_v19_02\experiments\ppo_w1\s42\ppo_w1.json', 'theta1')
