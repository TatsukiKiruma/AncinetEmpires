# 当前队伍淘汰后的回合开始遗漏：APK 证据与修复

## 证据（本地 APK 静态代码）

目标：`APK/aer-release-4.2.5.1.apk`，SHA256 `51B00185F300DD8899284AA91986AEE9A1CC73FA012262A0D9EEBC97FAD1AA7B`。

- 解密 `APK/_analysis/unpack/assets/mods/SD/controller.js` 的 `ValidateTeamState(team)`：单位数和城堡数均为零时 `SyncDestroyTeam(team)`；`ValidateWinningState()` 未结束且被销毁队伍为当前队伍时，调用 `Stage.AsyncNextTurn()`。SO 同名控制器具有同样的淘汰链路。
- `APK/_analysis/jadx_output/java/p036c/p037a/p039b/p040a/C0598o.java:265`：`AsyncNextTurn` 在存活启用队伍大于一时依序入队 `C0583d.m4521c()`、`m4518d()`、`m4544a()`。
- `C0583d.java:196,214,64`：以上三项分别是 `TURN_END`、`TURN_START`、`POST_TURN_START`。
- `C0586f.java:192,224,228` 及 `:375,399,402`：上述命令分派到 `C0595l.m4453b`（结束）、`m4447c`（开始）、`m4472a`（开始后结算）。
- `C0595l.java:516`：旧队单位重置后调用 `C0600q.m4292i`；`C0600q.java:1177` 按队伍编号递增，跳过类型 0/5，经过队伍 5 时增加轮数。
- `C0595l.java:615`：新队回合开始计算并发放收益、递减所属墓碑、清空选择状态。
- `C0595l.java:196`：新队单位状态衰减、`C0600q.m4379A` 重置移动与行动标记，然后结算地形/状态生命值；死亡触发脚本，因此可能连续淘汰。
- `C0600q.java:229`：`m4379A` 重设移动力并清除 `f1311i` / `f1312j`。

因此原项目仅赋值 `currentPlayer` 的行为遗漏原生完整生命周期；修复有直接 APK 证据，不是针对单条回放放宽动作限制。

## 实现范围

`src/game/engine.ts`：真实执行中的当前队淘汰后，进行跨轮计数、清空 pending、完整 startTurn、死亡事件及胜负判断；循环处理连续淘汰。普通构造、clone、reset 仍只校正队伍，不重发收益。显式 `applyInitialTurnStart` 死亡和无可用动作自动换人的死亡也进入同一处理链。

## 验证

- `npx vitest run src/game/tests/eliminated_turn_start.test.ts src/game/tests/initial_turn_income.test.ts`：5/5 通过。覆盖连续两队毒死、跨轮、收益/回复/动作重置、环境合法动作编码及 mask、clone/reset、显式开局收益。
- `node --openssl-legacy-provider --import tsx .tmp/apk-evidence-fixes-20261013/validate-turn.ts`：原始 `game_get_40c8012d422b5ba1579edd78.bin` 1114/1114 严格通过，`rejectInformationLoss:true`，无运行时猴子补丁，无跳过、替换或歧义。
- 原历史第一次非法动作是第 881 条；修复后不再出现。
- `40c-turn-strict.json` 保留原生状态未比较的边界：`apkStateCompared:false`；通过动作序列不等于逐帧状态完全一致。
