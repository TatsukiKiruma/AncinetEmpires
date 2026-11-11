# 对后续release builder设计的审查要求

本文件审查主代理已说明的设计，不是对尚未看到的实现代码背书：按完全合格checkedMacros释放policy前缀；父局任一TS转换失败使该父局及其续跑的value/return全部mask；端点产物所有资格目前均false。

建议release builder采用以下拒绝优先的合并合同：

1. 以catalog的原始parentId为唯一血缘键，独立连接本目录parent-outcomes和parent-buckets；每段只出现一次，原局加续跑不增加独立样本家族。任何缺行、重复ID、父ID不符、source hash/schema/固定快照时点不一致都阻断，不能做宽松默认join。
2. 必须匹配configSha256、段initial/final SHA、globalOffset/end和各consumer冻结sourceId。端点通过只能证明原生链及结果；不能给不同投影/规则源码产生的TS回执套标签。并行不同版本/候选比较的回执不得按同一个run名混并。
3. policy释放的是已闭合的完整宏步，最后已写出的半宏步、失败宏步中的前半段、缺后继快照的尾步全部不释放。原生独立选择、复合动作拆分、自动结算与适配器补步需要labelOrigin，补出的wait/end_turn不自动取得BC教师标签。
4. 端点natural_terminal且联盟metadata明确，并且**父局所有段的TS转移要求均通过**，才考虑value/return。自然结果不是唯一门槛。循环停止s2466和未结束46局保持value/return mask；真实自然结局但中段失败的父局也全mask。不可根据当前片段正收益给整局补胜负。
5. actor目标必须按该动作所属队伍在原生联盟中的身份生成；不能把h当玩家ID、位掩码、当前行动者ID。先验证当前批联盟恒定，再把终局联盟metadata投影到各决策。s0001的h=3对应team2是最小回归例。
6. 分桶分别保存源地图人数、实际启用人数、mode、planKind、人工残局/其他预设状态。三/四人地图上的人工残局可实际只启用两队；禁止从地图文件名把它误分到三/四人在线竞争桶。`hasPresetState`不等于`artificialEndgame`，技能和高阶兵种预设局另桶。
7. 对完整候选的比较要准确标注为“投影状态与连续TS状态的TS候选一致”，不能升格为原生Java完整候选oracle一致。连续TS观察与原生字节、网络输入之间的差异及schema待验收标志必须随release传递。
8. 汇总必须先重算释放行数/宏步数/独立父局数/动作预算，再按map、configuredPlayerCount、planKind、标签mask原因分别列出；不要用policy行数覆盖率替代独立父局和自然终局覆盖。保留每条隔离原因，不通过忽略新增差异扩大合格前缀。
9. release manifest写出所有输入产物内容SHA、转换/投影/规则/编码身份、父血缘、资格规则版本和时间快照。标签false不得因JSON字段缺失被默认true。发布训练包与启动训练是两种授权，本任务不启动训练。

上述合同仍需针对最终builder实现做只读代码审查，并用少量合成回执测试：缺段、重复段、错SHA、某续跑失败、自然h=3、s2466、未完局、失败宏步半段和多版本混入都必须得到预期阻断/mask。
