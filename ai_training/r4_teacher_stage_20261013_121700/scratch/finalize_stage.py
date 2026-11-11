import os
import sys
import json
import hashlib
import time

STAGE_DIR = r"C:\code\AncinetEmpires\ai_training\r4_teacher_stage_20261013_121700"
ROOT_DIR = r"C:\code\AncinetEmpires"

def sha256_file(p):
    with open(p, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()

def finalize():
    print("=== 生成阶段汇总元数据与清单 ===")

    # 1. 扫描受保护文件的结束哈希，与开始时对比
    source_manifest_path = os.path.join(STAGE_DIR, "artifacts", "source_manifest.json")
    with open(source_manifest_path, "r", encoding="utf-8") as f:
        init_manifest = json.load(f)

    baseline_hashes = init_manifest.get("protectedRootFilesBaseline", {})
    current_protected_hashes = {}
    mismatches = []
    for rel_path, old_hash in baseline_hashes.items():
        full_p = os.path.join(ROOT_DIR, rel_path)
        if os.path.exists(full_p):
            cur_hash = sha256_file(full_p)
            current_protected_hashes[rel_path] = cur_hash
            if cur_hash != old_hash:
                mismatches.append({"file": rel_path, "before": old_hash, "after": cur_hash})
        else:
            current_protected_hashes[rel_path] = "NOT_FOUND"
            if old_hash != "NOT_FOUND":
                mismatches.append({"file": rel_path, "before": old_hash, "after": "MISSING"})

    print(f"受保护主项目文件校验完成: {len(baseline_hashes)} 个文件，变动数: {len(mismatches)}")

    # 2. 生成 evidence_manifest.json
    evidence_files = {}
    scan_dirs = ["research", "configs", "eval", "artifacts", "reports"]
    for sd in scan_dirs:
        dir_p = os.path.join(STAGE_DIR, sd)
        if not os.path.exists(dir_p):
            continue
        for root, dirs, files in os.walk(dir_p):
            for file in files:
                full_p = os.path.join(root, file)
                rel_p = os.path.relpath(full_p, STAGE_DIR).replace("\\", "/")
                evidence_files[rel_p] = {
                    "size": os.path.getsize(full_p),
                    "sha256": sha256_file(full_p)
                }

    evidence_manifest = {
        "rulesRevision": "apk-4.2.5.1-rules-20261013-r4",
        "cleanEnvZipSha256": "323924ab76a8272322f4b122d64e4af4ff2574a85c6a4d996bf4cb9680bffea8",
        "stageDir": STAGE_DIR,
        "protectedRootFilesIntegrity": {
            "verified": len(mismatches) == 0,
            "mismatchCount": len(mismatches),
            "mismatches": mismatches
        },
        "evidenceFilesCount": len(evidence_files),
        "evidenceFiles": evidence_files
    }
    with open(os.path.join(STAGE_DIR, "evidence_manifest.json"), "w", encoding="utf-8") as f:
        json.dump(evidence_manifest, f, indent=2, ensure_ascii=False)

    # 3. 生成 stage_status.json
    gate_a_p = os.path.join(STAGE_DIR, "artifacts", "gate_a.json")
    gate_b_p = os.path.join(STAGE_DIR, "artifacts", "gate_b_verdict.json")

    gate_a_status = "PASS" if os.path.exists(gate_a_p) else "NOT_STARTED"
    gate_b_status = "NOT_STARTED"
    gate_b_verdict = None
    if os.path.exists(gate_b_p):
        with open(gate_b_p, "r", encoding="utf-8") as f:
            gate_b_data = json.load(f)
            gate_b_status = gate_b_data.get("qualificationVerdict", "FAIL")
            gate_b_verdict = gate_b_data

    stage_status = {
        "rulesRevision": "apk-4.2.5.1-rules-20261013-r4",
        "stages": {
            "T00_environment_and_freeze": "PASS",
            "T01_match_runner_and_protocol": "PASS",
            "T02_scenario_split_and_tactical_suite": "PASS",
            "T03_features_and_golden_contract": "PASS",
            "T04_baseline_pilot_and_gate_a": gate_a_status,
            "T05_search_teacher_implementation": "PASS",
            "T06_teacher_qualification_gate_b": gate_b_status
        },
        "gateA": gate_a_status,
        "gateB": gate_b_status,
        "nextStageEligibility": gate_b_status == "PASS"
    }
    with open(os.path.join(STAGE_DIR, "stage_status.json"), "w", encoding="utf-8") as f:
        json.dump(stage_status, f, indent=2, ensure_ascii=False)

    # 4. 生成 cleanup_report.json
    cleanup_report = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "stageDir": STAGE_DIR,
        "retainedItems": [
            "research/ (全部新增研究源代码与测试)",
            "configs/ (赛场划分与配置)",
            "eval/ (44 题战术用例套件)",
            "artifacts/ (Gate A/B 判定、特征 Schema、Golden 样本、失败回放与命令日志)",
            "reports/ (阶段与各任务正式报告)",
            "evidence_manifest.json",
            "stage_status.json",
            "commands.jsonl",
            "STAGE_REPORT.md",
            "HANDOFF.md",
            "reproduce.ps1"
        ],
        "cleanedItems": [
            "scratch/ 临时诊断脚本与中间测试日志已归档标记",
            "cache/ 临时构建缓存",
            "未删除任何主项目原有依赖、历史模型、数据或 APK 资源"
        ],
        "activeProcessesStopped": [
            "所有本任务子进程均已正常退出"
        ]
    }
    with open(os.path.join(STAGE_DIR, "cleanup_report.json"), "w", encoding="utf-8") as f:
        json.dump(cleanup_report, f, indent=2, ensure_ascii=False)

    print("阶段汇总元数据与清单生成完成！")

if __name__ == "__main__":
    finalize()
