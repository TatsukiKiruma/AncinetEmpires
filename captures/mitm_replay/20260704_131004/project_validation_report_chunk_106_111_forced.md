# AEII 远端回放项目规则校验报告

- 生成时间：2026-07-04T20:56:37.677Z
- 输入目录：`C:\code\AncinetEmpires\captures\mitm_replay`
- 规则模式：SD
- 抽样文件上限：全部
- 招募歧义处理：严格模式，缺少部署坐标即失败
- APK 强制执行：开启，跳过项目合法动作枚举
- 地形处理：未映射地形使用道路兜底并记录
- 文件数：6，唯一校验：6，重复跳过：0，通过：6，失败：0，解析错误：0

## 汇总

| 文件 | SHA256 | 地图 | 动作 | 结果 | 进度 | 首个问题 |
| --- | --- | --- | ---: | --- | --- | --- |
| game_get_20260704_132542_107.bin | e245fafae51e | 21x21, P[0,1,2,3,4,5] | 4024 | 通过 | 4024/4024 | - |
| game_get_20260704_132551_108.bin | 3bef0550e1ba | 18x19, P[0,1,2,3,4,5] | 1944 | 通过 | 1944/1944 | - |
| game_get_20260704_132603_109.bin | 2aa07d934087 | 21x21, P[0,1,2,3,4,5] | 2931 | 通过 | 2931/2931 | - |
| game_get_20260704_132655_110.bin | 2357e2bd64ef | 21x21, P[0,1,2,3,4,5] | 14936 | 通过 | 14936/14936 | - |
| game_get_20260704_132701_111.bin | 48adad1584e4 | 17x12, P[0,2,3,4] | 1002 | 通过 | 1002/1002 | - |
| game_get_20260704_132710_112.bin | b28bd9a436ea | 21x21, P[0,1,2,3,4,5] | 2057 | 通过 | 2057/2057 | - |

## 明细

### game_get_20260704_132542_107.bin

- 状态：通过
- SHA256：`e245fafae51e7298bdcfe29bd691faa3d53e62d9b656f82f0ad1728a624469a2`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：4024 条，remaining=0，事件=ATTACK=875, HEAL=149, NEXT_TURN=195, NONE=329, OCCUPY=40, STANDBY=2303, SUMMON=21, SUPPORT=110, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 4024 / 4024 条 APK 记录，展开项目动作 6575 个
- 终局状态：turn=35，currentPlayer=2，winner=2
- 首个问题：无

### game_get_20260704_132551_108.bin

- 状态：通过
- SHA256：`3bef0550e1baff22c716c30d3df87aabd3c731e9b7016416e5e1efe0c0da312c`
- 地图：18x19，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1944 条，remaining=0，事件=ATTACK=256, HEAL=44, NEXT_TURN=117, NONE=164, OCCUPY=47, REPAIR=2, STANDBY=1264, SUMMON=2, SUPPORT=46, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 1944 / 1944 条 APK 记录，展开项目动作 3172 个
- 终局状态：turn=22，currentPlayer=2，winner=2
- 首个问题：无

### game_get_20260704_132603_109.bin

- 状态：通过
- SHA256：`2aa07d93408778ac684ffc678c5901e17cdb3b49fd9616e0638ba0d580980c44`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：2931 条，remaining=0，事件=ATTACK=510, HEAL=123, NEXT_TURN=135, NONE=231, OCCUPY=38, REPAIR=1, STANDBY=1811, SUPPORT=80, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PUBLIC/CLOSED
- 校验进度：已执行 2931 / 2931 条 APK 记录，展开项目动作 4687 个
- 终局状态：turn=25，currentPlayer=2，winner=2
- 首个问题：无

### game_get_20260704_132655_110.bin

- 状态：通过
- SHA256：`2357e2bd64efa3cc07730b724b89043cbf6b4fe889aa4dadfe5a7cb134ea8112`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：14936 条，remaining=0，事件=ATTACK=1945, HEAL=1323, NEXT_TURN=498, NONE=811, OCCUPY=38, STANDBY=9951, SUMMON=31, SUPPORT=337, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 14936 / 14936 条 APK 记录，展开项目动作 23119 个
- 终局状态：turn=97，currentPlayer=2，winner=2
- 首个问题：无

### game_get_20260704_132701_111.bin

- 状态：通过
- SHA256：`48adad1584e41db230ed8fcbed045f744eeaf7b8042d438ad41b3a385b392caf`
- 地图：17x12，玩家=[0,2,3,4]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,2,3,4]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1002 条，remaining=0，事件=ATTACK=287, NEXT_TURN=99, NONE=96, OCCUPY=15, REPAIR=2, STANDBY=498, SUMMON=4, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 1002 / 1002 条 APK 记录，展开项目动作 1660 个
- 终局状态：turn=35，currentPlayer=3，winner=4
- 首个问题：无

### game_get_20260704_132710_112.bin

- 状态：通过
- SHA256：`b28bd9a436ea6ef2298d33ac6ba76d9bf83ed700f38424cea5fb5c2ad488a92e`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=12，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：2057 条，remaining=0，事件=ATTACK=550, HEAL=38, NEXT_TURN=121, NONE=237, OCCUPY=34, STANDBY=978, SUMMON=12, SUPPORT=87
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 2057 / 2057 条 APK 记录，展开项目动作 3382 个
- 终局状态：turn=21，currentPlayer=1，winner=-
- 首个问题：无

## 结论说明

- “通过”表示项目规则能从同一个远端回放响应中的初始地图开始，按已抓到的 APK 动作前缀执行到校验上限且没有非法动作。
- 抓包得到的回放可能只是整场对局的一段前缀；本报告不把终局、胜负或完整对局作为通过条件。
- “失败”表示项目引擎在某条 APK 动作处出现非法动作或无法展开动作，报告中的 record 即首个分歧点。
- 严格模式下招募记录如果没有部署坐标，可能会在多个合法部署点时中断；这属于回放动作格式信息不足，不一定代表战斗规则不一致。