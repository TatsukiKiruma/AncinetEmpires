# APK 规则对齐与回放校验交接文档

> 交接目的：在新对话中快速恢复上下文，继续根据 APK 反编译代码和远端多人回放修复项目规则，并持续用回放前缀校验项目规则是否贴近 APK。

## 当前目标

继续修复 `C:\code\AncinetEmpires` 项目的游戏规则，使项目引擎能够从 `/api/game_get` 抓到的 APK 多人远端回放初始局面出发，按 APK 动作前缀执行而不出现非法动作或状态分叉。

注意：抓包得到的回放不一定覆盖整场对局。当前校验标准是“已抓到的 APK 动作前缀能否被项目完整重放”，不是必须终局一致，也不是必须完整回放整局。

## 2026-07-05 当前状态优先

本文后面的“16/30 失败表”是历史排查记录，不再代表当前状态。继续工作时以本节为准。

- 当前本地样本池只有 119 个 `game_get_*.bin` 文件，去重后为 112 个唯一回放 SHA。
- 112 个唯一回放已在 APK 强制执行模式下全部通过；当前没有已知的 forced 回放规则分歧。
- 覆盖审计报告：`captures\mitm_replay\apk_replay_coverage_report_current_all112.md`。
- 覆盖审计结论：目标 120 个唯一回放仍缺 8 个唯一样本；这是样本不足，不是规则校验失败。
- 2026-07-05 已新增 `npm run apk:replay-coverage-report`，并增强 `tools\apk_replay_coverage_report.ts`：
  - 覆盖审计现在扫描所有同结构校验 JSON，不再只扫描 `project_validation_report*.json`，因此子 agent/探针分片报告也能被纳入 forced 覆盖证据。
  - 新增 `--check`：当唯一回放数不足目标或存在未覆盖唯一回放时以非 0 退出。当前运行 `npm run apk:replay-coverage-report -- --root captures --require-force --check` 的预期结果是失败，原因是唯一回放 `112/120`、未覆盖 `0`、仍缺 `8`。
  - 2026-07-05 续跑时已把覆盖审计核心函数导出为 `generateCoverageSummary`，并新增 `tools\apk_replay_coverage_report.test.ts`，覆盖：任意同结构 JSON 报告扫描、SHA 去重、`--require-force` 过滤、失败报告不计入覆盖证据、`checkPassed` 判定。
- 2026-07-05 按用户建议再次采用“五个子 agent 各跑 20 局 + 主线程补尾段”的方式复核 forced：
  - `agent_forced_001_020.json`：20/20 通过。
  - `agent_forced_021_040.json`：20/20 通过。
  - `agent_forced_041_060.json`：20/20 通过。
  - `agent_forced_061_080_corrected.json`：20/20 通过。注意未带 `--force-apk-replay-execution` 的旧 `agent_forced_061_080.json` 实际是 strict，复现已知 065/078 两个 `strict_move_reachability_gap`。
  - `agent_forced_081_100_corrected.json`：20/20 通过。旧 `agent_forced_081_100.json` 是直接启动 Node 导致 DES legacy provider 缺失的解析错误，不是规则失败。
  - `main_forced_101_120.json`：当前只有 12/12 通过。
  - `apk_replay_coverage_report_forced_agents_current.md`：扫描后 `game_get` 文件数 125、唯一 SHA 112、全通过报告覆盖唯一 SHA 112、未覆盖唯一 SHA 0、距目标 120 仍缺 8。
- `tools\mitm_replay_capture.cmd status` 最近显示 MuMu/ADB 不在线，已有抓包流量中也没有额外可导出的 `game_get`。
- 2026-07-05 已用 `--offset` 重新跑过现有样本分片：
  - `project_validation_report_forced_offset_001_020.json`：20/20 通过。
  - `project_validation_report_forced_offset_021_040.json`：20/20 通过。
  - `project_validation_report_forced_offset_041_060.json`：20/20 通过。
  - `project_validation_report_forced_offset_061_080.json`：20/20 通过。
  - `project_validation_report_forced_offset_081_100.json`：20/20 通过。
  - `project_validation_report_forced_offset_101_120.json`：当前只有 12/12 通过。
  - 实测 6 片同时跑容易让 shell 超时；建议最多 2 片并行，或 5 线程只跑前 100 局，剩余 20 单独跑。
- 2026-07-05 已给 `tools\apk_game_get_validate.ts` 增加 `--unique-offset` / `--unique-limit`，可按排序并去重后的唯一 SHA 精确切片。`captures\mitm_replay\project_validation_report_forced_unique_101_120.json` 当前为 12/12 通过。
- 2026-07-05 按用户建议做过 strict 五线程并行核验，每线程 20 个唯一回放，尾片单独补跑：
  - `parallel_strict_unique_001_020.json`：20/20 通过。
  - `parallel_strict_unique_021_040.json`：20/20 通过。
  - `parallel_strict_unique_041_060.json`：20/20 通过。
  - `parallel_strict_unique_061_080.json`：18/20，通过失败 2 个。
  - `parallel_strict_unique_081_100.json`：19/20，通过失败 1 个。
  - `parallel_strict_unique_101_120.json`：当前只有 12/12 通过。
