"""对双重回放清洗结果补充终局、动作完整性和文件哈希检查。"""

import hashlib
import json
import sys
from pathlib import Path


def select(root: Path) -> None:
    selected, partial, rejected = [], [], []
    seen = set()
    for name in ("replay_full_clean.jsonl", "replay_partial_clean.jsonl"):
        for line in (root / name).read_text(encoding="utf-8").splitlines():
            item = json.loads(line)
            reason = None
            digest = hashlib.sha256(Path(item["copiedPath"]).read_bytes()).hexdigest()
            source_digest = hashlib.sha256(Path(item["inputPath"]).read_bytes()).hexdigest()
            if digest != item["sha256"] or source_digest != digest:
                reason = "文件哈希与校验记录不一致"
            elif digest in seen:
                reason = "重复回放"
            elif not isinstance(item["actionCount"], int) or item["actionCount"] <= 0:
                reason = "没有有效动作"
            elif item["executedRecordCount"] != item["actionCount"]:
                reason = "动作未全部执行"
            seen.add(digest)
            if reason:
                rejected.append({**item, "selectionReason": reason})
            elif item["roomStatus"] == "CLOSED" and item["finalWinner"] is not None:
                selected.append({**item, "trainingUse": "完整对局候选，允许使用终局标签"})
            else:
                partial.append({**item, "trainingUse": "局部模仿学习候选，禁止使用终局胜负标签"})
    for name, records in (("training_full.jsonl", selected), ("training_partial.jsonl", partial), ("selection_rejected.jsonl", rejected)):
        (root / name).write_text("".join(json.dumps(item, ensure_ascii=False) + "\n" for item in records), encoding="utf-8")
    prior = json.loads((root / "replay_rejected.json").read_text(encoding="utf-8"))
    known = seen | {item["sha256"] for item in prior}
    inventory = []
    for source in Path("captures").rglob("game_get_*.bin"):
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        inventory.append({"inputPath": str(source.resolve()), "sha256": digest, "coveredByHistoricalValidation": digest in known})
    (root / "source_inventory.json").write_text(json.dumps(inventory, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    summary = {"source": "本地历史抓包；复用历史双重校验报告，本次完整重放已中止；没有取得云端新增数据", "full": len(selected),
               "partial": len(partial), "additionalRejected": len(rejected), "cleanerRejected": len(prior),
               "sourceFiles": len(inventory), "sourceUniqueHashes": len({item['sha256'] for item in inventory}),
               "unvalidatedFiles": sum(not item['coveredByHistoricalValidation'] for item in inventory),
               "fullActionCount": sum(item["actionCount"] for item in selected),
               "partialActionCount": sum(item["actionCount"] for item in partial)}
    (root / "training_selection_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (root / "training_selection.md").write_text(
        "# 历史对局训练筛选结果\n\n本次未取得新的云端对局。以下复用历史双重回放校验报告，重新核对原文件/复制文件哈希并筛选；本次完整重放已中止，不代表当前引擎重新通过。\n\n"
        f"- 本地响应文件：{len(inventory)} 份，{summary['sourceUniqueHashes']} 个唯一哈希，未被历史报告覆盖：{summary['unvalidatedFiles']} 份（不得自动纳入训练）。\n"
        f"- 完整对局候选：{len(selected)} 局，{summary['fullActionCount']} 条回放记录。\n"
        f"- 局部模仿学习候选：{len(partial)} 局，{summary['partialActionCount']} 条回放记录，不提供终局标签。\n"
        f"- 清洗拒绝：{len(prior)} 条（含重复）；额外完整性检查拒绝：{len(rejected)} 条。\n\n"
        "筛选依据：历史 SD forced/strict 双重校验、既有黑名单、SHA-256 去重、原文件及复制文件哈希一致、非空且全部执行的动作记录。完整候选还要求 CLOSED 状态和非空胜者。历史报告路径见 replay_clean_summary.md。\n\n"
        "回放兼容性不代表玩家策略水平；JSONL 是对局清单，copiedPath 指向原始回放。尚未导出模型特征或启动训练。\n",
        encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    select(Path(sys.argv[1]))
