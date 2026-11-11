# SO 指挥官特殊招募：APK 证据与修复

APK：aer-release-4.2.5.1.apk，SHA256 51B00185F300DD8899284AA91986AEE9A1CC73FA012262A0D9EEBC97FAD1AA7B。

静态证据（本地 JADX）：

- C0600q.java 1045–1047，m4302g：指挥官且存在储备 OR 在普通招募列表中。普通列表未列指挥官不等于禁止指挥官。
- C0600q.java 805–806，m4335c：检查 f1246r[team] 是否为空；871–872，m4326d 检查指挥官类型。
- C0600q.java 329–360，m4365a：扫描各队初始在场指挥官；若不存在，主动创建 0 级指挥官并写入 f1246r。因此初始无指挥官的队伍也拥有储备，不要求此前实际阵亡。
- C0600q.java 1339–1353，m4271m：移除指挥官时保存到该队 f1246r。
- C0789f0.java 173–196，mo3077m：遍历普通列表后，若有储备则将指挥官插到列表首项，并读取储备经验供预览。
- SO/controller.js OnGameStart 的 SyncSetRecruitUnits(0..8) 仅修改普通列表。

修复：保留 SO 普通列表 0..8；恢复 commander 基础价格 400；getRecruitableUnits 在无在场指挥官且价格启用时添加特殊条目。canRecruitUnitClass 原有在场限制、资金与人口等校验继续生效。SD 普通列表中的显式指挥官保持原有语义。

边界：项目用在场 commander 与 player 的储备等级/经验表示标准遭遇战储备；本修复不新增自定义脚本清空储备的状态建模。普通 SD/SO 初始化与阵亡路径有上述证据支持。

验证：so_commander_recruit.test.ts 覆盖储备等级/经验、死亡后价格、固定动作 mask、环境 clone 与执行结果一致、资金不足、在场与显式禁价。连同 engine 与 skirmish report 定向运行 205/205 通过。041 真实 SO 回放结果见同目录 so-041-validation.json；strict + rejectInformationLoss，无 forced 或诊断 monkeypatch。

历史分析文档中的“SO 禁止指挥官”是旧错误结论；历史审计证据不重写，最新结论以上述 APK 方法与复验为准。