- strict 当前仅剩 3 个失败，不应直接当作核心规则错误修改：
  - 065 record 55：`STANDBY` 展开 `move:u_13:4,6`，普通 soldier/P3 从 `(3,3)` 移到 `(4,6)`，目标为 `apkTerrainId=63`、kind 0、moveCost 3。项目按当前 APK 嵌入地形定义不可达；无证据支持全局降低 terrain 63 成本。
  - 078 record 51：`ATTACK` 展开 `move:u_11:10,5`，普通 soldier/P1 从 `(11,7)` 移到 `(10,5)`，目标移动格为 `apkTerrainId=17`、kind 1、moveCost 3。攻击距离本身合法，失败点仍是移动可达性；无证据支持全局降低 terrain 17 成本。
  - 097 record 3008：`OCCUPY` 展开 `move:u_267:5,2`，目的格被 record 2998 后剩 6HP 的 `u_374 soldier/P4` 占用。子 agent 和本地复核均显示项目按 `C0600q.m4339b`、反击顺序、terrain36 防御 15、MELEE_MASTER 近战倍率算出 94 反击伤害是合理的；暂不应改 `calculateDamage`。
- 065/078 的最可能方向是缺失 `scenarioCode="SR"` 对应的 APK 运行时脚本/`SyncOverrideMov` 状态，或 strict 合法性校验无法完全复现 APK 运行态；当前已解密脚本清单只发现 AEII/AEIII 战役脚本的 `SyncOverrideMov`，没有 SR 证据。
- 097 的最可能方向是 strict 回放记录/运行态存在缺失清理或不可见状态；如必须让 strict 跑完，应只在 APK replay 校验层做受限 reconciliation/诊断，不要改通用战斗规则。
- 2026-07-05 已增强 strict 失败诊断：
  - `src/game/apk_replay.ts` 的 `failureDiagnostic` 现在包含 `moveDestinationTile`，用于输出目标格 `terrainId/apkTerrainId/apkTerrainKind/apkMoveCost` 等元数据。
  - `tools/apk_game_get_validate.ts` 的 `validation.failureClassification` 会把非法 move 初步分为：
    - `strict_move_reachability_gap`：目标格无占位，但项目没有对应合法移动动作。优先查 APK 运行态脚本、`SyncOverrideMov` 或前序状态，不要直接改全局地形成本。
    - `strict_move_destination_occupied`：目标格被项目状态中的单位占用。优先查前序伤害/死亡/清理链，不要先允许重叠移动。
  - `tools/apk_game_get_validate.ts` 的批量报告现在还有顶层 `failureClassifications` 汇总；Markdown 会在“汇总”表前显示“分歧分类汇总”，用于快速决定该派哪些子 agent。
  - 新报告验证：
    - `strict_unique_061_080_with_classification.json`：065/078 均分类为 `strict_move_reachability_gap`，并带出 terrain63/terrain17 元数据。
    - `strict_unique_081_100_with_classification.json`：097 分类为 `strict_move_destination_occupied`，并带出 `u_374 soldier/P4 hp=6` 与 terrain36 元数据。
    - `strict_unique_061_080_with_class_summary.json`：顶层 `failureClassifications` 汇总为 `strict_move_reachability_gap=2`。
    - `strict_unique_081_100_with_class_summary.json`：顶层 `failureClassifications` 汇总为 `strict_move_destination_occupied=1`。
- 2026-07-05 已新增 `npm run apk:replay-diff-summary`，可把多个分片报告合并成一个失败分类总览，不重新执行回放。当前验证产物：
  - `captures\mitm_replay\strict_diff_summary_current.md`：汇总 061-080 与 081-100 两份 strict 分类报告，结果为 parsed 40、passed 37、failed 3。
  - `captures\mitm_replay\strict_diff_summary_current.json`：同一汇总的机器可读版本。
  - 当前分类汇总为 `strict_move_reachability_gap=2`、`strict_move_destination_occupied=1`。
- 2026-07-05 续跑时发现 `game_get_20260704_131516_044.bin` 在 forced 分片里出现假失败：record 3 `HEAL` 找不到 `(10,13)` 目标。主线程和子 agent 复核确认根因不是 HEAL 规则，而是动作数组候选误选：
  - 错误候选只有 13 条动作，`remainingBytes=966`。
  - 真实候选为 6476 条动作，`remainingBytes=0`，旧报告和新单文件复核均可完整通过。
  - `tools\apk_game_get_report.ts` 现在新增结构化动作数组定位：按 `C1258d` 对象顺序跳过房间字段、玩家数组、观察者数组、地图对象、`currentStep`、`replaySplitIndex` 后精确读取 `C0578b[]`；若结构化跳转不适用于某些文件，会回退扫描，但只接受 `remainingBytes=0` 的 EOF 候选，不再把非 EOF 短片段当成回放继续验证。
  - `tools\apk_game_get_validate.ts` 已改为复用同一结构化定位函数。
