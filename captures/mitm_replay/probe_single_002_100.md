# AEII 远端回放项目规则校验报告

- 生成时间：2026-07-05T05:30:18.533Z
- 输入目录：`C:\code\AncinetEmpires\captures\mitm_replay`
- 规则模式：SD
- 抽样跳过文件数：0
- 抽样文件上限：全部
- 唯一回放跳过数：未启用
- 唯一回放上限：未启用
- 招募歧义处理：允许选第一个合法部署点继续
- APK 强制执行：开启，跳过项目合法动作枚举
- 地形处理：未映射地形使用道路兜底并记录
- 文件数：1，唯一校验：1，重复跳过：0，通过：1，失败：0，解析错误：0

## 分歧分类汇总

- 无失败分歧。

## 汇总

| 文件 | SHA256 | 地图 | 动作 | 结果 | 进度 | 首个问题 |
| --- | --- | --- | ---: | --- | --- | --- |
| game_get_20260704_131048_002.bin | 31b6ac6e56fb | 21x21, P[0,1,2,3,4,5] | 13 | 通过 | 13/13 | - |

## 明细

### game_get_20260704_131048_002.bin

- 状态：通过
- SHA256：`31b6ac6e56fb29a682d6716b74cca95993476aaf2b72156c1623484f887b2c7c`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=100，levelCap=8
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：13 条，remaining=336，事件=ATTACK=12, NONE=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=false，currentStep=18，replaySplitIndex=-1，room=PUBLIC/CLOSED
- 校验进度：已执行 13 / 13 条 APK 记录，展开项目动作 2 个
- 终局状态：turn=1，currentPlayer=0，winner=-
- 首个问题：无

## 结论说明

- “通过”表示项目规则能从同一个远端回放响应中的初始地图开始，按已抓到的 APK 动作前缀执行到校验上限且没有非法动作。
- 抓包得到的回放可能只是整场对局的一段前缀；本报告不把终局、胜负或完整对局作为通过条件。
- “失败”表示项目引擎在某条 APK 动作处出现非法动作或无法展开动作，报告中的 record 即首个分歧点。
- 严格模式下招募记录如果没有部署坐标，可能会在多个合法部署点时中断；这属于回放动作格式信息不足，不一定代表战斗规则不一致。