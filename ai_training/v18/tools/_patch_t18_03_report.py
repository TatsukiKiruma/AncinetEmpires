"""一次性补丁：把 T18-03 报告里「校准集不达标」一节更新为「修好后已达标」。

中文：edit 工具在这个文件上反复返回 ReplaceFileW EIO（Windows 文件替换失败），
因此用一个只做字面替换的脚本完成同一处修改，避免重写整个报告。
脚本可重复执行（anchor 不存在时报错而不是静默跳过）。
"""
import io
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "v18" / "out" / "run_20260927_v18_01" / "reports" / "T18_03_report.md"

OLD = """### 2.4 结论：价值头**不得**接入搜索

`value_ranking_gate.json#verdict.searchAllowed = false`。
理由有两条，各自独立成立：

1. 排序判据未通过（四个价值头全部 Wilson 下界 < 0.5）；
2. 校准集不达标：全库只有 **20 个**有自然终局结果的 family（门槛 ≥50）。
   （`val_student` / `val_teacher` 面板在当前编码产物里没有携带 `naturalTerminal` 标记，
   这本身也是需要修的数据缺陷，见 §4。）"""

NEW = """### 2.4 结论：价值头**不得**接入搜索

`value_ranking_gate.json#verdict.searchAllowed = false`。
排序判据未通过（四个价值头全部 Wilson 下界 < 0.5），这一条独立成立。

### 2.4b 校准集：修好数据缺陷后**已达标**

第一版盘点的结果是「只有 20 个有自然终局的 family」，原因是
**编码后的行不携带 `naturalTerminal`**，而 `build_panel_labels` 直接读了这个不存在的字段，
把学生/教师面板全部判成 `false`。采集器其实只在自然终局时写 `valueTarget`
（`valueTarget = !natural ? null : ...`），所以「`valueTarget` 非空」才是正确判据。

修正后（`build_v18_val_manifest.py` 内已注明），并补采了一个专门的价值校准面板
（H0 自走、val 命名空间 rootIndex 20..23，20 个新 root）：

| 面板 | 行数 | 有自然终局的行 | 有自然终局的 family | 其中两类结果都有 |
|---|---:|---:|---:|---:|
| `val_dual_teacher`（H0） | 5,729 | 5,729 | 20 | 20 |
| `val_student`（冻结学生） | 2,249 | 2,118 | 10 | 3 |
| `val_teacher`（B100-Q） | 1,020 | 1,020 | 5 | 2 |
| `val_calib`（V18 新增） | 4,472 | 4,472 | 20 | 20 |
| **合计** | 13,470 | 13,339 | **55** | 45 |

=> **「校准 family >= 50」这一条现在通过**（55 个 family，两类结果都存在，
其中 45 个 family 内部同时出现胜与负）。
但**排序门仍然未通过**，所以搜索依旧不放行 —— 两道门必须同时过。"""


def main() -> int:
    text = io.open(TARGET, encoding="utf-8").read()
    if NEW in text:
        print("already patched")
        return 0
    if OLD not in text:
        print("ERROR: anchor not found", file=sys.stderr)
        return 2
    io.open(TARGET, "w", encoding="utf-8").write(text.replace(OLD, NEW))
    print("patched")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