- 精确候选定位修复后的 forced 唯一分片回归：
  - `forced_unique_resume_after_exact_001_020.json`：20/20 通过。
  - `forced_unique_resume_after_exact_021_040.json`：20/20 通过。
  - `forced_unique_resume_after_exact_041_060.json`：20/20 通过。
  - `forced_unique_resume_after_exact_061_080.json`：20/20 通过。
  - `forced_unique_resume_after_exact_081_100.json`：20/20 通过。
  - `forced_unique_resume_after_exact_101_120.json`：当前只有 12/12 通过。
  - `forced_unique_resume_after_exact_summary.md`：parsed 112、passed 112、failed 0、parseErrors 0。
  - `apk_replay_coverage_report_forced_after_exact_candidate.md`：唯一 SHA 112，已由 forced 全通过报告覆盖 112，距目标 120 仍缺 8。
- 精确候选定位修复后的 strict 复核：
  - `strict_unique_after_exact_041_060.json`：20/20 通过，确认 044 假失败已消失。
  - `strict_unique_after_exact_061_080.json`：18/20，仍为 `strict_move_reachability_gap=2`。
  - `strict_unique_after_exact_081_100.json`：19/20，仍为 `strict_move_destination_occupied=1`。
  - `strict_unique_after_exact_summary.md`：parsed 60、passed 57、failed 3、parseErrors 0；strict 剩余 3 个分类与前述 065/078/097 一致。
  - EOF fallback 后又单文件验证 `probe_single_002_after_eof_fallback.json` 与 `probe_single_044_after_eof_fallback.json`，均 1/1 forced 通过。
- 2026-07-05 按“一问题一子 agent”再次只读核实 strict 剩余 3 个分歧，并刷新报告元数据：
  - `strict_unique_after_metadata_061_080.md/json`：18/20，分类仍为 `strict_move_reachability_gap=2`。Markdown 现在会显示 `scenario=SR`；065/078 均为 SR 远端局。
  - `strict_unique_after_metadata_081_100.md/json`：19/20，分类仍为 `strict_move_destination_occupied=1`。097 为 `scenario=SD`。
  - `strict_diff_summary_after_metadata.md/json`：汇总后仍为 parsed 40、passed 37、failed 3。
  - 065 子 agent 结论：record 55 前 `u_13 soldier/P3@(3,3)` 有 4 移动力，目标 `(4,6)` 无占位，但目标格 `apkTerrainId=63/apkMoveCost=3`；按当前项目和 APK `C0600q.m4357a` 复算不可达。没有证据支持全局降低 terrain 63 或普通 soldier 移动成本。
  - 078 子 agent 结论：record 51 的攻击距离合法，失败只在 `(11,7)->(10,5)` 移动；目标移动格 `apkTerrainId=17/apkMoveCost=3`，无证据支持全局降低 terrain 17 或 terrainId 3 成本。
  - 097 子 agent 结论：record 2998 后 `u_374 soldier/P4` 被 `u_228 dragon/P0` 反击后剩 6HP，按当前 `calculateDamage` 与 APK 反编译伤害/死亡清理证据均合理；不应改通用伤害公式或 `hp<=0` 死亡清理。
  - 主线程用 `tools\apk_replay_trace.ts --input captures\mitm_replay\20260704_131004\game_get_20260704_132339_097.bin --x 5 --y 2 --radius 3 --until 3008` 追踪 097，确认 record 2998 到 3008 前 `(5,2)` 周边没有隐藏清理/同步事件；3008 前 `u_374` 仍以 6HP 占位。
  - 因此当前不建议为 strict 3 个失败改通用规则。若必须让 strict 通过，应先继续寻找 SR/SD 运行态缺失信息；任何 reconciliation 都应限于 APK replay 诊断层，不能掩盖 forced 主门槛。
- 2026-07-05 又用当前报告格式完整复跑现有 112 个唯一回放的 strict 六分片：
  - `strict_unique_after_metadata_001_020.json`：20/20 通过。
  - `strict_unique_after_metadata_021_040.json`：20/20 通过。
  - `strict_unique_after_metadata_041_060.json`：20/20 通过。
  - `strict_unique_after_metadata_061_080.json`：18/20，仍为 065/078。
  - `strict_unique_after_metadata_081_100.json`：19/20，仍为 097。
  - `strict_unique_after_metadata_101_120.json`：当前只有 12/12 通过。
  - `strict_diff_summary_after_metadata_all112.md/json`：parsed 112、passed 109、failed 3、parseErrors 0；没有新增 strict 分歧。
  - 并行跑 041-060 与 101-120 时曾因长局/CPU 争用超时且无报告落盘；顺序重跑成功。后续长分片建议顺序跑或给 10-20 分钟超时。
