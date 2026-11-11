# 阶段5.1执行检查点

本文件是执行中的固定记录，不代表实时状态；实时进度读pipeline-status.json、各局result/strict收据及实际工具会话。

- 用户任务来自附件45d69771-c7c6-4862-99ae-8534e604f861/已粘贴的文本.txt。要求保留第0/1代全部字节、完成五项修复并跑原阶段5状态机第2代。全程中文，不动GUI入口。
- 同日另有dual_stream_v2_gen02_20261021完整旧实验，30/56纯、36/56搜、未晋升；它不属于本轮，全部文件保持原样。本轮在dual_stream_v2_phase5_20261020/generations/gen_02。
- 主协调器通过工具exec会话57373运行--target-gen 2，日志phase51-audit/coordinator.log。当前约54/60采样完成，零采样超时/错误；尚未训练或观察本轮候选实战。
- 新运行时冠军搜索56槽已完成38胜/11负/7动作截断，决策超时0；固定/扩展/多人14/14/10胜。根p95约628.77ms、最大715.37ms；队列最大1.4424ms，不能声称队列全低于1ms。纯策略34/56复用，339份旧交付SHA及每槽模型/strict日志已核验。
- 一次本轮测试临时目录清理与旧磁盘扫描器竞态，导致冠军multi-3ffa-2在700动作中断；3971反扑动作及实际动作strict全过。失败文件已按SHA保存在champion-search-arena/attempts/disk-scan-race-20261021。扫描器新增仅ENOENT容错，EACCES仍抛出；独立回归通过。相同模型/初态/种子补跑1264动作自然胜。修复会话43010已完成，不能覆盖或漏算旧失败前缀。
- 开工before.json记录5112份第0/1代及旧独立第2代文件SHA、5个保护入口；runtime-before和training-source-before保存原源码/报告。旧冠军搜索393文件已移动到champion-search-arena-v1-archive，SHA保全。RUNTIME_REVISION.json含gen2RuntimeSha256。
- 已改：primary同单位后续神经贪心、750ms预算和candidateDeadline-45守卫；distill按预计样本比例全程交错、AdamW 3e-5至3e-6、纠错1.5/获胜1.0、冠军KL .10、真实终局六槽且root MSE=0；动作头以gen00外置偏置为锚±.25、真实actor:head开发指标退化回退；24组train-only LBFGS含军力保底0/.05/.15；目录650MB和空闲12GiB守卫。
- 其它：排重包括同日旧独立第2代评测；避免重用其种子和前缀，本轮种子游标180→240。新stream收据存第2代目录，旧root stream-receipts保持原样。
- 检查：公共完整测试434通过/20跳过；后加候选期限测试，定向4项通过；lint/build、阶段独立tsc、9项Python回归、原子纠错、配额和目录消失回归通过。纯策略89状态两遍178次，首次63ms、最大约475ms。

## 待完成

1. 等协调器完成采样→atomic-takeover-v2提取→训练→校准→89状态PyTorch/Node/真实Chrome→候选纯/搜各56槽→原promote(2)。遇失败看pipeline-status和具体log；保全失败收据后恢复同命令，不重训已完成阶段。
2. 若真实Chrome因沙箱Crashpad失败，保全收据，再用同一browser_runner.mjs与LEAGUE_FOLDER指向新gen_02申请沙箱外实际核验；不能复用旧代收据。成功后续跑原命令。
3. arena_summary.py的第2代完整CLI汇总会在promote前自动运行isolation_phase51.ts。检查phase51-audit/post-evaluation-isolation.json的passed；已有成功新收据时不重复。若未运行，手动补：node ai_training/run.mjs node --import tsx dual_stream_v2_phase5_20261020/isolation_phase51.ts。它按训练索引SHA重建实际基础/专家输入，对当前完整及规则等价评测态排重，保全旧索引。
4. 再运行：node ai_training/run.mjs C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe -B -X utf8 dual_stream_v2_phase5_20261020/finish_phase51.py。写REPORT、BATTLES、gate-summary、CURRENT、保全核验及新交付清单，保留旧DELIVERY_MANIFEST原件。
5. 复核生成报告数字、失败项、5112文件和入口SHA。报告晋升与全面质量分别判断，保留反扑未完成和队列峰值，不把流程跑完说成棋力通过。不晋升时不继续第3代。更新续跑说明的最终状态，中文简洁汇报完整战绩与晋升结果。

