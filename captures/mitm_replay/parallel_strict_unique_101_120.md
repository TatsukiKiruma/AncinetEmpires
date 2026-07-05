# AEII 远端回放项目规则校验报告

- 生成时间：2026-07-05T04:24:06.889Z
- 输入目录：`C:\code\AncinetEmpires\captures`
- 规则模式：SD
- 抽样跳过文件数：0
- 抽样文件上限：全部
- 唯一回放跳过数：100
- 唯一回放上限：20
- 招募歧义处理：允许选第一个合法部署点继续
- APK 强制执行：关闭，严格要求项目合法动作
- 地形处理：未映射地形使用道路兜底并记录
- 文件数：12，唯一校验：12，重复跳过：0，通过：12，失败：0，解析错误：0

## 汇总

| 文件 | SHA256 | 地图 | 动作 | 结果 | 进度 | 首个问题 |
| --- | --- | --- | ---: | --- | --- | --- |
| game_get_20260704_132449_101.bin | e46ae156ac04 | 21x21, P[0,1,2,3,4,5] | 261 | 通过 | 261/261 | - |
| game_get_20260704_132512_102.bin | 93fe39b5da21 | 21x21, P[0,1,2,3,4,5] | 4405 | 通过 | 4405/4405 | - |
| game_get_20260704_132516_103.bin | af06567fa594 | 17x12, P[0,2,3,4] | 921 | 通过 | 921/921 | - |
| game_get_20260704_132521_104.bin | 757699afd6d9 | 25x25, P[0,1,2,3,4,5] | 440 | 通过 | 440/440 | - |
| game_get_20260704_132523_105.bin | 078ce64216da | 25x25, P[0,1,2,3,4,5] | 3 | 通过 | 3/3 | - |
| game_get_20260704_132524_106.bin | b332beea4d08 | 25x25, P[0,1,2,3,4,5] | 2 | 通过 | 2/2 | - |
| game_get_20260704_132542_107.bin | e245fafae51e | 21x21, P[0,1,2,3,4,5] | 4024 | 通过 | 4024/4024 | - |
| game_get_20260704_132551_108.bin | 3bef0550e1ba | 18x19, P[0,1,2,3,4,5] | 1944 | 通过 | 1944/1944 | - |
| game_get_20260704_132603_109.bin | 2aa07d934087 | 21x21, P[0,1,2,3,4,5] | 2931 | 通过 | 2931/2931 | - |
| game_get_20260704_132655_110.bin | 2357e2bd64ef | 21x21, P[0,1,2,3,4,5] | 14936 | 通过 | 14936/14936 | - |
| game_get_20260704_132701_111.bin | 48adad1584e4 | 17x12, P[0,2,3,4] | 1002 | 通过 | 1002/1002 | - |
| game_get_20260704_132710_112.bin | b28bd9a436ea | 21x21, P[0,1,2,3,4,5] | 2057 | 通过 | 2057/2057 | - |

## 明细

### game_get_20260704_132449_101.bin

- 状态：通过
- SHA256：`e46ae156ac04db5d1a212c0a3fd361e0dce8769ba55156d727cae57fcc8d5740`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=10，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：261 条，remaining=0，事件=ATTACK=9, HEAL=1, NEXT_TURN=30, NONE=49, OCCUPY=32, STANDBY=138, SUPPORT=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 261 / 261 条 APK 记录，展开项目动作 445 个
- 终局状态：turn=6，currentPlayer=0，winner=-
- 首个问题：无

### game_get_20260704_132512_102.bin

- 状态：通过
- SHA256：`93fe39b5da21aeec48d4162ab27f5918352e5a9f2f99afa430e2edd9d4675b67`
- 地图：21x21，玩家=[0,1,2,3,4,5]，初始单位=10，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：4405 条，remaining=0，事件=ATTACK=1381, HEAL=173, NEXT_TURN=258, NONE=446, OCCUPY=34, STANDBY=1872, SUMMON=43, SUPPORT=198
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 4405 / 4405 条 APK 记录，展开项目动作 7166 个
- 终局状态：turn=44，currentPlayer=0，winner=-
- 首个问题：无

### game_get_20260704_132516_103.bin

- 状态：通过
- SHA256：`af06567fa59486e5f646f752436670733ffa55b89c066b4effc9a070bed82e77`
- 地图：17x12，玩家=[0,2,3,4]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,2,3,4]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：921 条，remaining=0，事件=ATTACK=269, NEXT_TURN=98, NONE=92, OCCUPY=16, REPAIR=2, STANDBY=441, SUMMON=2, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 921 / 921 条 APK 记录，展开项目动作 1528 个
- 终局状态：turn=35，currentPlayer=3，winner=4
- 首个问题：无

### game_get_20260704_132521_104.bin

- 状态：通过
- SHA256：`757699afd6d9d7414f9a9c70c75b3e0e1ba8db4697a94e0ee9fd2ca9c62af9cd`
- 地图：25x25，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=700，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：440 条，remaining=0，事件=ATTACK=101, HEAL=4, NEXT_TURN=42, NONE=70, OCCUPY=48, STANDBY=165, SUMMON=2, SUPPORT=6, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 440 / 440 条 APK 记录，展开项目动作 717 个
- 终局状态：turn=8，currentPlayer=2，winner=4
- 首个问题：无

### game_get_20260704_132523_105.bin

- 状态：通过
- SHA256：`078ce64216dad5483c9defbb93e1a5617afb6e5d810a5e5aaca89ec5786ea6e7`
- 地图：25x25，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=700，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：3 条，remaining=0，事件=OCCUPY=1, SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 3 / 3 条 APK 记录，展开项目动作 4 个
- 终局状态：turn=1，currentPlayer=2，winner=4
- 首个问题：无

### game_get_20260704_132524_106.bin

- 状态：通过
- SHA256：`b332beea4d087bf311a3d2e2d3db1d72a4b531e19cd3fb22c703fe592258f3de`
- 地图：25x25，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=-1
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=700，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：2 条，remaining=0，事件=SURRENDER=2
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 2 / 2 条 APK 记录，展开项目动作 2 个
- 终局状态：turn=1，currentPlayer=2，winner=4
- 首个问题：无

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