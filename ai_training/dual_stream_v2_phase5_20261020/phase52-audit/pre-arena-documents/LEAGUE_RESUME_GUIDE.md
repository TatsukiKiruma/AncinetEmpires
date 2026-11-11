# 双流 v2 联赛续跑

<!-- phase52-precheck-state -->
## 第3代当前恢复状态

60局采样、分阶段策略训练及89状态三端已完成；开发前检失败，候选112槽和promote(3)未执行。当前模型及失败项见REPORT.md；完整机器身份见generations/gen_03/training-input-identity.json。重复--target-gen 3会复核现有产物，但不会绕过arena_plan.py的前检断言，不能靠删除收据启动实战。若继续同代修复，先保全当前完整产物并登记新训练合同；若选择112槽失败版本诊断，须明确记录非晋升资格并保持门禁失败。不能启动第4代。
<!-- end-phase52-precheck-state -->


<!-- phase51-final-result -->
## 第2代最终状态

状态机已完成第2代，晋升=False，当前冠军第0代；种子游标=240。第2代纯策略24/56自然胜，搜索35/56自然胜；同运行时冠军分别为34/56与38/56。全部自然负、平局、截断、超时及错误见[BATTLES.md](BATTLES.md)，晋升逐项判定见`generations/gen_02/promotion.json`。

价值16/16、89状态三端及训练/评测隔离结果以[gate-summary.json](gate-summary.json)为准；全面质量未通过项：promotion, queueBelow1ms, retaliationComplete100, pureImprovesChampion。重复`--target-gen 2`不会追加训练代数；按用户最新要求，无论是否晋升，完整完成第2代后均停止，不继续第3代。训练源码快照与最终推理源码各有独立SHA，不能用最终运行时覆盖旧训练输入身份。
<!-- end-phase51-final-result -->


## 2026-10-21 阶段5.1运行合同

### 父代价值扩展后的当前版本

首轮24组军力保底候选未过全部切片，原始校准和数值产物完整保存在`generations/gen_02/calibration-attempt01-army-floor/`。候选实战开始前，按原授权追加父代logits插值候选0及96组train-only L-BFGS网格；逐项核对24,512训练/5,482开发价值样本的目标、活跃槽、态势和几何。最终通过16/16，选择父代价值权重1.0；新模型策略权重保持本轮训练结果，不能宣称新价值头提升。`parent-model.json/bin`是父代副本，装配层按SHA加载，公共运行时只接收模型对象。完整父代端点仅一次叶前向。

公共运行时已为该扩展重新冻结，见`phase51-audit/parent-runtime-freeze.json`；上一版38胜冠军搜索56槽及失败前缀完整归档至`champion-search-arena-v2-archive/`，当前`champion-search-arena/`使用同一新运行时重测。原训练时源码按SHA保存在第2代`training-source-snapshot/`，训练完成后的推理扩展不覆盖其身份。不要用新运行时绕过旧检查点的源码断言继续优化。

首轮真实Chrome沙箱失败原件保留；当前新管线已在真实Chrome沙箱外完成89状态核验，网络误差0，Profile清理成功。新生成的45,766,155字节校准统计按SHA保存在兄弟目录`dual_stream_v2_phase51_cache_archive_20261021/`，位置与摘要在`phase51-audit/calibration-cache-archive.json`，`probe_parent_value.load`按此索引读取；旧第0/1代、新模型、检查点和对局原件保持原位。管理目录仍限制650MB，系统空闲至少12GiB。

排重索引的新字节先放在工作区`.runtime`同卷暂存，校验SHA和fsync后原子替换；旧索引仍先按SHA保全。650MB峰值按目录保全前后两态的最大占用检查，暂存与归档的物理空间一并预留12GiB系统空闲，绝不删除旧索引或放宽上限。回归见`phase51-audit/index-staging-regression.json`。

本轮使用本文件下面的一行`--target-gen 2`命令，在原阶段5状态机新增第2代。今天独立目录`dual_stream_v2_gen02_20261021`属于另一个合同，所有既有文件保持原样，不能互用模型、检查点或收据。

本轮源码冻结与预登记在`phase51-audit/runtime-freeze.json`和`phase51-audit/protocol.json`。第0/1代和另一个既有实验的开工哈希在`phase51-audit/before.json`；修改前公共推理源码在`phase51-audit/runtime-before/`，原训练脚本、报告与本说明原文在`phase51-audit/training-source-before/`。旧冠军搜索56槽按SHA保全到`champion-search-arena-v1-archive/`；`champion-search-arena/`只存新运行时重测。纯策略依赖SHA核验通过后复用原56槽，不重写第0代产物。

