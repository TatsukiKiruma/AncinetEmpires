#!/usr/bin/env python3
"""汇总 skirmish 评估日志中的胜负和动作偏好。"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


IMPORTANT_ACTIONS = [
    "move",
    "post_attack_move",
    "attack",
    "capture",
    "recruit_to_castle",
    "wait",
    "end_turn",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="分析 skirmish 评估 JSONL 的动作偏好")
    parser.add_argument(
        "--file",
        action="append",
        required=True,
        help="待分析文件，格式为 名称=路径；可重复",
    )
    parser.add_argument("--out", default="", help="Markdown 报告输出路径")
    return parser.parse_args()


def parse_named_file(value: str) -> tuple[str, Path]:
    if "=" not in value:
        path = Path(value)
        return path.stem, path
    name, raw_path = value.split("=", 1)
    if not name.strip() or not raw_path.strip():
        raise ValueError(f"--file 参数无效：{value}")
    return name.strip(), Path(raw_path.strip())


def action_type(action_code: str) -> str:
    return action_code.split(":", 1)[0] if action_code else "unknown"


def recruit_type(action_code: str) -> str:
    parts = action_code.split(":")
    return parts[1] if len(parts) > 1 else "unknown"


def policy_for_winner(episode: dict[str, Any]) -> str:
    summary = episode.get("summary", {})
    winner = summary.get("adjudicatedWinnerAlliance")
    if winner is None:
        winner = summary.get("winnerAlliance")
    if winner is None:
        return "draw"
    policy_by_player = episode.get("policyByPlayer", {})
    return str(policy_by_player.get(str(winner), policy_by_player.get(winner, "unknown")))


def new_policy_bucket() -> dict[str, Any]:
    return {
        "actions": 0,
        "actionTypes": Counter(),
        "recruits": Counter(),
        "spendValue": 0,
        "killValue": 0,
        "lostValue": 0,
        "episodesTouched": set(),
    }


def analyze_file(path: Path) -> dict[str, Any]:
    result: dict[str, Any] = {
        "file": str(path),
        "episodes": 0,
        "terminal": 0,
        "timeout": 0,
        "stopped": 0,
        "illegal": 0,
        "steps": 0,
        "wins": Counter(),
        "byPolicy": defaultdict(new_policy_bucket),
        "byScenario": {},
    }

    with path.open("r", encoding="utf-8") as handle:
        for episode_index, line in enumerate(handle):
            line = line.strip()
            if not line:
                continue
            episode = json.loads(line)
            summary = episode.get("summary", {})
            scenario_id = episode.get("scenario", {}).get("id", "unknown")
            steps = episode.get("steps", [])
            result["episodes"] += 1
            result["terminal"] += 1 if summary.get("terminal") else 0
            result["timeout"] += 1 if summary.get("timeout") else 0
            result["stopped"] += 1 if summary.get("stoppedByMaxSteps") else 0
            result["illegal"] += int(summary.get("illegalActionCount", 0) or 0)
            result["steps"] += int(summary.get("stepCount", len(steps)) or 0)

            winner_policy = policy_for_winner(episode)
            result["wins"][winner_policy] += 1
            result["byScenario"][scenario_id] = {
                "winnerPolicy": winner_policy,
                "timeout": bool(summary.get("timeout")),
                "steps": int(summary.get("stepCount", len(steps)) or 0),
            }

            for step in steps:
                policy = str(step.get("policy", "unknown"))
                player_id = str(step.get("playerId", ""))
                policy_by_player = episode.get("policyByPlayer", {})
                bucket = result["byPolicy"][policy]
                bucket["actions"] += 1
                bucket["episodesTouched"].add(episode_index)
                code = str(step.get("actionCode", ""))
                kind = action_type(code)
                bucket["actionTypes"][kind] += 1
                if kind == "recruit_to_castle":
                    bucket["recruits"][recruit_type(code)] += 1
                bucket["spendValue"] += int(step.get("spendValue", 0) or 0)
                kill_by_player = step.get("killValueByPlayer", {}) or {}
                lost_by_player = step.get("lostValueByPlayer", {}) or {}
                for owner_id, value in kill_by_player.items():
                    owner_policy = str(policy_by_player.get(str(owner_id), policy_by_player.get(owner_id, "unknown")))
                    result["byPolicy"][owner_policy]["killValue"] += int(value or 0)
                for owner_id, value in lost_by_player.items():
                    owner_policy = str(policy_by_player.get(str(owner_id), policy_by_player.get(owner_id, "unknown")))
                    result["byPolicy"][owner_policy]["lostValue"] += int(value or 0)

    return result


def percent(part: int | float, total: int | float) -> str:
    if not total:
        return "0.00%"
    return f"{part / total * 100:.2f}%"


def top_items(counter: Counter[str], limit: int = 8) -> str:
    if not counter:
        return "-"
    return ", ".join(f"{name}:{count}" for name, count in counter.most_common(limit))


def format_policy_rows(name: str, summary: dict[str, Any]) -> list[str]:
    rows: list[str] = []
    for policy, bucket in sorted(summary["byPolicy"].items()):
        total = bucket["actions"]
        move_like = (
            bucket["actionTypes"]["move"]
            + bucket["actionTypes"]["post_attack_move"]
            + bucket["actionTypes"]["wait"]
            + bucket["actionTypes"]["end_turn"]
        )
        pressure = bucket["actionTypes"]["attack"] + bucket["actionTypes"]["capture"]
        rows.append(
            "| "
            + " | ".join(
                [
                    name,
                    policy,
                    str(total),
                    percent(move_like, total),
                    percent(pressure, total),
                    percent(bucket["actionTypes"]["recruit_to_castle"], total),
                    str(bucket["actionTypes"]["attack"]),
                    str(bucket["actionTypes"]["capture"]),
                    str(bucket["actionTypes"]["wait"]),
                    str(bucket["actionTypes"]["end_turn"]),
                    str(bucket["spendValue"]),
                    str(bucket["killValue"]),
                    str(bucket["lostValue"]),
                ]
            )
            + " |"
        )
    return rows


def build_report(named_summaries: list[tuple[str, dict[str, Any]]]) -> str:
    lines: list[str] = [
        "# Skirmish AI 动作偏好诊断报告",
        "",
        "## 总览",
        "",
        "| 文件 | Episode | 胜者分布 | Timeout | 非法动作 | 步数保护 | 平均步数 |",
        "| --- | ---: | --- | ---: | ---: | ---: | ---: |",
    ]

    for name, summary in named_summaries:
        episodes = summary["episodes"]
        avg_steps = summary["steps"] / episodes if episodes else 0
        wins = ", ".join(f"{policy}:{count}" for policy, count in sorted(summary["wins"].items()))
        lines.append(
            f"| {name} | {episodes} | {wins} | {summary['timeout']} | "
            f"{summary['illegal']} | {summary['stopped']} | {avg_steps:.1f} |"
        )

    lines.extend(
        [
            "",
            "## 策略动作分布",
            "",
            "| 文件 | 策略 | 动作数 | 移动/等待类 | 攻击/占领类 | 招募类 | attack | capture | wait | end_turn | 花费 | 击杀价值 | 损失价值 |",
            "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
        ]
    )
    for name, summary in named_summaries:
        lines.extend(format_policy_rows(name, summary))

    lines.extend(["", "## 招募偏好", ""])
    for name, summary in named_summaries:
        lines.append(f"### {name}")
        for policy, bucket in sorted(summary["byPolicy"].items()):
            lines.append(f"- {policy}: {top_items(bucket['recruits'])}")
        lines.append("")

    lines.extend(["## 失败/超时场景", ""])
    for name, summary in named_summaries:
        lines.append(f"### {name}")
        rows = []
        for scenario_id, item in sorted(summary["byScenario"].items()):
            if item["winnerPolicy"] != "bc" or item["timeout"]:
                rows.append(
                    f"| `{scenario_id}` | {item['winnerPolicy']} | "
                    f"{'是' if item['timeout'] else '否'} | {item['steps']} |"
                )
        if rows:
            lines.extend(["| 场景 | 胜者策略 | Timeout | 步数 |", "| --- | --- | --- | ---: |"])
            lines.extend(rows)
        else:
            lines.append("- 无")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    args = parse_args()
    named_summaries = [(name, analyze_file(path)) for name, path in map(parse_named_file, args.file)]
    report = build_report(named_summaries)
    if args.out:
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(report, encoding="utf-8")
    print(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
