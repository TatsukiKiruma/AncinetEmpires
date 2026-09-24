# AncientEmpires V13 审查与Agent执行包

基线：`path-b-spatial-ai`，`b8c0c24312a551a3cf20802f820e3f1edf798395`。审查日期：2026-09-24；交付前已再次确认远端HEAD未改变。

## 使用顺序

先读 **V13_REVIEW.md** 了解当前训练状态、源码缺陷与历史结论的更正。再把 **AGENT_START.txt** 和 **V13_AGENT_TASKBOOK.md** 一起交给能访问本地仓库的执行agent；保留整个包，方便其核对 **evidence_manifest.json**。

## 包内文件

| 文件 | 用途 |
|---|---|
| V13_REVIEW.md | 当前训练、弱点、证据边界与路线建议 |
| V13_AGENT_TASKBOOK.md | 11项执行任务、依赖、预算、验收、停止条件与产物 |
| AGENT_START.txt | 可直接交给执行agent的启动指令 |
| evidence_manifest.json | 固定提交的源码/结果链接与已读取模型Git blob |
| review_reproductions.py | loss账本与value mask的隔离表达式复现 |
| review_reproductions.json | 本次隔离复现的实际输出 |
| checksums.json | 包内交付文件的SHA-256；不包含自身，避免自引用 |

## 验证范围

本次是GitHub连接器读取源码/工件后的审查，并运行了隔离表达式复现。容器仓库拉取因DNS失败，**没有重跑仓库测试、游戏比赛或完整训练，没有修改远端仓库**。不要把附带脚本的通过理解为真实仓库回归已通过。

复现脚本需要Python和PyTorch。执行：

```bash
python review_reproductions.py --out local_reproduction_result.json
```

它不导入项目、不读取训练数据、不训练模型，且不修改项目文件。新生成的本地结果仅用于比较表达式行为。

本包的“V13”是建议工作编号。任务书中的新路径、schema和新增CLI参数是待执行agent实现的设计，不是声称它们已存在于冻结提交。
