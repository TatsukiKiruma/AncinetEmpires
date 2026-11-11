# 131局起步的小规模专家迭代

当前阶段：`sampling`；第一代从131局开始训练，不补跑旧200局配额。第二、三代各20局困难AI＋10局历史模型，停止新增自战，父局总上限191。

已有131局中的自战与截断证据保留；8局未完成现场不准入。训练使用困难AI示范、自然胜方示范及真实搜索比较；截断关闭终局Value。

历史验证由固定10个新派生开局换边组成20局，仅用于开发选择，不作为训练数据或最终盲测。已审计5309份已知原生/回放/新前缀初态配置；验证采用未出现的合法起始金币配置，训练流逐样本禁止这些配置。未知历史谱系仍无法绝对证明独立。

## 采样与训练进度

- 第1代：新增结果0/0，strict通过0，在途0；训练完成=True，进度`{'epoch': 2, 'updates': 18378, 'cursor': 73485, 'policySamples': 2, 'valueSamples': 2, 'status': 'running'}`。
- 第2代：新增结果30/30，strict通过30，在途0；训练完成=True，进度`{'epoch': 2, 'updates': 23320, 'cursor': 93266, 'policySamples': 3, 'valueSamples': 3, 'status': 'running'}`。
- 第3代：新增结果0/30，strict通过0，在途0；训练完成=False，进度`{}`。

已准入父局合计：161/191（包含已有131局）。

## 验证与阶段晋升

- 固定历史面板配对自然胜净增加；困难AI面板自然胜不回退，不再要求困难AI必须先产生新增胜场。
- 无运行错误、独立strict通过，候选根搜索没有实测超过4000ms，才晋升。截断计非胜，不当平局，历史胜率分母固定20。
- 历史至少10/20自然胜才达到50%讨论扩采门槛；不得据采样10局判定，不自动加局、不追加第4代。
- 第1代：晋升=False，历史胜率=2/20，配对净增=1，工程及棋力门禁={'historicalPairedNetPositive': True, 'hardPairedNoRegression': False, 'noRuntimeErrors': True, 'rootBudgetStrict': False}，扩采讨论条件=False。
- 第2代：晋升=False，历史胜率=0/20，配对净增=-1，工程及棋力门禁={'historicalPairedNetPositive': False, 'hardPairedNoRegression': False, 'noRuntimeErrors': True, 'rootBudgetStrict': True}，扩采讨论条件=False。

## 固定验证面板实际结果

- hard/0a71b10c75a9：20局，0胜20负0平，截断0，错误0。
- hard/0fbfb36f7039：20局，0胜20负0平，截断0，错误0。
- hard/a821caacd5aa：20局，1胜19负0平，截断0，错误0。
- historical/0a71b10c75a9：20局，2胜17负0平，截断1，错误0。
- historical/0fbfb36f7039：20局，0胜20负0平，截断0，错误0。
- historical/a821caacd5aa：20局，1胜15负0平，截断4，错误0。

## 边界和恢复

旧计划、模型、失败日志与暂停现场保留。新困难手机原生数据没有自动加入本轮。GUI和权威规则保持。实测4秒超限仍是工程风险，单独记录并参与晋升门禁。

新进程见根PROCESS.json，不能仅凭running字段判断存活。恢复入口为execution_v5/pipeline.py --run；必须有用户恢复授权，来源身份一致，存在未完成对局时禁止覆盖。

原冻结对照和最终100局在小规模三代之后独立执行，最终结果不参与选模型。
