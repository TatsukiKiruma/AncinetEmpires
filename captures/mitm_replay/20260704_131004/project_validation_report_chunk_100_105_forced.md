# AEII 远端回放项目规则校验报告

- 生成时间：2026-07-04T20:52:15.792Z
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
| game_get_20260704_132449_101.bin | e46ae156ac04 | 21x21, P[0,1,2,3,4,5] | 261 | 通过 | 261/261 | - |
| game_get_20260704_132512_102.bin | 93fe39b5da21 | 21x21, P[0,1,2,3,4,5] | 4405 | 通过 | 4405/4405 | - |
| game_get_20260704_132516_103.bin | af06567fa594 | 17x12, P[0,2,3,4] | 921 | 通过 | 921/921 | - |
| game_get_20260704_132521_104.bin | 757699afd6d9 | 25x25, P[0,1,2,3,4,5] | 440 | 通过 | 440/440 | - |
| game_get_20260704_132523_105.bin | 078ce64216da | 25x25, P[0,1,2,3,4,5] | 3 | 通过 | 3/3 | - |
| game_get_20260704_132524_106.bin | b332beea4d08 | 25x25, P[0,1,2,3,4,5] | 2 | 通过 | 2/2 | - |

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

## 结论说明

- “通过”表示项目规则能从同一个远端回放响应中的初始地图开始，按已抓到的 APK 动作前缀执行到校验上限且没有非法动作。
- 抓包得到的回放可能只是整场对局的一段前缀；本报告不把终局、胜负或完整对局作为通过条件。
- “失败”表示项目引擎在某条 APK 动作处出现非法动作或无法展开动作，报告中的 record 即首个分歧点。
- 严格模式下招募记录如果没有部署坐标，可能会在多个合法部署点时中断；这属于回放动作格式信息不足，不一定代表战斗规则不一致。