import os

for root, dirs, files in os.walk(r'src'):
    for f in files:
        if f.endswith('.ts') or f.endswith('.tsx'):
            full = os.path.join(root, f)
            with open(full, 'r', encoding='utf-8') as fp:
                t = fp.read()
                if 'SpatialResnet' in t or 'spatial_resnet' in t or 'spatial26' in t or 'spatial34' in t:
                    print('Found in src:', full)

for root, dirs, files in os.walk(r'ai_training/v19'):
    for f in files:
        if f.endswith('.ts') or f.endswith('.py'):
            full = os.path.join(root, f)
            with open(full, 'r', encoding='utf-8', errors='ignore') as fp:
                t = fp.read()
                if 'SpatialResnet' in t or 'spatial_resnet' in t or 'load_model' in t or 'evaluate' in t:
                    print('Found in v19:', full)
