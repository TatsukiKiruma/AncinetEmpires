# 后续训练对话交接

本次目录：`C:\code\AncinetEmpires\ai_training\pretrain_preflight_20261022`。

**模型评测、模型保全、缓存清理、真人增量与最终排重已完成；整体前置任务仍因困难APK签名冲突未全部完成，新困难原生数据为0/3000。没有启动约200万参数模型训练、没有实施4秒搜索架构、没有修改GUI入口。**

## 接手顺序

1. 重新检查 `git status --short` 和实际进程。开始时已有大量迁移、删除标记和未提交代码，原始快照保存在 `git-status-before.txt`；不要重置工作区。
2. 阅读仓库 `AGENTS.md`、`ai_training/AGENTS.md`、`docs/environment/interface.md`、`docs/rules/original-apk-hard-ai.md`。
3. 读取 `MODEL_EVALUATION.md`、`MODEL_REGISTRY.json` 及 `DATA_SPLITS.json`；正式结果已冻结在 `evaluation/RESULT.json`，基线建议在 `evaluation/BASELINE_RECOMMENDATION.json`。历史五图为已消费开发面板，不能写成独立盲测。
4. 读取 `HUMAN_DATA_REPORT.md`、原验收索引 `HUMAN_DATA_INDEX.json` 及最终准入 `HUMAN_DATA_INDEX_FINAL.json`；前缀准入、全局strict和自然终局标签须分别使用。
5. 读取 `HARD_APK_PREFLIGHT.md`、`HARD_COLLECTOR_DESIGN.md`、`HARD_COLLECTOR_IMPLEMENTATION.md`、`HARD_3000_REPORT.md` 与 `HARD_3000_MANIFEST.json`。任何后续训练不能假定新困难3000父局已存在。

## 模型与清理

完成100局统一当前v6r3比较：80局本次新跑、20局经源码/资产SHA核验后复用历史；所有组独立strict通过，另只读补齐66局历史strict。标准十局gen00/gen04各3胜，其余五组合各4胜；预登记扩展gen01、phase5-gen02、gen03、other-gen02、gen05分别2/6、2/6、4/6、2/6、1/6。全部无平局、截断或运行错误。完整比较共79,587实际动作、718,154反扑动作，额外历史38,064实际、178,434反扑动作均通过。

工程起点建议为phase5-gen03的完整权重、校准及依赖组合：共同16槽为8/16，gen05为5/16，但双侧配对p=0.5078125，证据仍不确定，不能认定唯一更强。gen01、phase5-gen02、other-gen02、gen05均保留作未显著分离的对照。根/队列时延逐组见模型报告；我方>1000ms为0，对手18次，对手主路径存在2次拒绝计划并回退，运行错误0。不要把strict通过写成双方预算门槛全部通过。

本次盘点七个双流阶段/相关gen02主目录及精确直接依赖，共24,644文件、2,365,806,806字节。48组schema/权重配对全部有效，共29种网络张量状态；22份检查点和一个精确引用的历史JSON模型全部保留。每个完整模型包低于100MB，最大42,795,346字节，因此不按日期或代数删除模型。本轮双流网络真参数量按张量复算为501,642，不把目录大小当作模型大小。模型配套校准、父模型引用、优化器及恢复信息见登记。

删除2,176份可重建缓存，共132,063,532字节逻辑大小；删除期间C盘可用空间观察到增加133,160,960字节，存在系统/评测并发写入影响。16份现行/历史排重相关文件全部保留，不会因清理索引而放回旧测试状态。逐文件依据、来源和重建说明见 `CLEANUP_MANIFEST.json`，结果见 `CLEANUP_RESULT.json`。保全结论见 `ASSET_PRESERVATION_RESULT.json`：22,467份保留文件SHA不变，唯一授权变化是CURRENT新增本任务条目，其原始历史正文逐字节保留。原始严格零变化回执 `asset-verification-after-cleanup.json` 因此保持false，没有被改写成通过。

## 真人与手机

使用当前USB小米8 `c2357770` 的游戏会话，认证仅留内存。服务器 `aer.augix.me` 证书过期，用户明确允许仅此域名临时例外；失败尝试和随后成功下载的报告分别保留。分页共3页（含空终页），下载3份新响应，跳过33份SHA核验过的历史响应。下载完成不等于准入，完整验收以真人报告为准。

3份响应为3个可证host+API父局标识；相对全部历史统计独立的新增父局数仍未知。forced通过2/3，完整strict通过0/3。逐原态重建的合法前缀共2,151原子；去掉trivial/end/surrender等后2,077个策略候选，经14份索引合并的4,222,726个唯一摘要全集过滤，最终仍保留2,077条、排除0条，其中真人控制615条；候选内部规则态也唯一。三份分别为5/6/6人SD回放，不能直接称为新增1v1数据。尾段保持隔离，可靠自然终局0、Value/return关闭。最终每行来源、包SHA、macro/subAction与过滤身份见HUMAN_DATA_INDEX_FINAL.json引用的admitted.jsonl.gz，原验收索引未回写。