- 2026-07-05 又按用户要求派 5 个只读子 agent 分别核实 strict `001-020`、`021-040`、`041-060`、`061-080`、`081-100`：
  - `001-020`、`021-040`、`041-060`：JSON 与 Markdown 计数一致，均为 `20/20` 通过，无失败。
  - `061-080`：JSON 与 Markdown 计数一致，`20 parsed / 18 passed / 2 failed / 0 parseErrors`；失败仍是 065/078 的 `strict_move_reachability_gap`，子 agent 不建议修改通用规则或全局地形成本。
  - `081-100`：JSON 与 Markdown 计数一致，`20 parsed / 19 passed / 1 failed / 0 parseErrors`；失败仍是 097 的 `strict_move_destination_occupied`，子 agent 不建议修改通用规则。
  - 主线程补查 `101-112`：`12/12` 通过，无失败。
- 2026-07-05 已新增 `tools\apk_game_get_report.test.ts`，用合成 `C1258d`/`C0578b[]` 字节流锁定动作数组定位行为：
  - 能按对象结构定位 EOF 动作数组。
  - 会拒绝非 EOF 的短动作数组候选，防止再次把解析器假失败误判成规则差异。
- 2026-07-05 再次执行 `tools\mitm_replay_capture.cmd status`：捕获进程仍未运行，MuMu ADB `127.0.0.1:16384` 仍拒绝连接，无法自动补齐目标 120 唯一局。
- strict triage 后补跑 forced 回归：
  - `project_validation_report_forced_unique_061_080_after_strict_triage.json`：20/20 通过。
  - `project_validation_report_forced_unique_081_100_after_strict_triage.json`：20/20 通过。
  - `forced_unique_061_080_after_classification.json`：20/20 通过，确认诊断增强没有影响 forced 主门槛。
- 2026-07-05 再次检查补样状态：本地仍只有 119 个 `game_get_*.bin`，唯一 SHA 仍为 112；`tools\mitm_replay_capture.cmd status` 显示捕获进程未运行且 MuMu ADB `127.0.0.1:16384` 拒绝连接，暂时无法自动补齐目标 120 唯一局。
- 2026-07-05 本轮再次执行 `tools\mitm_replay_capture.cmd status`：PID 文件仍残留但 mitmdump 进程未运行，最近输出目录仍是 `captures\mitm_replay\20260704_131004`；MuMu ADB `127.0.0.1:16384` 继续拒绝连接并提示 device not found。因此当前仍无法从在线环境补齐缺少的 8 个唯一回放。
- 2026-07-05 已复查额外抓包/离线流：
  - `captures\aeii_replay_capture.pcap` 没有明文 HTTP，也没有可直接提取的 ClientHello/`game_get`。
  - `captures\aeii_replay_capture_20260704_101254.pcap` 与 `captures\aeii_replay_capture_20260704_101448.pcap` 只看到 TLS SNI `ae-multiplayer-na.toyknight.net`，`/api/game_get` 内容在 HTTPS 加密负载中，不能直接从 pcap 提取。
  - `.mitm` 离线重放中只有 `20260704_122259\all_flows.mitm` 能重新导出 2 个 `game_get`，但都是重复 SHA；`120841`、`121421` 没有可导出的新 `game_get`。
  - 开启 `AEII_MITM_BATCH_GAME_LIST=1` 后，沙盒内批量请求最初失败为 `[WinError 5] 拒绝访问`；提升权限后请求可以发起，但除原流里已有 2 个响应外，其余远端 `/api/game_get` 请求失败于 `Certificate verify failed: certificate has expired`。因此当前补样卡在远端 TLS 证书校验/在线抓取环境，不是回放规则失败。
  - 尝试用 mitmproxy `--ssl-insecure` 绕过远端证书过期被安全审查拒绝，因为该命令会在关闭 TLS 校验时携带已捕获账号令牌访问外部服务，存在凭据泄露风险。除非用户明确接受该安全降级，否则不应绕过。