当前默认搜索链用神经网络逐步选择，内部预算750ms；其它候选保持启发式。训练为基础/专家批次按样本比例均匀交错，AdamW峰值3e-5、余弦至3e-6，纠错权重1.5、获胜1.0，冠军KL=0.10；价值只拟合真实终局六槽，rootValue保留为诊断。检查点保存交错批次游标、优化器与RNG，恢复必须重放相同流和核验全部身份。

外置动作偏置以第0代为锚，偏移每维±0.25；开发真实actor:head解码的headTop1或无谓wait退化即回退。预登记24组价值候选含0/0.05/0.15军力保底混合，仅train拟合，dev作16切片筛选，不按实战选择。目录上限650MB，空闲12GiB守卫保持；本节资源合同替代下面历史正文中的295MB限制。所有旧资产保留。

重复原命令恢复已持久阶段，不覆盖中断正式槽。第2代完成后由`finish_phase51.py`从新收据生成报告和保全核验；没有晋升时不自动继续第3代。以下内容为此前续跑说明，旧阶段口径以归档原文为准。

在仓库根目录运行，使用已经安装 PyTorch 的解释器：

```powershell
node ai_training/run.mjs C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe -B -X utf8 dual_stream_v2_phase5_20261020/run_league.py --target-gen 2
```

`--target-gen` 是希望完成的绝对代数。已完成第 2 代后，改为 `--target-gen 3` 即追加一代。中断时重复原命令；不要手改 `currentGeneration`、`seedCursor` 或删除未完成局的日志。脚本读取当前冠军热启动，未通过门禁的候选保留，不覆盖冠军。

第1代在预登记8组价值目标中没有通过全部16切片，因此保持第0代冠军；三端数值通过不代表价值质量合格。继续第2代时使用第0代冠军权重与其校准，滑动经验池保留第1代真实搜索教师轨迹。胜率、时延及完整失败项以本阶段最终报告为准。

## 保存的状态

- `league-state.json`：已完成代数、冠军二进制路径及 SHA、校准路径、历史冠军池、种子游标、已预留训练前缀与规则态、最近三代经验池、晋升记录。
- `generations/gen_XX/league-plan.json`：该代固定的 60 局训练计划。24 局 1v1、21 局第 6～16 回合交战前缀自博弈、15 局多人；新计划原子预留种子与前缀，恢复重用同一计划。
- `games/<id>/`：原初态引用、逐动作与反扑 gzip 日志、结果、strict 收据、专家样本及提取收据。每行是独立可恢复 gzip 成员；完局后无损合并压缩。
- `checkpoint.pt`：模型、AdamW 优化器、Python/NumPy/PyTorch 随机状态、epoch/phase/batch 游标。每 50 次更新及阶段边界原子保存；恢复从最后已保存检查点重放数据流，跳过已完成批次。
- `model.json/bin`、`head-calibration.json`、`value-config.json`：候选及外置校准；三端核验与纯策略/搜索各 56 槽结果保存在同代目录。
- `dual-v2-champion.json/bin`：当前冠军便捷副本，实际校准身份以 `league-state.json` 为准。

## 中断与门禁

自博弈可在已持久化原子边界恢复，先 strict 重建局面与随机游标，再继续。恢复时不要求墙钟预算控制下的搜索队列与未中断执行逐位一致，已有动作和种子不会回退。训练从检查点恢复；未保存的最多 49 次更新重新计算，不能将中断前未保存的更新计为最终模型更新。

正式面板已有结果时只做 strict 复核，不重复生成。若面板进程在结果文件生成前中断，脚本保留证据并停止；需要先独立审计该目录，再登记新的 attempt 路径，禁止覆盖或将部分前缀冒称完整对局。模型/源码变化后应新建候选和面板目录，不能沿用旧数值收据。

晋升同时检查：完整面板、全动作与反扑 strict、价值 16 切片、89 状态三端、时延、队列，以及三个搜索面板不低于当前冠军、纯策略不退化。阶段最终验收的“全面超越”另在 `gate-summary.json` 判断，晋升不等于全部用户验收通过。截断、自然胜负、超时与错误分开统计。

