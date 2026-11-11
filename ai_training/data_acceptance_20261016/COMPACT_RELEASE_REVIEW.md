# 紧凑读取与来源索引的独立审查记录

审查日期：2026-10-16，北京时间约00:42–00:47。只读审查生产代码与既有checkpoint，新增本文件、独立小型探针及其fixture/结果；未修改consumer/projection/native reader/run_phone或公共源码，未运行builder、训练、新对局或手机控制。主代理在接收审查发现后独立修订了compact reader和builder，以下分别记录初版发现与最新验证范围。

## 审查身份与结论

最新实际探针绑定 `phone/compact_reader.ts` SHA256 `d690920ef69f7491fb8b56c922e53af952809dcec2f9f0ccbf8172d54701373f`，探针运行前后该文件未变化。builder最后静态审查身份为 `7ac12fb5fdca3cf1666941da24d8c8544c7a88837e3340cf896b77adeaa09161`，未执行该修订版builder，不将静态复核写成动态测试。

**在已执行探针与首checkpoint复算范围内，未发现仍会提前泄漏标签的阻断问题。** 这不等于原生全规则、网络schema或全部5012段完成验收；索引明确 `modelSchemaAccepted=false`、`policyGateSatisfied=false`、`trainingAuthorized=false`。当前释放的是来源行为标签及受条件约束的结果证据，不能直接称最终模型训练门槛通过。

## Reader 的关键边界

|检查|实际结果与边界|
|---|---|
|失败宏步整组撤回|既有s0003测试通过：允许范围为收据的完整checkedMacros；失败宏即使已写部分或全部原子仍不emit；越过收据截止点拒绝|
|CRC/SHA先于标签|两次解析使用同一压缩Buffer；第一遍完整gunzip/CRC、头尾、序号、摘要链和资格预检，第二遍才emit。匹配损坏文件新SHA但CRC错误、已知SHA不符、宏缺原子，回调均0次|
|宏连续与权重|macro/subAction连续、完整macroAtoms组、每原子权重1/k且总和1；缺weight与字符串weight的初版NaN/类型漏洞已由Number.isFinite补上，最新探针均拒绝且回调0|
|动作与身份|缺code原先可发标签，已补非空字符串及来源合同检查；缺actor/alliance现均拒绝，联盟与header玩家映射必须一致|
|value视角|赢家必须属于合法联盟，并有带SHA、父ID/sourceIdentity/segment覆盖的父局自然终局证据。-1未知赢家拒绝。完整s0005探针649原子中，联盟1赢家视角437条+1、其他联盟212条-1；return始终false，schema始终false|
|文件边界|初版只有词法path.resolve前缀，现增realpath边界及Windows大小写规范化；越界相对路径测试拒绝。审查环境创建junction返回EPERM，故**链接边界仅静态复核，未声称动态junction测试通过**|
|零通过隔离分片|收据明确failure且截止点等于globalOffset时，footer-only可完整读回，0宏/0原子/0标签；这是正确的隔离证据读取，不是policy通过|
|头尾乱序|初版footer→header在零通过片段被接受，现已拒绝；最新探针回调0。完整头尾之外未知行/重复footer等仍拒绝|

原有 `node --import tsx --test .../phone/compact_reader.test.ts` 四项测试通过。独立负例与正例探针见 [compact_reader_review_probe.ts](compact_reader_review_probe.ts)，最新结果见 [findings.json](compact_reader_review_fixture_1792082750404/findings.json)。最初两次fixture保留了修复前后的证据，不覆盖旧结果。

注意：reader检查的是来源分片结构与release资格证据，不重新执行每个TS动作。原始strict、actor当前玩家与动作语义由冻结consumer收据提供；文件SHA完整性与权威转移正确性不能混为一个证明。value探针使用明确构造的本地证据验证消费端视角，不证明合成证据对应新增真实对局。

## Builder 与首checkpoint独立复算

复算对象固定为 `phone/checkpoint-2026-10-15T16-43-22-349Z`，不是后台持续新增收据的实时汇总。脚本 [review_release_index.py](review_release_index.py) 只读checkpoint，不执行builder或转换器；结果见 [release_review_1792082750.json](release_review_1792082750.json)。北京时间00:45:50观察：

- 399个processed与4613个pending各自唯一、互不相交，精确覆盖全部5012端点ID。
- 合计142725个闭合宏步、229414个来源行为原子；52024个value原子来自57个父局，与summary一致。
- 全部合格片段assignedPartition=train，零通过为quarantine，待处理为pending；没有现有数据holdout。网络schema、完整policy gate、return与训练授权均关闭。
- 实际configuredPlayers分桶为2人358段、3人13段、4人28段；逐entry的bucket与独立桶文件一致，configSha与父局及端点一致，未按地图名字误分类。
- 全部索引分片SHA、各value证据SHA与所覆盖receipt SHA吻合；value父局的全部原始及续跑段均transitionAccepted，赢家与父终端元数据一致。
- endpoint交付manifest中全部文件SHA吻合；464份读取文件复核无变化。未重新解压该checkpoint全部gzip，未重做权威引擎转移。

首次builder静态审查发现，它只验证consumer源码而未将端点结果/分桶/快照文件绑定到其交付身份，可能在修改/不一致读取后新铸valueEvidence；config/plan join也未由发布器显式拒绝不一致。主代理已补：端点delivery manifest、source identity、bucket来源与snapshot SHA绑定，发布末尾双读；configSha/plan精确连接；唯一ID；读取已哈希循环政策的first_global_index；manifest显式列parentValueEvidence摘要。最新静态复核已见这些检查。

端点链要求从globalOffset=0连续到父局globalActions，initial/final字节SHA接续；value要求父局**全部段**strict完整、自然终局且末h与父联盟结果一致。任一段失败/缺失就全父局value mask，不能只用某个通过前缀配原生胜负。政策s2466确认区间从78100起排除行为尾部，整个父局不放value；其他长局不凭步数判平。

## 剩余检查建议

1. 目前builder检查C盘≥12GiB；本轮≤1GiB累计新增限制也应在builder发布前检查，计入索引、parent_values、临时及独立审查产物。converter逐任务预算检查不自动涵盖随后builder新增字节。达到限制只暂停自身，不删除历史或操作手机。
2. 将本探针的缺weight/code/actor/alliance、未知赢家、正反value、footer-only、footer→header等最小例纳入永久测试。当前4个既有测试未逐项覆盖这些新增拒绝合同。
3. 最终全量release须用修订builder重新产生新目录并验证manifest，不覆盖首checkpoint；新源码身份与旧checkpoint的tools哈希不同是正常版本差异，不能冒充旧checkpoint已由新代码生成。
4. valueEvidence是发布者签发的来源证明，不是防恶意修改的密码学签名；上游来源SHA和完整收据链必须持续绑定。不得把原生投影候选一致升格为原生Java合法候选oracle或模型输入验收通过。

本审查没有为剩余4613个分段作完成声明，也不为任何模型棋力或部署作背书。
