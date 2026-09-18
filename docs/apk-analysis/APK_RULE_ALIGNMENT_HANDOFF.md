# APK 规则对齐与回放校验交接文档

本文用于新对话快速接手 `C:\code\AncinetEmpires` 的 APK 规则对齐工作。当前目标不是继续追 strict 诊断里的 3 个边缘分歧，而是把已确认的 APK 规则、回放工具和训练前置门槛稳定下来。

## 当前结论

- forced 主门槛：现有本地 112 个唯一 APK 回放 SHA 已全部通过，`112/112 passed`。
- strict 诊断：`109/112 passed`，剩余 3 个分歧。
- 覆盖目标：目标是 120 个唯一回放，目前仍缺 8 个唯一 SHA。这是样本不足，不是规则失败。
- 当前不应因为 strict 剩余 3 个分歧修改通用规则。
- 065/078 已按用户确认归因于对局附加 mod/运行态移动覆盖，不再作为项目通用移动规则问题追。
- 097 可视为疑似 mod/隐藏运行态清理/strict 信息不足，不再作为训练或 forced 主门槛阻塞项。

## forced 与 strict 的定义

- forced：以 APK 回放动作为事实来源。APK 记录说动作发生，项目就按 APK 动作推进，用来验证项目规则是否能跑完整个已抓到的 APK 动作前缀。当前 forced 已通过。
- strict：执行 APK 动作前，先要求项目自己的合法动作生成器也能生成该动作。它用于诊断项目规则、脚本状态、移动覆盖、占位状态和隐藏运行态差异。strict 失败不等于通用规则一定错误。

后续验收以 forced 为主，strict 只作为诊断工具。

## 剩余 strict 分歧处理

| 序号 | 文件 | 场景 | record | 分类 | 当前处理 |
| ---: | --- | --- | ---: | --- | --- |
| 065 | `game_get_20260704_132008_065.bin` | SR | 55 | `strict_move_reachability_gap` | 用户已确认该对局附加 mod；不改全局地形/移动规则 |
| 078 | `game_get_20260704_132050_078.bin` | SR | 51 | `strict_move_reachability_gap` | 用户已确认该对局附加 mod；不改全局地形/移动规则 |
| 097 | `game_get_20260704_132339_097.bin` | SD | 3008 | `strict_move_destination_occupied` | forced 已通过；疑似隐藏清理、mod 或 strict 信息不足；不改伤害公式和单位配置 |

097 已核实：

- strict 失败时 `(5,2)` 被 `u_374 soldier/P4 hp=6` 占用。
- record 2998 后 `u_374` 剩 6HP 是当前项目公式可解释的结果。
- `npm run apk:unit-report -- --json` 显示 `projectMismatches=[]`，APK data.bin 中 dragon/soldier 属性与项目一致。
- 不要按已经被反证的“dragon maxHP 与 APK data.bin 不一致”旧结论修改 `UNIT_CONFIGS`。

三条 strict 分歧的当前有效结论以上表为准。旧的独立调查文档未保留在当前工作区；不要根据旧 trace 推断修改通用规则。

## 当前样本与报告

当前核心报告：

```text
captures\mitm_replay\forced_unique_resume_after_exact_summary.md
captures\mitm_replay\apk_replay_coverage_report_forced_after_exact_candidate.md
captures\mitm_replay\strict_diff_summary_after_metadata_all112.md
captures\mitm_replay\strict_unique_after_metadata_061_080.json
captures\mitm_replay\strict_unique_after_metadata_081_100.json
```

forced 当前分片：

```text
forced_unique_resume_after_exact_001_020.json  20/20
forced_unique_resume_after_exact_021_040.json  20/20
forced_unique_resume_after_exact_041_060.json  20/20
forced_unique_resume_after_exact_061_080.json  20/20
forced_unique_resume_after_exact_081_100.json  20/20
forced_unique_resume_after_exact_101_120.json  12/12
```

覆盖审计结论：

```text
game_get 文件数：119
唯一 SHA：112
forced 全通过覆盖唯一 SHA：112
未覆盖唯一 SHA：0
距目标 120 仍缺：8
```

## 已通过门槛

最近一次已通过：

```powershell
npm run lint
npm test
npm run build
npm run apk:language-rule-report -- --check
npm run apk:skirmish-rule-report -- --check
npm run apk:unit-report -- --check
npm run apk:terrain-report -- --check
npm run apk:script-report -- --check
npm run apk:map-report -- --check
npm run apk:dex-report -- --check
npm run apk:training-report -- --check
```

`npm run apk:replay-coverage-report -- --root captures --require-force --check` 当前预期会非 0 退出，因为唯一回放数是 `112/120`。这不是规则失败。

## 关键已对齐规则

已修复并验证过的主要规则/展开差异：