第0代同运行时纯策略和搜索基准分别保存在 `champion-pure-arena/` 与 `champion-search-arena/`；第0代最初v0搜索56槽仍保存在原目录。纯策略晋升按固定、扩展、多人三个面板分别比较当前冠军，不能用阶段4原始20胜代替第0代当前先验的34胜。第1代正式面板前先补齐v1教师基线，避免把运行时改动归因于训练。

专家提取合同为 `atomic-takeover-v2`：加载该代教师的真实纯策略模型，在所有接管/否决的根帧及队列帧复算首选；只有实际动作不同才是2.5倍纠错，其余教师获胜动作1.25倍。旧合同收据不能混用；第1代未采用的首轮产物完整保存在 `training-attempt01-plan-level/`。恢复检查点会核对数据SHA、56项训练/运行时源码SHA、父模型SHA和训练轮次，合同变化时拒绝续接。

第1代完整绑定源码保存在 `generations/gen_01/training-source-snapshot/`，对应SHA及原路径见同代 `training-source-snapshot.json`；输入数据与源码身份另有可直接读取的 `training-input-identity.json`。修改后续代训练方案前保留旧代快照；不要绕过检查点的源码或数据身份断言。

正式续跑入口还会核验权威规则聚合SHA与公共推理源码SHA；二者变化时拒绝复用旧对战/数值收据。该前检是本轮追加的恢复保护，晋升函数与预登记版本的AST完全一致，证据见 `RESUME_GUARD_REVISION.json` 与 `run_league-pre-evaluation.py.snapshot`。

所有拟合只使用训练父局。固定开发集用于预登记候选的门禁筛选，实战胜负不用于调参。排重索引继承 511,076 个历史前态，并加入后续评测的完整前态和权威规则态；旧阶段未 flush 的未知尾部无法补造。

后续代更新排重时也扫描已完成的设备专项轨迹。替换全局索引前，旧压缩索引按其内容SHA保留至`evaluation-index-history/`，避免失去旧代训练输入证据；追加隔离审计按各代记录的SHA读取正确版本。保全旧索引与写入新索引的预计占用达到295MB时会停止，不能为续跑删除旧证据。第1代的原输入索引本轮没有重写。

第1代纯策略实战已经回退：固定面板14→9胜，扩展面板13→10胜，多人面板7→3胜，合计34→22胜。动作头开发命中率提高不能替代这一结果。后续若调整训练方案，应在新的代数里先解决纯策略回退与价值排序失败，并保留第1代原始权重、检查点、数据及验收结果；直接增加代数不能保证提升。

## 仅恢复电脑正式验收

训练、校准及三端数值已经完成，只有正式面板被用户停止时，可以运行：

```powershell
node ai_training/run.mjs C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe -B -X utf8 dual_stream_v2_phase5_20261020/resume_arena.py --generation 1
```

该入口核验冻结规则、运行时和模型身份，复核已完成槽，只计算缺失槽，再执行原晋升规则；不重新采样、拟合或操作手机。已完成的代数不能再次通过此入口执行。若存在started而无result的中断槽，仍须先strict核验并登记新的attempt，不自动覆盖。

本轮用户停止前缀的23实际/28反扑动作已审计，原件归档至`generations/gen_01/arena/attempts/user-stop-20261020`。原路径、归档路径与字节SHA见`ARENA_RESUME_ARCHIVE.json`；同槽正式恢复从原初态和种子重新开始。此前设备专项10槽保留为历史诊断，用户已取消后续手机测试，不能把历史授权当作继续操作手机的许可。

## 资源边界

默认每代蒸馏 1 轮，基础池按稳定 SHA 抽样约 20,000 条，与滑动经验池专家样本共同训练，不落盘 dense 特征。`--epochs` 必须在该代首次启动前确定，恢复时不得改变。

目录接近 295MB 或系统空闲低于 12GiB 时磁盘守卫停止自身写入，保留现有证据。多代脚本支持持续追加，但有限磁盘和有限可用训练前缀不允许承诺物理上的无限代数；长期运行应先把完整旧代移入经用户指定的归档位置并保留身份清单，再扩展状态机中的归档路径支持。不要递归清理历史模型、轨迹或支持联接。

本阶段只训练和验收，未接入 Web GUI。应用部署需要另行任务。

用户已选择保持原门禁继续第3代同代优化。第二次失败模型与收据保全于training-attempt02-wait-linear，正在执行joint-repair-protocol.json；原报告指标仍指第二次模型，112槽由前检守门，第4代禁止启动。
