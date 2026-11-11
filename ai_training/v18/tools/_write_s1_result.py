"""把 S1 的结果写进报告（用与 S0 逐字相同的判据）。

中文：S1 的判定必须用与 S0 完全相同的口径，因此这里只把两份 JSON 并排放进报告，
不做任何事后挑选。可重复执行。
"""
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "v18" / "out" / "run_20260927_v18_01"
CF = RUN / "counterfactual"


def load(name: str) -> dict:
    return json.loads((CF / name).read_text(encoding="utf-8"))


def main() -> int:
    s0 = load("preference_repeatability.json")
    s1_path = CF / "preference_repeatability.S1horizon.json"
    if not s1_path.is_file():
        print("ERROR: S1 analysis missing")
        return 2
    s1 = load("preference_repeatability.S1horizon.json")

    def row(tag: str, d: dict) -> str:
        p = d["pairLevel"]
        l = d["leaveOneSeedOut"]
        r = d["randomBaseline"]
        return (
            f"| {tag} | {p['pairs']} | {p['unanimousRate']:.4f} | "
            f"{p['unanimousImprovement']} | {p['unanimousDegradation']} | "
            f"{l['agreementRate']:.4f} | {r['unanimousRateP95']:.4f} | {r['looAgreementP95']:.4f} | "
            f"{'是' if d['verdict']['unanimityBeatsRandom'] else '**否**'} |"
        )

    table = "\n".join([
        "| 版本 | 对数 | 3-seed 一致率 | 一致改善 | 一致退化 | 留一一致率 | 随机一致率 P95 | 随机留一 P95 | 超过随机 |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---|",
        row("S0（256 转换 / 30 秒）", s0),
        row("**S1（1024 转换 / 120 秒）**", s1),
    ])

    verdict = (
        "**S1 也没有超过随机基线。**\n\n"
        f"- S1 的 3-seed 一致率 {s1['pairLevel']['unanimousRate']:.4f} < 随机 P95 "
        f"{s1['randomBaseline']['unanimousRateP95']:.4f}；\n"
        f"- S1 的留一一致率 {s1['leaveOneSeedOut']['agreementRate']:.4f} < 随机 P95 "
        f"{s1['randomBaseline']['looAgreementP95']:.4f}；\n"
        f"- 更关键的是「一致改善」从 S0 的 {s0['pairLevel']['unanimousImprovement']} 个降到 "
        f"**{s1['pairLevel']['unanimousImprovement']} 个**：把续弈拉长到 1024 次转换后，"
        "备选动作几乎从未一致地优于学生。\n\n"
        "⇒ **续弈预算不是第一道门失败的主因**。按任务书，不再继续加预算，"
        "转入 S2（干预单位从「单个原子动作」改为「整个对局的主体策略」，标签从有界截断改为真实自然终局）。"
    )

    section = f"""## 3b. S1 结果（与 S0 逐字相同的判据）

产物：`counterfactual/paired_continuation.S1horizon.json`、
`counterfactual/preference_repeatability.S1horizon.json`。

S1 只改了续弈预算（256→1024 转换、30→120 秒），窗口抽样、分支集合、续弈策略、
判据、随机基线构造方式全部不变，因此两张表可以直接比。

{table}

{verdict}

**必须写明的限制**：S1 的窗口数是 24（S0 是 48），对数 64（S0 是 122），
所以两个版本的区间宽度不同；但两者的判定都是「与各自的随机基线比」，
而随机基线是在同一个窗口集合内重排得到的，因此这个比较本身是自洽的。
"""

    # 写进 T18_03_report.md 的 S1 小节
    rpt = RUN / "reports" / "T18_03_report.md"
    text = io.open(rpt, encoding="utf-8").read()
    anchor = "## 4. 本轮发现的数据缺陷（待修）"
    marker = "## 3b. S1 结果（与 S0 逐字相同的判据）"
    if marker not in text:
        if anchor not in text:
            print("ERROR: report anchor missing")
            return 2
        text = text.replace(anchor, section + "\n---\n\n" + anchor, 1)
        io.open(rpt, "w", encoding="utf-8").write(text)
        print("T18_03_report.md patched")
    else:
        print("report already patched")

    # 写进独立的 S1 结果文件
    s1_doc = RUN / "reports" / "T18_03_S1_result.md"
    doc = io.open(s1_doc, encoding="utf-8").read()
    add = f"""

---

## 6. 实际结果（已跑完）

见 `counterfactual/preference_repeatability.S1horizon.json`。与 S0 并排：

{table}

{verdict}
"""
    if "## 6. 实际结果（已跑完）" not in doc:
        io.open(s1_doc, "w", encoding="utf-8").write(doc + add)
        print("T18_03_S1_result.md patched")

    print(json.dumps({
        "s0": {k: s0["pairLevel"][k] for k in ("pairs", "unanimousRate", "unanimousImprovement")},
        "s1": {k: s1["pairLevel"][k] for k in ("pairs", "unanimousRate", "unanimousImprovement")},
        "s1Verdict": s1["verdict"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