1. APK 联盟数组来自远端配置，不使用项目默认 alliance preset。
2. 回放前缀从 `NEXT_TURN` 开始时会倒推初始当前玩家。
3. 墓碑生命周期按拥有者队伍回合开始递减。
4. 突击单位攻击后可原地 `post_attack_move` 结束二段移动。
5. 召唤骷髅初始为未移动、未行动。
6. 空城堡招募 pending 不锁其他单位；指挥官城堡堆叠 pending 仍锁。
7. 治疗没有“同回合只能被治疗一次”的限制。
8. 主动治疗可突破目标最大 HP；普通回合/地形回复仍按 maxHP clamp。
9. 治疗飞行单位限制已移除。
10. HEAL 回放中 `target == moveTo` 按“移动后治疗自己”展开。
11. 净化光环包含自身；非敌方清负面并治疗；任意阵营亡灵受伤。
12. 攻击光环可作用自己和友军，当前远端规则持续值为 0。
13. 攻击/光环后处理从只在 wait 触发改为更接近 APK 的 post-action 处理。
14. replay 动作数组定位改为结构化定位并要求 EOF 候选，修复 044 假失败。
15. `destroy_town` schema 更新为 `destroy_town:<unitId>[:<x>,<y>]`。

## 关键文件

```text
src\game\apk_replay.ts
src\game\engine.ts
src\game\rules.ts
src\game\terrain_rules.ts
src\game\apk_skirmish.ts
src\game\env.ts
tools\apk_game_get_report.ts
tools\apk_game_get_validate.ts
tools\apk_replay_coverage_report.ts
tools\apk_replay_diff_summary.ts
tools\apk_training_report.ts
```

## 推荐继续策略

### 不建议继续做的事

- 不要为 065/078 修改 terrain 63、terrain 17 或普通 soldier 全局移动规则。
- 不要为 097 修改 dragon/soldier 属性、`calculateDamage`、死亡清理或允许单位重叠移动。
- 不要把 strict 3 个分歧当作 forced 主门槛失败。
- 不要为了补 120 样本绕过 TLS 校验携带已捕获账号令牌访问外部服务。

### 建议继续做的事

1. 先保持 forced 112/112 通过。
2. 补齐 8 个新的唯一回放样本后，再跑覆盖审计。
3. 新样本优先跑 forced 分片；只有 forced 失败才进入规则修复流程。
4. 若 forced 失败，按失败分类或首个 record 派多个子 agent 并行核实。
5. strict 仅用于解释差异，不作为训练前置阻塞。

## 常用命令

forced 分片：

```powershell
npm run apk:game-get-validate -- --dir captures --unique-offset 0 --unique-limit 20 --allow-ambiguous-recruit --force-apk-replay-execution --out captures\mitm_replay\project_validation_report_forced_unique_001_020.md
npm run apk:game-get-validate -- --dir captures --unique-offset 20 --unique-limit 20 --allow-ambiguous-recruit --force-apk-replay-execution --out captures\mitm_replay\project_validation_report_forced_unique_021_040.md
npm run apk:game-get-validate -- --dir captures --unique-offset 40 --unique-limit 20 --allow-ambiguous-recruit --force-apk-replay-execution --out captures\mitm_replay\project_validation_report_forced_unique_041_060.md
npm run apk:game-get-validate -- --dir captures --unique-offset 60 --unique-limit 20 --allow-ambiguous-recruit --force-apk-replay-execution --out captures\mitm_replay\project_validation_report_forced_unique_061_080.md
npm run apk:game-get-validate -- --dir captures --unique-offset 80 --unique-limit 20 --allow-ambiguous-recruit --force-apk-replay-execution --out captures\mitm_replay\project_validation_report_forced_unique_081_100.md
npm run apk:game-get-validate -- --dir captures --unique-offset 100 --unique-limit 20 --allow-ambiguous-recruit --force-apk-replay-execution --out captures\mitm_replay\project_validation_report_forced_unique_101_120.md
```

覆盖审计：

```powershell
npm run apk:replay-coverage-report -- --root captures --require-force --check
```

strict 汇总：

```powershell
npm run apk:replay-diff-summary -- captures\mitm_replay\strict_unique_after_metadata_061_080.json captures\mitm_replay\strict_unique_after_metadata_081_100.json --out captures\mitm_replay\strict_diff_summary_current.md
```

## 新对话开场提示

```text
请阅读 C:\code\AncinetEmpires\docs\apk-analysis\APK_RULE_ALIGNMENT_HANDOFF.md，然后继续 APK 规则对齐。

当前状态：
1. forced 主门槛现有 112 个唯一回放全部通过。
2. 目标 120 个唯一回放还缺 8 个样本。
3. strict 剩 065/078/097 三个分歧；065/078 已确认为 mod 对局，097 不应改单位配置或伤害公式。
4. 后续只在新 forced 样本失败时继续修通用规则。
5. 开始前先运行 git status --short，注意不要回滚用户改动。
```