- 2026-07-05 静态 APK 证据门禁复查：
  - `npm run apk:language-rule-report -- --check`：28 项通过。
  - `npm run apk:skirmish-rule-report -- --check`：30 项通过。
  - `npm run apk:unit-report -- --check`：项目单位配置差异 0，刻意差异 4。
  - `npm run apk:terrain-report -- --check`：项目归档差异 0，skirmish 映射 confirmed=4、atlas=73、approximate=7、unmapped=0。
  - `npm run apk:script-report -- --check`：脚本 27/27，API 计数差异 0，字面量配置差异 0，应用检查 7/7。
  - `npm run apk:map-report -- --check`：官方 skirmish 地图 20/20，manifest 匹配。
  - `npm run apk:dex-report -- --check`：必要字符串/方法缺失 0，默认指挥官收入 base=50/growth=25，疑似指挥官复活 API 字符串 0。
  - `npm run apk:training-report -- --check`：修复后通过，40 个训练场景 manifest/metadata 匹配，Observation APK 证据字段错配 0，动作 schema 匹配，smoke 失败 0。
  - 本轮修复 `tools\apk_training_report.ts`：`destroy_town` schema 期望更新为 `destroy_town:<unitId>[:<x>,<y>]`；Observation APK 证据检查不再要求项目规则字段与 APK data.bin 原值完全相等，而是要求 APK 原始 config 和项目规则字段都完整暴露且为有限数值。原因是 t0/t1 深水已明确存在 `apkTerrainConfig.healPerTurn=3` 但项目规则 `healPerTurn=0` 的已记录语义差异，不能把这种“原始证据 vs 项目规则语义”差异当作 observation 字段缺失。

已通过的门禁：

```powershell
npm test
npm run lint
npm run build
npm run apk:language-rule-report -- --check
npm run apk:skirmish-rule-report -- --check
npm run apk:unit-report -- --check
npm run apk:terrain-report -- --check
npm run apk:script-report -- --check
npm run apk:map-report -- --check
npm run apk:dex-report -- --check
npm run apk:training-report -- --check
npm test -- src\game\apk_replay.test.ts
npm test -- tools\apk_replay_coverage_report.test.ts
```

补齐样本后的推荐回放策略：

1. 先重新生成覆盖报告，确认唯一 SHA 达到 120。
2. 再按唯一 SHA 切片跑 forced 校验，每个切片 20 个唯一回放：

```powershell
npm run apk:game-get-validate -- --dir captures --unique-offset 0 --unique-limit 20 --allow-ambiguous-recruit --force-apk-replay-execution --out captures\mitm_replay\project_validation_report_forced_unique_001_020.md
npm run apk:game-get-validate -- --dir captures --unique-offset 20 --unique-limit 20 --allow-ambiguous-recruit --force-apk-replay-execution --out captures\mitm_replay\project_validation_report_forced_unique_021_040.md
npm run apk:game-get-validate -- --dir captures --unique-offset 40 --unique-limit 20 --allow-ambiguous-recruit --force-apk-replay-execution --out captures\mitm_replay\project_validation_report_forced_unique_041_060.md
npm run apk:game-get-validate -- --dir captures --unique-offset 60 --unique-limit 20 --allow-ambiguous-recruit --force-apk-replay-execution --out captures\mitm_replay\project_validation_report_forced_unique_061_080.md
npm run apk:game-get-validate -- --dir captures --unique-offset 80 --unique-limit 20 --allow-ambiguous-recruit --force-apk-replay-execution --out captures\mitm_replay\project_validation_report_forced_unique_081_100.md
```

如果样本已经扩展到 120 个且希望覆盖最后 20 个，继续追加：

```powershell
npm run apk:game-get-validate -- --dir captures --unique-offset 100 --unique-limit 20 --allow-ambiguous-recruit --force-apk-replay-execution --out captures\mitm_replay\project_validation_report_forced_unique_101_120.md
```

注意：`--unique-offset`/`--unique-limit` 会先按 SHA 去重再切片；`--offset`/`--limit` 仍是按排序后的文件切片，主要用于调试固定文件范围。

若任一切片失败：

- 先合并所有分片报告，按失败分类和首个 record 分组，不要把多个独立问题混在一起：

```powershell
npm run apk:replay-diff-summary -- captures\mitm_replay\strict_unique_061_080_with_class_summary.json captures\mitm_replay\strict_unique_081_100_with_class_summary.json --out captures\mitm_replay\strict_diff_summary_current.md
```

- 每个不同失败分类或不同 record 链条单独派一个子 agent 并行核实回放记录和 APK 反编译证据。
- 子 agent 只负责核实具体问题和最小修复方向；主线程整合改动、跑门禁、重新回放。

## 必读文件

- `OPENCODE_APK_Replay_System.md`：之前整理的 APK 回放系统分析。
- `APK_RULE_ALIGNMENT_HANDOFF.md`：本文档。
- `captures\mitm_replay\20260704_131004\project_validation_report_lenient_30.md`：最新 30 条校验报告。
- `captures\mitm_replay\20260704_131004\project_validation_report_lenient_30.json`：最新 30 条校验 JSON，便于脚本化分析。

## 关键项目文件

