# 真实回放导入修复：APK 证据

## 初始生命

APK SHA256：51B00185F300DD8899284AA91986AEE9A1CC73FA012262A0D9EEBC97FAD1AA7B。

`APK/_analysis/jadx_output/java/p036c/p037a/p039b/p040a/C0600q.java:741–760` 的 `m4333c(unitId, team, level)` 以 `definition.f1388j + definition.f1389k * level` 创建生命值，并设置累计经验和等级。导入器已解析嵌入 `baseMaxHp` / `maxHpGrowth`，原先忽略它们统一写 HP=100。修复直接使用这两个字段。项目 `getEffectiveStats` 会对 `Unit.maxHp` 再加等级成长，因此 `maxHp` 保存基础生命，`hp` 保存初始完整生命，避免重复加成。

## 前置投降与轮转

- `C0586f.java:59,99,255,284`：NEXT_TURN 分派到 `C0595l.m4441e`，SURRENDER 分派到 `m4431j`。
- `C0595l.java:934–952`：投降先调用 `C0600q.m4303g(currentTeam)`，派发队伍销毁回调；若未终局，再调用 `m4441e()`。
- `C0595l.java:755–773` / `C0583d.m4521c/m4518d/m4544a`：`m4441e` 顺序排入 TURN_END、TURN_START、POST_TURN_START。投降后的显式 NEXT_TURN 是另一个独立轮转。
- `C0600q.java:1028–1043`：销毁队伍移除该队单位并将队伍状态标记为5。
- `C0600q.java:1177–1196`：轮转按队伍编号递增，跳过状态0（未启用）及5（已销毁）。

导入器现在枚举初始活跃队伍，按记录前缀模拟 NEXT_TURN / SURRENDER；投降会从后续轮转中剔除该队伍，再与首个可识别行动者匹配。它不硬编码 P0，覆盖连续投降、禁用队伍和跨圈。当候选不能唯一确定时明确报错，不静默猜测。

## 验证

`tools/apk_game_get_validate.test.ts`：4项通过，验证基础HP与成长、无投降逆推、投降后独立NEXT_TURN、禁用队伍、连续投降及跨圈跳过投降者。

实际回放结果见同目录 `game_get_e9648915cc5f975129d3a4d3-import-fixed.json` 与 `game_get_65609867fac3f7d5fcb95e23-import-fixed.json`。校验启用 `rejectInformationLoss:true`，未启用 forced。该验证证明动作完整且合法；没有 APK 逐步状态快照，不能称为逐状态完全相同。
