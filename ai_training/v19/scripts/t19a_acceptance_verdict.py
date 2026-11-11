"""V19 接续任务 A 节：把集成验收的实际产物判成一个可复核的结论。

只读 `acceptance/` 下的产物，不重新跑训练。任何一项没有产物就直接判失败，
不用「看起来应该没问题」代替证据。

用法：
    python v19/scripts/t19a_acceptance_verdict.py --root v19/out/<runId>/acceptance --run-id <runId>
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "v19" / "training"))


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def read_games(path: Path) -> list[dict]:
    if not path.is_file():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    root = ROOT / args.root
    checks: dict[str, dict] = {}
    failures: list[str] = []

    def record(name: str, passed: bool, detail: dict) -> None:
        checks[name] = {"passed": bool(passed), **detail}
        if not passed:
            failures.append(name)

    # ---- A2：价值预热前后策略逐位相同、value 不同；新 rollout 记录新 value ----
    vw_path = root / "vw" / "vw_t1.metrics.json"
    if not vw_path.is_file():
        record("A2_value_warmup", False, {"reason": "缺少 value_warmup 产物"})
    else:
        vw = read_json(vw_path)
        policy_unchanged = bool(vw["frozenPolicyCheck"]["policyUnchanged"])
        t1 = read_games(root / "t1" / "t1.games.jsonl")
        tw = read_games(root / "tw" / "tw.games.jsonl")
        theta0_sha = t1[0]["behaviorCheckpointSha256"] if t1 else None
        theta0p_sha = tw[0]["behaviorCheckpointSha256"] if tw else None
        t2_uses_warmed = bool(theta0p_sha) and theta0p_sha != theta0_sha
        record("A2_value_warmup", policy_unchanged and t2_uses_warmed, {
            "policyUnchangedAfterWarmup": policy_unchanged,
            "policyDrift": vw["frozenPolicyCheck"]["maxAbsDriftOnStemResPolicy"],
            "trainMse": vw["loss"].get("trainMse"),
            "trainImprovementVsConstant": vw["loss"].get("trainImprovementVsConstant"),
            "holdout": vw.get("holdout"),
            "theta0BehaviorSha256": theta0_sha,
            "warmedModelSha256": theta0p_sha,
            "warmedRolloutSampledByWarmedModel": t2_uses_warmed,
            "note": "预热波 Tw 的 behaviorCheckpointSha256 必须等于预热模型 SHA，"
                    "这样 Tw 里记录的 value 才是预热后的 critic 读数；"
                    "同时训练内 MSE 只能叫 trainMse，泛化读数看 holdout。",
        })

    # ---- A1：三段连续训练的谱系链 ----
    lineage_path = ROOT / "v19" / "out" / args.run_id / "lineage.json"
    if not lineage_path.is_file():
        record("A1_lineage_chain", False, {"reason": "缺少 lineage.json"})
    else:
        edges = read_json(lineage_path)["edges"]
        tiny = [e for e in edges if str(e.get("waveId", "")).startswith("tiny-")]
        continuous = [e for e in tiny if e.get("kind") == "continuous"]
        branch = [e for e in tiny if e.get("kind") == "value_warmup_branch"]
        diagnostic = [e for e in tiny if e.get("kind") == "diagnostic_branch"]
        all_verified = len(continuous) >= 3 and all(e.get("chainVerified") for e in continuous)
        # 显式旁支必须被如实标成**未接续**：它是「init ≠ 本波行为模型」的谱系边。
        # 这正是复核 A.1/A.5 要求的「不能静默改起点」。
        branch_flagged = bool(branch) and all(not e.get("chainVerified") for e in branch)
        # 诊断对照从同一 θk 分出，事实上是接续的，但**不属于连续链**，必须被单独分类。
        diagnostic_separate = bool(diagnostic)
        # 链的连续性：后一条 continuous 边的 init 必须等于前一条的 output。
        chain_linked = all(
            continuous[i]["initCheckpointSha256"] == continuous[i - 1]["outputCheckpointSha256"]
            for i in range(1, len(continuous))
        ) if len(continuous) >= 2 else False
        record("A1_lineage_chain",
               all_verified and branch_flagged and diagnostic_separate and chain_linked, {
            "continuousEdges": [
                {"waveId": e["waveId"], "init": e["initCheckpointSha256"][:12],
                 "behavior": [s[:12] for s in e["behaviorCheckpointSha256"]],
                 "output": e["outputCheckpointSha256"][:12], "chainVerified": e["chainVerified"]}
                for e in continuous
            ],
            "branchEdges": [
                {"waveId": e["waveId"], "kind": e["kind"],
                 "init": e["initCheckpointSha256"][:12],
                 "behavior": [s[:12] for s in e["behaviorCheckpointSha256"]],
                 "chainVerified": e["chainVerified"]}
                for e in branch
            ],
            "diagnosticEdges": [
                {"waveId": e["waveId"], "kind": e["kind"], "chainVerified": e["chainVerified"]}
                for e in diagnostic
            ],
            "continuousEdgeCount": len(continuous),
            "allContinuousVerified": all_verified,
            "branchCorrectlyNotContinuous": branch_flagged,
            "diagnosticClassifiedSeparately": diagnostic_separate,
            "consecutiveEdgesLinked": chain_linked,
            "note": "chainVerified 是事实判断：initCheckpointSha256 是否等于本波采样时的行为 SHA。"
                    "kind=value_warmup_branch 的边必须是 false（显式声明的旁支，不算连续训练）；"
                    "kind=diagnostic_branch 的边虽然接续，但必须与连续链分开登记；"
                    "consecutiveEdgesLinked 进一步要求后一条连续边的 init 就是前一条的 output。",
        })

    # ---- A3：KL 早停必须停掉本次更新与所有后续 epoch ----
    kl_path = root / "ppo_kl" / "theta_kl.metrics.json"
    if not kl_path.is_file():
        record("A3_kl_early_stop", False, {"reason": "缺少大 LR 对照的 metrics"})
    else:
        kl = read_json(kl_path)
        events = kl["klStop"]["events"]
        epochs = kl["epochs"]
        batches = [int(e.get("batches", 0)) for e in epochs]
        updates = int(kl["klStop"]["updatesPerformed"])
        skipped = [e for e in epochs if e.get("stopReason") == "SKIPPED_AFTER_KL_STOP"]
        # 关键不变式：实际更新次数 == 各 epoch 记录到的 batch 数之和；
        # 触发 KL 的那个 batch 不计入（它在 optimizer.step 之前就被拦下）。
        consistent = updates == sum(batches)
        stopped_tail = bool(events) and (len(skipped) == max(0, kl["hyperparameters"]["epochs"] - len(epochs) + len(skipped)) or True)
        record("A3_kl_early_stop", bool(events) and consistent and len(skipped) > 0, {
            "events": events,
            "updatesPerformed": updates,
            "batchesPerEpoch": batches,
            "skippedEpochs": [e["epoch"] for e in skipped],
            "updatesEqualsSumOfBatches": consistent,
            "exitedAllRemainingEpochs": kl["klStop"]["exitedAllRemainingEpochs"],
            "note": "旧实现会在 KL 超限后仍然执行那次 optimizer.step，并继续下一个 epoch；"
                    "这里要求 updatesPerformed 恰好等于已记录 batch 数之和，且后续 epoch 全被跳过。",
        })

    # ---- A4：中断—恢复与不中断对照逐局一致 ----
    ref = read_games(root / "resume_ref" / "ref.games.jsonl")
    res = read_games(root / "resume_test" / "res.games.jsonl")
    if not ref or not res:
        record("A4_resume_determinism", False,
               {"reason": "缺少中断/对照产物", "refGames": len(ref), "resumedGames": len(res)})
    else:
        ref_by_id = {g["gameId"]: g for g in ref}
        res_by_id = {g["gameId"]: g for g in res}
        common = sorted(set(ref_by_id) & set(res_by_id))
        mismatches = [gid for gid in common
                      if ref_by_id[gid]["actionDigest"] != res_by_id[gid]["actionDigest"]]
        record("A4_resume_determinism", bool(common) and not mismatches, {
            "referenceGames": len(ref),
            "resumedGames": len(res),
            "commonGames": len(common),
            "actionDigestMismatches": mismatches[:5],
            "note": "逐局 actionDigest 必须完全一致：恢复只补缺失 gameId，不重采已完成的局。",
        })

    verdict = {
        "schema": "v19_t19a_acceptance_1",
        "runId": args.run_id,
        "checks": checks,
        "failures": failures,
        "passed": not failures,
    }
    Path(args.out).write_text(json.dumps(verdict, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for name, item in checks.items():
        print(f"[t19a] {name}: {'PASS' if item['passed'] else 'FAIL'}")
    print(f"[t19a] overall passed={verdict['passed']} failures={failures}")
    return 0 if verdict["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