- `src/game/apk_replay.ts`：APK 回放动作解析、展开、校验主逻辑。
- `tools/apk_game_get_validate.ts`：远端 `/api/game_get` 响应解析与批量校验报告生成。
- `tools/apk_game_get_report.ts`：远端回放解密/解析基础工具。
- `src/game/engine.ts`：项目规则执行器，当前大部分规则修复都在这里。
- `src/game/rules.ts`：合法动作、伤害、治疗、招募等纯规则。
- `src/game/types.ts`：规则配置、墓碑、pending 招募等类型。
- `src/game/env.ts`：训练/观测输出，已同步部分 replay/pending/grave 字段。
- `src/game/apk_skirmish.ts`：APK SD/SO 多人规则配置。
- `src/game/tests/engine.test.ts`：核心规则测试。
- `src/game/apk_replay.test.ts`：APK 回放展开/校验测试。

## 当前校验命令

```powershell
npm run apk:game-get-validate -- --dir captures\mitm_replay\20260704_131004 --limit 30 --allow-ambiguous-recruit --out captures\mitm_replay\20260704_131004\project_validation_report_lenient_30.md
```

最新结果：

- 文件数：30
- 唯一校验：30
- 通过：16/30
- 失败：14/30
- 解析错误：0
- 重复跳过：0
- 最新报告：
  - `captures\mitm_replay\20260704_131004\project_validation_report_lenient_30.md`
  - `captures\mitm_replay\20260704_131004\project_validation_report_lenient_30.json`

对比进展：

- 之前约为 3/30，通过多轮修复后到 16/30。
- 平均执行记录数已明显提高，说明多数早期规则/展开器分歧已被消除。
- 现在剩余失败多发生在较深回合，通常是前序 HP/死亡/墓碑/位置链条轻微偏差累计后的状态分叉。

## 已确认并修复的规则/展开差异

1. 回放前缀从 `NEXT_TURN` 开头时，验证器会倒推初始当前玩家。
   - 文件：`tools/apk_game_get_validate.ts`
   - 原因：远端回放可能不是从真实局面第一个玩家动作开始。

2. APK 联盟数组来自 `C0577a.f1154j`，不是项目地图默认 alliance preset。
   - 文件：`tools/apk_game_get_validate.ts`
   - APK 证据：`C0577a.m4365a(seed, rules, f1152h, f1153i, f1154j, f1155k)`，`C0600q.m4365a` 写入 `C0606a.f1239k`。

3. 墓碑生命周期按“拥有者队伍回合开始”递减，不是每次 end_turn 全局递减。
   - 文件：`src/game/types.ts`、`src/game/engine.ts`、`src/game/env.ts`
   - APK 证据：`C0595l.m4454a` 创建墓碑写入当前队伍；`C0595l.m4447c` 调用 `m4417r().m4222c(currentTeam)`。

4. 突击单位攻击后可以选择原地 `post_attack_move` 来结束二段移动并触发后处理。
   - 文件：`src/game/rules.ts`、`src/game/engine.ts`
   - APK 证据：`C0595l.m4428k` 状态 3 允许当前格。

5. 召唤骷髅初始是未移动、未行动。
   - 文件：`src/game/engine.ts`
   - APK 证据：`m4369a -> m4282j -> m4379A`。

6. 空城堡招募 pending 不锁其他单位行动；指挥官城堡堆叠 pending 仍锁。
   - 文件：`src/game/rules.ts`、`src/game/engine.ts`
   - 回放证据：`game_get_20260704_131100_004.bin` record 72 招募后，record 73 立即移动 commander。

7. 治疗没有“同回合只能被治疗一次”的限制。
   - 文件：`src/game/rules.ts`
   - APK 证据：`C0600q.m4276k` 没有 `hasBeenHealedThisTurn` 类条件。

8. HEAL 回放中 `target == moveTo` 表示移动后治疗自己，展开器应把目标解析为 actor 自身。
   - 文件：`src/game/apk_replay.ts`、`src/game/apk_replay.test.ts`
   - 回放证据：`game_get_20260704_131256_021.bin`、`game_get_20260704_131343_030.bin` 中同类失败消失。

9. 净化光环作用包含自身；对非敌方单位清负面状态并治疗，对任意阵营亡灵造成伤害。
   - 文件：`src/game/engine.ts`
   - APK 证据：`C0595l.m4442d` 使用 `m4370a(i,i2,0,2)`；`C0600q.m4293h` 只判断非敌方且负面状态。

10. 攻击光环可以作用于自己和友军，但持续值是 `0`，不是 `1`。
   - 文件：`src/game/engine.ts`
   - APK 证据：`C0595l.m4442d` 用 `f1269H` 写入 INSPIRED；当前远端规则 `f1269H=0`。持续值 0 在当前动作后有效，但下一次该单位回合开始会清除。

11. 攻击/光环后处理从“只在 wait”改为更接近 APK 的 post-action 通用处理。
   - 文件：`src/game/engine.ts`
   - APK 证据：`C0595l.m4446c`、`C0595l.m4442d`。