指定困难APK SHA为 `a2adcc856384dea4ebac7434c78c2abbdcb1f428e502925fd4beb39c95cd6d48`。原版和困难版同包同版本、签名不同，标准 `adb install -r` 已被系统拒绝。原包SHA仍为 `51b00185f300dd8899284aa91986aee9a1cc73fa012262a0d9eebc97fad1aa7b`。未卸载、未清数据、未改签名检查。恢复需要兼容签名的困难包，或用户另行明确批准经备份和恢复验证的替代安装方案。

困难采集已完成静态设计、单局候选实现和13组离线检查；当前原版APK的只读身份拒绝也已实测。目标困难APK的接口仍未实机验证。已冻结8张官方双人图各375局的配额/种子预登记，`HARD_SAMPLING_PLAN.json` 不代表已采集。单局、约20局、并发吞吐、原生重放、项目strict均未通过实机门禁。不能用旧普通AI数据或Java回退冒充新困难JS父局。

## 数据分区与永久排重

`DATA_SPLITS.json`继承3,296个父局原train/dev分区及旧3,000普通AI父局的5,012续段关系，保留phase6已有36个训练/开发父局身份，并为未来训练标记其已消费评测排除。新增真人3个前缀父局单列；新困难父局列表为空，3,000份计划不得算数据。100局比较及额外历史的实际动作/反扑见证前后态共816,833个canonical摘要进入本次索引；所有真实历史排重版本均纳入，仅按文件SHA去重，不假设最新索引是历史全集。

最终准入绑定DATA_SPLITS SHA `666d546ab2e6415082d17b5a753927bfd78da784ee7d58f2c57d645ae7607fcf`。未落盘的内部搜索节点、预热状态及旧原V2内部节点无法精确恢复；只保证实际落盘轨迹和见证排重，不能声称全部内部状态已排除。正式交付索引为DELIVERY_MANIFEST.json，最终工具/公共运行时身份为TOOL_SOURCE_IDENTITY.json。

## 检查与边界

公共lint/build通过；公共测试初次502通过、1失败、20跳过，既有V2墙钟实战断言孤立复测通过。训练工作区lint有12处历史工具类型错误，测试448通过、63失败，18文件失败；涉及旧工具接口、无测试套件和缺失历史模型/数据，本次未修复这些不相关失败。详见 `CHECKS.json` 和完整日志。公共成功不能替代训练工作区检查。

本次独立评测类型检查exit0；真人前缀类型检查、5项回归、2项过滤测试、2项下载历史测试及困难单局候选13组离线检查通过。当前原版APK的只读拒绝实测通过，但困难运行仍未验收。收尾索引关联脚本曾因同目录parent-model/epoch权重误配触发断言，在写回登记前拒绝；修正为完整model.bin路径匹配后已成功，原失败源码和回执保留为LINK_RESULTS_ATTEMPT01.json及快照。所有自然胜负、截断、错误、forced、strict和可训练策略标签分别登记；没有凭 `done=true` 或文件名伪造自然Value标签。

## 恢复原则

- 不重新执行旧历史实验入口覆盖旧目录；本次评测恢复使用 `run_evaluation.py` 及预登记文件，具体命令见模型报告。
- 保全核验：`C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe -X utf8 ai_training/pretrain_preflight_20261022/asset_inventory.py --verify --allow-cleaned`。
- 下载恢复：使用 `.venv-mitm/Scripts/python.exe tools/aeii_download_finished.py` 的 `--output ai_training/pretrain_preflight_20261022/human/raw --resume --history-root captures/cloud --phone-serial c2357770 --adb-path <现有adb绝对路径>`。若仍用本次获授权的当前服务器证书例外，额外传 `--allow-unverified-host aer.augix.me`；不扩展到其他主机。新一次采集宜用新的独立目录并同时纳入本次历史报告。
- 清理已执行，禁止再次运行删除脚本覆盖账本；只可执行保全核验。
- DATA_SPLITS和最终索引已冻结，生成脚本拒绝覆盖；需要新一轮数据时另建目录，不重写本次SHA身份。
- 真人最终过滤可重读：`python -B -X utf8 ai_training/pretrain_preflight_20261022/human/filter_prefix.py --data-splits C:/code/AncinetEmpires/ai_training/pretrain_preflight_20261022/DATA_SPLITS.json`，每次另建UTC结果目录。
- 困难候选只读身份/后续单局命令见 `C:/code/AncinetEmpires/tools/phone_training_hard/README.md`；不支持续局或批量生产，需先解决安装并完成实机门禁。
- 本交接不授权自动启动训练。后续任务必须显式确认训练范围，并纳入本次新增已消费评测状态排重。
