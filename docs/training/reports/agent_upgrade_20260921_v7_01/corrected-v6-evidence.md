# V6 历史证据核验与更正报告 (Corrected V6 Evidence)

- **审查基准提交**：`55177b8ea9459d1b30a83e44eb412fb2f112a4c4`
- **当前 HEAD 提交**：`8274cd8d9372e64fc2da9431755fa5a58d1f02df`
- **分支**：`path-b-spatial-ai`
- **审计日期**：2026-09-21

---

## 1. 历史对战与指标勘误

1. **40 场对战胜负记录**：
   - 历史 Markdown 战报在 BC Duel 后手对局中因 101 回合未终局误填胜者为 Heuristic。
   - 实际记录：39 次自然败，1 次截断（`MAX_TURNS_TRUNCATION`），0 次自然胜。
   - 40 次对战中，各模型被选出的指挥官重招募动作为 0 次。统计未验证动作执行成功，且未能证明 40 次指挥官阵亡后均存在合法重招募机会。

2. **重招募成功率统计勘误**：
   - 旧代码在 `rehireOpportunities === 0` 时固定返回 `100.0%`。
   - 更正：当机会数为 0 时，成功率必须记为 `null`，不得虚构 100%。

3. **历史数据审计勘误**：
   - `runCoverageAudit()` 旧实现直接写入写死的数值（2500、2280、1142、618），并未对历史 2500 局文件进行真实扫描。
   - 更正：已移除硬编码常数，未实扫字段统一标记为 `null`，仅记录真实存在的文件路径与字节数。

4. **课程生成缺陷与非法动作替换勘误**：
   - 旧脚本删除 P0 指挥官后，`units[0]` 变为敌方 P1 指挥官 `u2`。
   - 场景 C 将敌方指挥官移至己方城堡；场景 F 要求 P0 指挥敌方指挥官攻击敌方小兵；场景 G 要求指挥敌方指挥官攻击自身。
   - `addSample()` 在动作非法（`targetIdx === -1`）时静默回退为 `legalActions[0]`，污染了监督数据。
   - 更正：非法动作必须被拒绝隔离（Quarantine），严禁静默替换为第一个合法动作。

5. **4 块 ResNet 跨语言执行勘误**：
   - Python 模型在 `num_blocks=4` 时正确导出了 4 个残差块（`res1`, `res2`, `res3`, `res4`）。
   - TypeScript `spatial_conv_net.ts` 加载器旧版将 `architectureId` 硬编码为 `spatial_resnet_32ch_2res`，并未解析后两个块，`predict` 仅执行前两块。
   - 更正：已升级 TypeScript 加载器与推理器，完整支持 4 块结构并保持跨语言浮点一致性。

6. **最佳检查点被最后轮次覆盖勘误**：
   - `python/train_spatial_resnet.py` 旧版在 `epoch == args.epochs` 时必定导出模型覆盖 `--out-model`，导致若末轮过拟合或退化，最佳检查点丢失。
   - 更正：已将最佳模型（`--out-model`）与末轮模型（`--out-last-model`）分离保存。