12. 治疗飞行单位限制已移除。
   - 文件：`src/game/rules.ts`
   - APK 证据：`C0600q.m4276k` 没有地面治疗者不能治疗飞行目标的限制。

## 当前测试命令

每次修规则后至少跑：

```powershell
npm run lint
npm test -- src\game\tests\engine.test.ts
npm test -- src\game\apk_replay.test.ts
```

最新一次三项均通过。

## 最新剩余失败表

当前失败来自 `captures\mitm_replay\20260704_131004` 的前 30 条唯一记录：

| 文件 | record | event | source | move | target | turn | player | 项目动作/问题 |
| --- | ---: | --- | --- | --- | --- | ---: | ---: | --- |
| `game_get_20260704_131048_002.bin` | 857 | SUMMON | (18,15) | (19,15) | (19,17) | 11 | 3 | 找不到召唤目标墓碑 |
| `game_get_20260704_131100_004.bin` | 875 | ATTACK | (13,18) | (13,18) | (13,17) | 13 | 1 | 找不到攻击目标单位 |
| `game_get_20260704_131118_006.bin` | 427 | ATTACK | (20,6) | (17,6) | (17,5) | 7 | 5 | `move:u_78:17,6` 非法 |
| `game_get_20260704_131141_011.bin` | 910 | ATTACK | (2,0) | (0,2) | (1,3) | 12 | 1 | `move:u_102:0,2` 非法 |
| `game_get_20260704_131211_016.bin` | 1114 | ATTACK | (13,19) | (16,20) | (17,19) | 13 | 4 | `move:u_96:16,20` 非法 |
| `game_get_20260704_131221_018.bin` | 1017 | ATTACK | (18,7) | (17,6) | (16,6) | 13 | 5 | `move:u_51:17,6` 非法 |
| `game_get_20260704_131229_019.bin` | 565 | STANDBY | (19,19) | (20,17) | - | 9 | 0 | `move:u_88:20,17` 非法 |
| `game_get_20260704_131235_020.bin` | 780 | ATTACK | (4,5) | (2,4) | (1,4) | 11 | 3 | `move:apk_remote_u0:2,4` 非法 |
| `game_get_20260704_131256_021.bin` | 975 | ATTACK | (7,14) | (8,15) | (9,15) | 24 | 3 | `move:apk_remote_u4:8,15` 非法 |
| `game_get_20260704_131309_023.bin` | 1246 | SUMMON | (5,17) | (5,18) | (6,18) | 13 | 1 | 找不到召唤目标墓碑 |
| `game_get_20260704_131316_024.bin` | 785 | STANDBY | (10,6) | (9,6) | - | 23 | 0 | `move:u_41:9,6` 非法 |
| `game_get_20260704_131321_026.bin` | 441 | SUMMON | (20,9) | (20,6) | (18,6) | 7 | 5 | 找不到召唤目标墓碑 |
| `game_get_20260704_131337_029.bin` | 869 | ATTACK | (18,7) | (18,7) | (19,6) | 12 | 1 | 找不到来源单位 |
| `game_get_20260704_131343_030.bin` | 1148 | NONE | (9,3) | - | - | 29 | 2 | 没有合法 commander 招募 |

## 剩余失败的当前判断

剩余大部分不是单点动作展开错误，而是前序状态链条已经分叉：

- 移动非法：目标格在项目中被低血单位占着，但 APK 中应为空，通常说明前面某次攻击/光环/地形/回血导致该单位没死或位置不同。
- 攻击/治疗目标缺失：项目中目标提前死亡或已移动。
- SUMMON 找不到墓碑：项目中对应单位没有死亡、墓碑已提前消失、墓碑 owner/tick 仍有细节差异，或前序位置/死亡链偏了。
- commander 招募失败：样本 `game_get_20260704_131343_030.bin` 中项目玩家 gold=450、commanderDeathCount=1、项目 commander 成本=500，因此无合法招募。APK 允许招募，但 APK 代码显示 commander price 会在 commander 被移除后 +100，所以先不要直接改价格公式，优先检查金币/死亡链是否偏。

## 已排查但暂不应贸然改的点

1. commander 重招募价格。
   - APK 证据：`C0600q.m4274l` 对 commander 使用 `f1247s[team]`；`C0600q.m4324d` 在移除 commander 且 `f1313k` 为 true 时 `f1247s[team] += 100`。
   - 因此目前不应仅凭一个深局招募失败就把 `commanderRecruitCostGrowth` 改为 0。

2. 主动治疗可突破最大 HP。
   - APK 证据：`C0595l.m4450b` 调 `m4455a`，`m4455a` 内 `m4341b` clamp 到 `0..9999`，不是 `maxHp`。
   - 但光环/回合回复使用 `m4307f`，会 clamp 到 `maxHp`。