根目录已有大量用户改动和迁移删除；不可回滚。未操作手机、未接入GUI、未部署。新模型和记录均不提交Git。

## 07:12 后续检查点：父代价值扩展已完成

- 初始协调器57373已在首次Chrome沙箱失败后退出。新协调器exec会话85101，日志coordinator-parent-runtime.log，正在用最终运行时重跑冠军搜索56槽；phase51-champion-search-0/1.log为追加日志，统计当前槽须读champion-search-arena/battles，不能数旧日志行。
- 60局完成55自然/5动作截断，无决策超时/错误；43728实际/225968反扑strict全过。提取24964样本，4176纠错、3340队列纠错、20788其它获胜，排除1重合；47默认抽查无差异。
- 训练完成5187更新/67712样本（base19127，expert48585），模型SHA 1e7f92225ca6bed2e279bf0594439de787c16a5ba129b9c9ad2d8f5040528724；checkpoint/source/data/RNG齐全，不重训。
- 首轮24价值候选全部失败，首轮数值、校准及Chrome失败原件已保全calibration-attempt01-army-floor。候选实战尚未发生。按原用户允许的父代logits插值追加候选0+96组train-only LBFGS，父代按id/target/active/army/income/commander/actionable/bucket/symmetry逐项核验，24512训练/5482开发一致，冻结父代配置在当前池16/16。最后按合格候选trainNLL选择parentMixture=1.0，value-calibration已True；策略仍为新学习权重，不可声称新价值头提升。
- public value_calibration支持可选父代F32插值；turn_search传parentValueModel，完全父代端点只一次叶前向。装配读文件在实验value_parent.ts；pipeline_phase51.ts替代导入旧阶段管线，旧阶段文件不改。
- 新运行时已冻结parent-runtime-freeze.json，RUNTIME_REVISION.gen2RuntimeSha256更新。上一版38胜完整344文件含失败前缀按SHA移动champion-search-arena-v2-archive。最初v1仍原位。新运行时冠军搜索须再跑56槽，不能复用38胜。
- 已执行新管线PyTorch/Node/真实Chrome89状态，raw及pipeline/calibrated最大误差全0、argmax全一致、Profile清理；Chrome用require_escalated实际成功。certify_parent_parity.py已核验当前模型/父代/配置/样本/运行时SHA并生成tri-runtime-parity.json，协调器将复用，无须再跑。
- 公共全量437通过/20跳过，新增父代端点与叶前向回归，定向6项通过；lint/build/独立tsc通过。9项原Python回归原样通过。
- 原训练源码在training-source-snapshot已按训练sourceIdentity保全；最终推理源与训练时两文件不同属合法扩展。finish已改为优先验证存在的原快照，不拿当前源码冒充。
- 本轮新缓存45,766,155字节已按SHA移到兄弟目录dual_stream_v2_phase51_cache_archive_20261021。位置在phase51-audit/calibration-cache-archive.json；probe_parent_value.load支持定位。旧gen00/01、模型/checkpoint/games不动。后续索引原子更新可能需工作区临时目录暂存以控制650MB峰值，不能放宽配额或删历史；先看实际usedBytes。
- arena_summary.py的gen2完整CLI自动执行isolation_phase51.ts，成功后原promote(2)。结束后确认post-evaluation-isolation passed，再跑finish_phase51.py，更新最终LEAGUE_RESUME_GUIDE/CURRENT文字并复核。finish已纳入v2归档全尝试、原700动作失败前缀、两版SHA保全和外置缓存清单。
