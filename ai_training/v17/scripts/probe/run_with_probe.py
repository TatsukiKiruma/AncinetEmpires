"""V17/T17-02 探针启动器：在**不修改** v17/tools/train_v17.py 的前提下，记录
「每个 optimizer update 的 value head 梯度范数」。

用法（真实命令）：
  $env:V17_PROBE_OUT = 'v17/out/v17_20260926_r2/experiments/V0/value_head_grad_probe.jsonl'
  & $py v17/scripts/probe/run_with_probe.py v17/tools/train_v17.py <train_v17.py 的全部参数...>

原理（全部在外部，trainer 文件零改动）：
  * patch `nn.Linear.__init__` / `nn.Conv2d.__init__` 建立「参数张量 -> 模块角色」登记表：
      Linear(32,52)=val_dense1, Linear(1,32)=val_dense2, Linear(48,148)=pol_dense1,
      Linear(1,48)=pol_dense2, 其余 Linear/Conv2d = trunk（本模型只有这两种层）。
  * patch `torch.nn.utils.clip_grad_norm_`：trainer 每步在 optimizer.step 之前调用它
    （max_norm=5.0）。在**裁剪之前**读取各部分的梯度范数，因此记录的是 pre-clip 范数；
    同时把 trainer 实际使用的 max_norm 记下来。
  * patch `AdamW.step` 计数真实更新次数，并记录该步优化器里实际含哪些部分（冻结部分
    没有梯度/不在参数组里，直接可证）。
"""

from __future__ import annotations

import atexit
import json
import os
import runpy
import sys

PROBE_OUT = os.environ.get("V17_PROBE_OUT")

def _install() -> None:
    import torch
    import torch.nn as nn

    registry: dict[int, str] = {}  # id(param) -> role

    _orig_linear_init = nn.Linear.__init__

    def _linear_init(self, in_features, out_features, *a, **k):
        _orig_linear_init(self, in_features, out_features, *a, **k)
        # 形状必须按**实际数据集语义维度**判定：53 维语义时 pol_dense1 = [48, 169]，
        # 32 维语义时是 [48, 148]（96+sem+20）。两个都接受。
        o, i = int(out_features), int(in_features)
        role = {
            (32, 52): "value.val_dense1",
            (1, 32): "value.val_dense2",
            (1, 48): "policy.pol_dense2",
        }.get((o, i))
        if role is None:
            if o == 48 and i >= 100:
                role = "policy.pol_dense1"
            else:
                role = f"other.linear[{o},{i}]"
        for p in self.parameters():
            registry[id(p)] = role

    _orig_conv_init = nn.Conv2d.__init__

    def _conv_init(self, *a, **k):
        _orig_conv_init(self, *a, **k)
        for p in self.parameters():
            registry[id(p)] = "trunk.conv"

    nn.Linear.__init__ = _linear_init
    nn.Conv2d.__init__ = _conv_init

    rows: list[dict] = []
    state = {"steps": 0, "clipCalls": 0, "maxNorm": None}

    _orig_clip = torch.nn.utils.clip_grad_norm_

    def _part_norms(params):
        acc: dict[str, float] = {}
        counts: dict[str, int] = {}
        for p in params:
            if p.grad is None:
                continue
            role = registry.get(id(p), "unknown")
            part = role.split(".")[0] if "." in role else role
            acc[part] = acc.get(part, 0.0) + float(p.grad.detach().norm() ** 2)
            acc[role] = acc.get(role, 0.0) + float(p.grad.detach().norm() ** 2)
            counts[part] = counts.get(part, 0) + 1
        return ({k: (v ** 0.5) for k, v in acc.items()}, counts)

    def _clip(params, max_norm=5.0, *a, **k):
        params = list(params)
        if PROBE_OUT:
            norms, counts = _part_norms(params)
            state["clipCalls"] += 1
            state["maxNorm"] = float(max_norm)
            rows.append({
                "phase": "preClip",
                "clipCall": state["clipCalls"],
                "updateIndex": state["steps"],
                "maxNorm": float(max_norm),
                "gradNorms": norms,
                "paramsWithGrad": counts,
            })
        return _orig_clip(params, max_norm, *a, **k)

    torch.nn.utils.clip_grad_norm_ = _clip

    _orig_step = torch.optim.AdamW.step

    def _step(self, *a, **k):
        out = _orig_step(self, *a, **k)
        if PROBE_OUT:
            state["steps"] += 1
            roles = set()
            n_params = 0
            for group in self.param_groups:
                for p in group["params"]:
                    n_params += 1
                    roles.add(registry.get(id(p), "unknown").split(".")[0])
            rows.append({
                "phase": "optimizerStep",
                "updateIndex": state["steps"] - 1,
                "update": state["steps"],
                "lr": float(self.param_groups[0]["lr"]),
                "optimizerParamCount": n_params,
                "optimizerParts": sorted(roles),
            })
        return out

    torch.optim.AdamW.step = _step

    @atexit.register
    def _dump():
        if not PROBE_OUT:
            return
        os.makedirs(os.path.dirname(os.path.abspath(PROBE_OUT)), exist_ok=True)
        with open(PROBE_OUT, "w", encoding="utf-8") as fh:
            for row in rows:
                fh.write(json.dumps(row) + "\n")
        print(f"[probe] wrote {len(rows)} rows -> {PROBE_OUT}")


def main() -> int:
    argv = sys.argv[1:]
    if not argv:
        raise SystemExit("usage: run_with_probe.py <trainer.py> [trainer args...]")
    trainer = os.path.abspath(argv[0])
    _install()
    sys.argv = [trainer] + argv[1:]
    runpy.run_path(trainer, run_name="__main__")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
