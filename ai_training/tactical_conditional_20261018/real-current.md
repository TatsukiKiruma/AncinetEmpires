# AEII 远端回放项目规则校验报告

- 生成时间：2026-10-18T05:35:28.523Z
- 输入目录：`C:\code\AncinetEmpires\captures\mitm_replay`
- 规则模式：SD
- 抽样跳过文件数：0
- 抽样文件上限：全部
- 唯一回放跳过数：0
- 唯一回放上限：3
- 招募歧义处理：允许选第一个合法部署点继续
- APK 强制执行：关闭，严格要求项目合法动作
- 地形处理：未映射地形使用道路兜底并记录
- 信息损失验收：兼容执行，逐条记录跳过、替换和推断
- 通过范围：仅表示所选配置下项目回放执行无错误；未比较 APK 逐步状态，不证明规则或终局状态等价。
- 事件损失统计：跳过=0，替换=0，歧义推断=0
- 文件数：3，唯一校验：3，重复跳过：0，通过：3，失败：0，解析错误：0

## 分歧分类汇总

- 无失败分歧。

## 汇总

| 文件 | SHA256 | 地图 | 动作 | 结果 | 进度 | 首个问题 |
| --- | --- | --- | ---: | --- | --- | --- |
| game_get_20260704_122310_001.bin | 8917e542b931 | 17x12, P[0,2,3,4] | 928 | 通过 | 928/928 | - |
| game_get_20260704_122329_002.bin | a706d70a4e6e | 21x21, P[0,1,2,3,4,5] | 1065 | 通过 | 1065/1065 | - |
| game_get_20260704_125148_001.bin | bf67e73547fc | 15x12, P[0,1,2,3] | 1049 | 通过 | 1049/1049 | - |

## 明细

### game_get_20260704_122310_001.bin

- 项目回放执行：配置范围内无执行错误（未比较 APK 逐步状态，不能据此证明规则等价）
- 执行证据：绕过合法性=false，完整消费=true，跳过事件=0，替换事件=0，歧义推断=0
- SHA256：`8917e542b93108ff5f04e37750dfd6dfc45b62c02b2f856e8bd8183161e74758`
- 地图：17x12，scenario=SD，campaignLike=false，玩家=[0,2,3,4]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,2,3,4]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：928 条，remaining=0，事件=ATTACK=294, NEXT_TURN=95, NONE=86, OCCUPY=16, REPAIR=2, STANDBY=431, SUMMON=3, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 928 / 928 条 APK 记录，展开项目动作 1559 个
- 终局状态：turn=34，currentPlayer=3，winner=4
- 首个问题：无

### game_get_20260704_122329_002.bin

- 项目回放执行：配置范围内无执行错误（未比较 APK 逐步状态，不能据此证明规则等价）
- 执行证据：绕过合法性=false，完整消费=true，跳过事件=0，替换事件=0，歧义推断=0
- SHA256：`a706d70a4e6e75918b599011c17bea27e81a13f7519b368847436a3c4747a48e`
- 地图：21x21，scenario=SD，campaignLike=false，玩家=[0,1,2,3,4,5]，初始单位=6，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3,4,5]，initialGold=500，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1065 条，remaining=0，事件=ATTACK=199, HEAL=26, NEXT_TURN=73, NONE=132, OCCUPY=34, STANDBY=565, SUMMON=1, SUPPORT=35
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 1065 / 1065 条 APK 记录，展开项目动作 1770 个
- 终局状态：turn=13，currentPlayer=1，winner=-
- 首个问题：无

### game_get_20260704_125148_001.bin

- 项目回放执行：配置范围内无执行错误（未比较 APK 逐步状态，不能据此证明规则等价）
- 执行证据：绕过合法性=false，完整消费=true，跳过事件=0，替换事件=0，歧义推断=0
- SHA256：`bf67e73547fcca11a4904c7b821c563163278ba8472ec35ba3f6b9e22511dd1d`
- 地图：15x12，scenario=SD，campaignLike=false，玩家=[0,1,2,3]，初始单位=4，推荐金币=300
- 项目开局：currentPlayer=0，activeTeams=[0,1,2,3]，initialGold=300，unitLimit=100，levelCap=9
- 本局价格覆盖：soldier=150, archer=250, water_elemental=300, witch=400, elf=500, wolf=600, golem=600, catapult=800, dragon=1000, commander=400, paladin=400, berserker=500, ghost=200, dark_mage=300, wolf_archer=800, ice_elemental=600, slime=250, mermaid=200, druid=600
- 动作：1049 条，remaining=0，事件=ATTACK=305, HEAL=24, NEXT_TURN=104, NONE=90, OCCUPY=18, REPAIR=3, STANDBY=481, SUMMON=2, SUPPORT=21, SURRENDER=1
- 包诊断：topFields=[g]，topRemaining=0，onlyG=true，replayEOF=true，currentStep=0，replaySplitIndex=0，room=PRIVATE/CLOSED
- 校验进度：已执行 1049 / 1049 条 APK 记录，展开项目动作 1622 个
- 终局状态：turn=37，currentPlayer=2，winner=2
- 首个问题：无

## 结论说明

- “通过”表示项目规则能从同一个远端回放响应中的初始地图开始，按已抓到的 APK 动作前缀执行到校验上限且没有非法动作。
- 抓包得到的回放可能只是整场对局的一段前缀；本报告不把终局、胜负或完整对局作为通过条件。
- “失败”表示项目引擎在某条 APK 动作处出现非法动作或无法展开动作，报告中的 record 即首个分歧点。
- 严格模式下招募记录如果没有部署坐标，可能会在多个合法部署点时中断；这属于回放动作格式信息不足，不一定代表战斗规则不一致。