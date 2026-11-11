import os
import json

paths = [
    r'ai_training/v17/out/v17_20260926_r2',
    r'ai_training/v18/out/run_20260927_v18_01',
    r'ai_training/v19/out/run_20260929_v19_02',
    r'ai_training/migration'
]

for p in paths:
    if os.path.exists(p):
        for root, dirs, files in os.walk(p):
            for f in files:
                if 'manifest' in f.lower() or 'identity' in f.lower() or 'champion' in f.lower():
                    full = os.path.join(root, f)
                    print(full)
                    try:
                        if full.endswith('.json'):
                            with open(full, 'r', encoding='utf-8') as fp:
                                d = json.load(fp)
                                s = json.dumps(d)
                                if 'b705b52a' in s:
                                    print('  --> Found b705b52a in JSON:', full)
                    except:
                        pass
