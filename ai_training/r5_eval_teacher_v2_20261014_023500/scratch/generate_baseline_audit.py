import os
import sys
import json
import hashlib

STAGE_DIR = r"C:\code\AncinetEmpires\ai_training\r5_eval_teacher_v2_20261014_023500"
ROOT_DIR = r"C:\code\AncinetEmpires"

def sha256_file(p):
    with open(p, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()

def scan_env():
    env_dir = os.path.join(STAGE_DIR, "env")
    files_info = {}
    for root, dirs, files in os.walk(env_dir):
        if "node_modules" in root or ".git" in root:
            continue
        for f in files:
            full_p = os.path.join(root, f)
            rel_p = os.path.relpath(full_p, env_dir).replace("\\", "/")
            files_info[rel_p] = {
                "size": os.path.getsize(full_p),
                "sha256": sha256_file(full_p)
            }
    return files_info

def scan_protected_root_files():
    targets = [
        "package.json",
        "package-lock.json",
        "vite.config.ts",
        "tsconfig.json",
        "src/game/engine.ts",
        "src/game/rules.ts",
        "src/game/env.ts",
        "src/game/types.ts",
        "src/game/abilities.ts",
        "src/game/default_state.ts",
        "src/game/apk_skirmish.ts",
        "src/game/apk_skirmish_map_assets.ts",
        "src/game/ai/heuristic_ai.ts",
        "src/game/ai/apk_like_ai.ts",
    ]
    protected_hashes = {}
    for t in targets:
        full_p = os.path.join(ROOT_DIR, t)
        if os.path.exists(full_p):
            protected_hashes[t] = sha256_file(full_p)
        else:
            protected_hashes[t] = "NOT_FOUND"
    return protected_hashes

if __name__ == "__main__":
    env_files = scan_env()
    protected = scan_protected_root_files()

    manifest = {
        "rulesRevision": "apk-4.2.5.1-rules-20261013-r4",
        "zipSha256": "323924ab76a8272322f4b122d64e4af4ff2574a85c6a4d996bf4cb9680bffea8",
        "envFileCount": len(env_files),
        "envFiles": env_files,
        "protectedRootFilesBaseline": protected
    }

    out_file = os.path.join(STAGE_DIR, "artifacts", "source_manifest.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    print(f"Generated source_manifest.json with {len(env_files)} env files and {len(protected)} protected root files.")