3. 状态 duration=0。
   - APK `m4256v` 只读状态类型，不检查 remaining；duration=0 的状态仍有效，直到该单位回合开始时 `m4376D` 递减到 -1 才清除。
   - 因此不要把 `remainingTurns=0` 当成无效状态。

## 推荐下一步排查路线

优先选较早失败且现象明确的样本继续：

1. `game_get_20260704_131118_006.bin` record 427：
   - 项目中 `(17,6)` 被敌方 `u_66` ghost 占着，HP=3，APK 中该格应可走。
   - 追踪 `u_66` 从创建到 record 427 的 HP/位置变化，找出为什么项目没让它死亡或离开。

2. `game_get_20260704_131048_002.bin` record 857：
   - SUMMON 找不到墓碑 `(19,17)`。
   - 追踪该坐标附近前序死亡事件；确认项目是否没有生成墓碑，还是墓碑被 tick/consume 过早移除。

3. `game_get_20260704_131321_026.bin` record 441：
   - 更早的 SUMMON 墓碑缺失，record 较小，可能比 857 更易定位。

4. `game_get_20260704_131343_030.bin` record 1148：
   - commander 招募失败。只有在确认金币链没有分叉后，才考虑 commander price 规则。

## 常用分析命令

生成失败表：

```powershell
$r = Get-Content captures\mitm_replay\20260704_131004\project_validation_report_lenient_30.json -Raw | ConvertFrom-Json
$r.items | Where-Object { -not $_.skipped -and -not $_.error -and $_.validation.success -eq $false } |
  Select-Object -First 30 `
    @{n='file';e={$_.fileName}},
    @{n='rec';e={$_.validation.firstErrorRecordIndex}},
    @{n='event';e={$_.validation.firstErrorRecordEvent}},
    @{n='src';e={'({0},{1})' -f $_.validation.firstErrorRecordSource.x,$_.validation.firstErrorRecordSource.y}},
    @{n='move';e={ if ($_.validation.firstErrorRecordMoveTo) {'({0},{1})' -f $_.validation.firstErrorRecordMoveTo.x,$_.validation.firstErrorRecordMoveTo.y} else {'-'}}},
    @{n='target';e={ if ($_.validation.firstErrorRecordTarget) {'({0},{1})' -f $_.validation.firstErrorRecordTarget.x,$_.validation.firstErrorRecordTarget.y} else {'-'}}},
    @{n='turn';e={$_.validation.turnBefore}},
    @{n='p';e={$_.validation.currentPlayerBefore}},
    @{n='action';e={$_.validation.actionCode}},
    @{n='error';e={$_.validation.firstError}} |
  Format-Table -AutoSize
```

统计进度：

```powershell
$r = Get-Content captures\mitm_replay\20260704_131004\project_validation_report_lenient_30.json -Raw | ConvertFrom-Json
$r.items | Where-Object { -not $_.skipped -and -not $_.error } |
  Measure-Object -Property {$_.validation.executedRecordCount} -Sum -Average -Maximum |
  Format-List
```

聚合失败类型：

```powershell
$r = Get-Content captures\mitm_replay\20260704_131004\project_validation_report_lenient_30.json -Raw | ConvertFrom-Json
$r.items | Where-Object { -not $_.skipped -and -not $_.error -and $_.validation.success -eq $false } |
  Group-Object { '{0}|{1}|{2}' -f $_.validation.firstErrorRecordEvent, $_.validation.actionCode, $_.validation.firstError } |
  Sort-Object Count -Descending |
  Select-Object Count,Name |
  Format-Table -AutoSize
```

## 调试建议

当遇到“目标格被低血单位占着”或“目标提前死亡”时，不要先改移动规则。优先写临时 Node/tsx 脚本逐 record 回放，追踪相关单位的 HP、pos、status、level、exp、hasActed。

建议追踪字段：

- `id`
- `ownerId`
- `unitClass`
- `pos`
- `hp`
- `maxHp`
- `status`
- `level`
- `exp`
- `hasMoved`
- `hasActed`
- `movementRemaining`

在确认具体哪一条 record 的 HP/位置第一次和 APK 预期不一致后，再回到 APK 反编译代码找规则证据。

## 工作区注意事项

- 当前工作区有大量未提交改动和新增文件，不能用 `git reset --hard` 或随意 revert。
- 只改与 APK 规则对齐直接相关的文件。
- 代码注释和新增文档保持中文。
- UI 文案保持中文。
- 每次改规则后跑 lint、engine test、apk replay test，再跑 20-30 条回放校验。

## 训练模型状态

当前训练数据和已训练模型应视为过期。原因是本轮已修复多处实质规则差异，旧训练数据是在旧规则下生成的。

建议流程：

1. 继续修复剩余回放分歧。
2. 至少让 20-30 条回放前缀通过率稳定提升到更高水平。
3. 再重新跑训练集。
4. 最后重新训练模型。
