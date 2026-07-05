# AEII 远端回放项目规则校验报告

- 生成时间：2026-07-04T21:35:24.313Z
- 输入目录：`C:\code\AncinetEmpires\captures\mitm_replay`
- 规则模式：SD
- 抽样文件上限：全部
- 招募歧义处理：严格模式，缺少部署坐标即失败
- APK 强制执行：开启，跳过项目合法动作枚举
- 地形处理：未映射地形使用道路兜底并记录
- 文件数：5，唯一校验：4，重复跳过：1，通过：4，失败：0，解析错误：0

## 汇总

| 文件 | SHA256 | 地图 | 动作 | 结果 | 进度 | 首个问题 |
| --- | --- | --- | ---: | --- | --- | --- |
| game_get_20260704_125148_001.bin | bf67e73547fc | 15x12, P[0,1,2,3] | 1049 | 通过 | 1049/1049 | - |
| game_get_20260704_125206_002.bin | bf67e73547fc | - | - | 重复(game_get_20260704_125148_001.bin) | - | - |
| game_get_20260704_125247_003.bin | cfd8d0fadd57 | 11x19, P[0,1,2,3,5] | 1370 | 通过 | 1370/1370 | - |
| game_get_20260704_125313_004.bin | 544233d74082 | 21x21, P[0,1,2,3,4,5] | 2923 | 通过 | 2923/2923 | - |
| game_get_20260704_125336_005.bin | 81ca1179d3a4 | 15x12, P[0,1,2,3] | 1580 | 通过 | 1580/1580 | - |

## 明细

### game_get_20260704_125148_001.bin

- 状态：通过
- SHA256：`bf67e73547fcca11a4904c7b821c563163278ba8472ec35ba3f6b9e22511dd1d`
- 地图：15x12，玩家=[0,1,2,3]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1049 条，remaining=0，事件=ATTACK=305, HEAL=24, NEXT_TURN=104, NONE=90, OCCUPY=18, REPAIR=3, STANDBY=481, SUMMON=2, SUPPORT=21, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 1049 / 1049 条 APK 记录，展开项目动作 1622 个
- 终局状态：turn=37，currentPlayer=2，winner=2
- 首个问题：无

### game_get_20260704_125206_002.bin

- 状态：重复回放，已跳过。重复对象：`game_get_20260704_125148_001.bin`
- SHA256：`bf67e73547fcca11a4904c7b821c563163278ba8472ec35ba3f6b9e22511dd1d`

### game_get_20260704_125247_003.bin

- 状态：通过
- SHA256：`cfd8d0fadd578adb2ce3529591d3de40709fe63d08139523b5635ae82813df11`
- 地图：11x19，玩家=[0,1,2,3,5]，初始单位=5，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1370 条，remaining=0，事件=ATTACK=368, HEAL=29, NEXT_TURN=146, NONE=111, OCCUPY=11, REPAIR=4, STANDBY=698, SUMMON=2, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 1370 / 1370 条 APK 记录，展开项目动作 2154 个
- 终局状态：turn=41，currentPlayer=3，winner=4
- 首个问题：无

### game_get_20260704_125313_004.bin

- 状态：通过
- SHA256：`544233d74082486be6e146e9cc7cc17672f4a0ba80646a5d952540a1972c3ed9`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=10，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：2923 条，remaining=0，事件=ATTACK=912, HEAL=71, NEXT_TURN=168, NONE=300, OCCUPY=34, STANDBY=1285, SUMMON=24, SUPPORT=129
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 2923 / 2923 条 APK 记录，展开项目动作 4747 个
- 终局状态：turn=29，currentPlayer=0，winner=-
- 首个问题：无

### game_get_20260704_125336_005.bin

- 状态：通过
- SHA256：`81ca1179d3a4e5a995773c8e989f1f2f4e026c40453c2e4cc006bdf2d33026cc`
- 地图：15x12，玩家=[0,1,2,3]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1580 条，remaining=0，事件=ATTACK=431, HEAL=40, NEXT_TURN=141, NONE=131, OCCUPY=18, REPAIR=3, STANDBY=763, SUMMON=12, SUPPORT=40, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 1580 / 1580 条 APK 记录，展开项目动作 2399 个
- 终局状态：turn=49，currentPlayer=2，winner=2
- 首个问题：无

## 结论说明

- “通过”表示项目规则能从同一个远端回放响应中的初始地图开始，按已抓到的 APK 动作前缀执行到校验上限且没有非法动作。
- 抓包得到的回放可能只是整场对局的一段前缀；本报告不把终局、胜负或完整对局作为通过条件。
- “失败”表示项目引擎在某条 APK 动作处出现非法动作或无法展开动作，报告中的 record 即首个分歧点。
- 严格模式下招募记录如果没有部署坐标，可能会在多个合法部署点时中断；这属于回放动作格式信息不足，不一定代表战斗规则不一致。