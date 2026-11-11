# 执行接手记录（不是最终报告）

用户原始阶段4任务和后续补充都有效，必须继续到完整数据、训练、Value门禁、四臂配对实战、strict重放及最终报告/清单。用户补充明确要求基于公共BattleSearchAI框架；已移植到model_battle_search_ai.ts，不能退回第一个自写原型。全程中文，无代理委派授权，不使用子代理。公共源码和阶段3目录不修改，不操作手机。

本次已完成指定AGENTS/README/interface/阶段3报告阅读以及开始前git status。原工作区大量修改/删除/未跟踪资产全部保留。PRESERVE.json冻结913份引用，stage3-preserve-all.json冻结阶段3全部4771文件；最终deliver.py会逐文件复核。当前公共lint、368测试、build通过；训练工作区总lint有旧版本错误，总测试447通过64失败，日志保留。独立新目录类型检查通过。

选择固定480训练/120开发父局，原900分区内保留阶段3全部300父局。期望未剔除平凡前的原子203847，可信value原子63550，最终数量以contract.json/audit结果为准。新增10维到151维；策略从阶段3SHA=81030e...热启动，新输入权重0。Value上下文260+24维，独立64维LN/ReLU/tanh MLP；自然结果mask过滤，父局/阶段均衡，策略骨干冻结。另有常数、分阶段常数、静态多特征、公共calculateArmyValue及训练集拟合尺度基线。

当前仍在预处理。最近一次已完成595父局/195406原子，0失败（此数字是保存快照，不是实时进度）。准备进程exec session=31832；控制器exec session=24858，在等待contract.json。需要用write_stdin轮询这些会话或读取收据，不能从旧状态推定活跃。准备入口run_prepare.py目前传入worker-assignment-tail.json，10进程，尾部9个未完成父局各分配一个进程，已完成分片不重做；此前均衡分配后仅lane7遗留多父局，已保留中断前缀/退出收据并重新分配。所有选择、特征与训练协议不变。

pipeline.py依次等待数据合同→audit_data.ts（全部600父局重新核对动作/状态/结果与公共Army基线，60中段重新生成新增特征）→train.py policy（4轮AdamW，最佳不覆盖历史epoch文件）→calibrate.py（五类联合L-BFGS，9组，固定120开发门禁）→evaluate_baselines.py→train.py value→parity.py best→gates.ts numeric best。随后创建WAITING_BROWSER.json，等待browser-best.json，此时主代理必须运行真实Chrome：

`node ai_training/run.mjs node tactical_value_search_20261018/browser_runner.mjs best`

Chrome需要require_escalated以访问本机loopback，之前已自动批准同前缀；仅本地数值测试，windowsHide=true。初始Chrome最新门禁已经通过，包括valueTarget=null、mask=false、胜方加权batch32/末批7；前向/梯度最大误差约1.4e-14/7.5e-15，23原始状态零编码差异。最佳末批由实际trainRows决定。

浏览器最佳门禁通过后控制器调用plan_battles.py；这个脚本会先断言Value和类别校准门禁通过，并完成最佳模型新目录类型检查、纯度依赖图、搜索重复决策与响应反例。如果门禁失败，控制器会保留pipeline-exit.json失败，不会启动不合格Value的搜索实战。此时需分析并继续修复，保留原模型和报告，不得伪称通过。所有输出日志使用x模式；如需重启控制器，保留旧日志/退出收据到独立名称，不能盲目重跑已完成训练。

四臂为阶段3hierarchical、阶段4pure、value_rerank、bounded。固定五图双座位三对手共120槽；10个阶段3未纳入的新增开发父局前缀双座位对HeuristicAI再80槽，合计200。expanded-roots.json已在训练前冻结，全部为开发材料，不声称独立泛化。600来源有21局玩家ID为0/2，Value与评测必须按实际玩家ID；plan_battles.py与battle.ts已处理，不能使用1-seat。

搜索框架见FRAMEWORK_MAPPING.md。Top6、3步己方非end连动全部模型驱动；对手Maximin含三单位集火、movingThreat补充、模型候选移动后继续探测同单位攻击。默认保底、自然胜±4、非终局夹在±3、Takeover0.08、Veto0.03、危险线-0.5或真实损失。单步48/整局2400显式搜索节点，30秒/600秒，2000实际动作。预算不完整候选不能接管；只执行匹配预测完整状态与当前合法集合的连动队列。所有评测提交动作完整strict重放。HeuristicAI只作评测对手，搜索依赖图38模块无其依赖。

反例已通过：单军35<指挥官60HP，两军移动攻击合法致死；狭窄冲突落点松弛70但实际仅35且不致死；零移动成本不能用曼哈顿半径错误裁剪；新Maximin实际消费指挥官集火死亡回应；3个己方连动均核对为模型选择。快速Value叶子与完整Value前向误差0。最新模型的重复决策/响应门禁会在实战前重跑。

控制器执行实战8进程、strict6进程、summarize.py，再写pipeline-exit.json passed。全部完成后主代理运行deliver.py生成REPORT.md/DELIVERY_MANIFEST.json并更新status/CURRENT.md，必须核实实际结果而不是只看退出码。deliver.py也检查全部历史SHA。最终答复应简洁给主要胜率、门禁/失败结论和报告链接。不要在训练/实战未完成时结束任务。

固定Python：C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe，PyTorch2.14.0+cpu，所有入口从根目录走node ai_training/run.mjs。train.py禁止写旧目录的bytecode。所有第一版原型、失败记录与中断文件保留为snapshot/日志，不在运行路径中。

报告生成补充：summarize.py及deliver.py已增加相对阶段3配对新增/丢失自然胜局、配对第10轮收入变化、攻击机会率、end分母与搜索干预表。Python AST通过。DESIGN已明确松弛量不是整个敌回合的形式上界；零风险攻击提示仅指无即时反击损血。

最新阶段：600父局预处理/打包及全部数据审计已通过，156517训练/40712开发原子；可信value61233（胜41604/负19629），未知135996。控制器session24858正在策略第2轮，预处理session31832已exit0。训练第1轮top1 58.6805%、groupTop1 74.7396%、devNLL1.40838。实战未开始。叶子实际城堡变化补齐对称失城负项，系数不变，原leaf/contract/修订收据已保留。初始search gate和增加真实占城±1的response regression通过；最优模型门禁尚待执行。首次夺城fixture错误使用士兵已保留失败记录并改用指挥官模板。

最新控制器session61918，以pipeline.py after-calibration恢复（原24858已中断且收据/日志保留）。策略4轮19568步完成，best epoch4，train1357.85s。原9组校准全部失败，.6/.5漏招募448；追加.6/.4仍427，追加.35/.3/.25后选.6/.35，top1 .5918648064、group .7519158970、end414、wait1347、attack11611/24436，全部原门禁通过。calibrate_extension.py复用原函数AST与缓存，无实战调参。deliver.py已明确原9组失败与追加4组，不能说原网格通过。

Value叶子新增value_summary_runtime.ts，不再计算摘要未用的actor风险；features.ts/prepare.ts/data/策略绑定源码未变。search_gate.ts新增24维摘要逐值检查；23探针maxSummaryError=0/maxValueError=0，重复搜索通过。旧value_runtime已snapshot。最佳门禁仍待Value完成后执行。evaluate_baselines.py复用已验证同一epoch的policy-history未校准dev，避免重复前向；新校准dev仍重新评估。

最新控制器session3435，pipeline.py after-value。61918已停，首Value284 MLP未过中盘/晚期拟合Army基线，before-army模型/数字/日志已保留。Value285追加Army仍未过中盘（.1526 vs .14195），16epoch全部保留，输出温度18候选亦未过。最终ResidualValue：已训练285→64 LN/ReLU基底，追加6个学习阶段Army跳连，固定基底以训练分区L-BFGS拟合64输出+偏置+6跳连。16候选最终basis=head2-best、BCE/reg=.01（候选7）；三阶段MSE .4426212984/.1298239059/.0241313319，全部6基线门禁通过。train_value_residual.py/residual_value.py为最终训练入口。旧head2模型/报告before-residual保留；所有追加均无实战调参，报告明确非原架构一次通过。

当前model-final SHA=e93a212f07fa7a91348c4e7311dc93f2ece4d3b8ea14d559d40a4d3cbe4f6421。valueArmyFeature/valueArmyResidual=true，输入285，head18503参数。encodeEngine默认旧行为、按flag追加Army；inputs.json原23不变，inputs-army.json独立新字段。旧numeric/parity/runtime源码before-army snapshot保留。新三端army-initial/residual-initial及best通过；best forward1.42e-14/grad8.88e-15、batch32/5、Chrome0编码误差。新增Typecheck通过，search_gate_best摘要/fastValue误差0，response-regression-best通过，purity40模块无Heuristic依赖。四臂200槽已启动，始终不得修改模型或搜索源码来追实战结果。接下来等play→strict→summarize完成，执行deliver.py并核实manifest/CURRENT。deliver已更新最终Value架构与三种initial数字门禁表。

最新活跃controller session97524=complete_battles.py，共享队列8并发。3435与固定8分臂worker已全部停止；35个已完成结果（包括失败/动作截断）逐文件SHA保留，8个在跑局一律归档battles/interrupted，再按原初态种子模型重跑，不改任何局内源码/参数。battle-dynamic-source-freeze.json冻结代码/模型/计划；play_dynamic.py每次从相同battle.ts单slot模式执行，最大8并发。当前40/200完成，无运行错误，全部8在跑前缀日志为完整换行记录。complete_battles.py随后6并发全量strict→replay_interrupted.ts校验35保留结果SHA和8归档前缀strict/重跑共享状态动作/RNG一致→summarize。deliver已要求dynamic与interrupted audit通过，并披露重调度。新TS类型检查通过。后续不改模型/搜索源码，不因中途战绩挑结果。

正在新增独立事件守卫修订：ApkLike四臂完整结果baseline6/10（1动作截断）、pure6/10、Value重排1/10（动作/墙钟各1）、原bounded5/10（墙钟1）。用户要求Takeover基于真实斩杀/占城/招募事件，而原框架通用Value分差即可接管，静态审查发现条件过宽。原200与模型/搜索源码全部继续冻结（97524运行）；不替换任何原结果。将新增model_battle_search_verified_ai.ts/search_verified.ts/battle_verified.ts，Takeover要求友军真实事件相对默认增加，Veto只认真实致死而不单凭负Value；收紧无关键事件触发。计划追加独立同初态种子50槽，原200全部strict后才启动，最终250槽均保留并披露追加探索。新代码目前只是复制待补丁，尚未验证/运行，不要当完成。

事件守卫修订已完成并通过：verified_gate.ts四个实际引擎事件正反例、3探针重复搜索/源状态不变、48树节点和≤6触发探测；response_verified_regression.ts best 多单位移动攻击、落点冲突、零成本、3步纯NN连动、Maximin、夺城±1通过；purity_verified_gate.mjs 41模块0禁用依赖。newClass= model_battle_search_verified_ai.ts，仅新文件，不修改原40模块冻结代码。新增真实友军事件统计在敌方回应前，普通root只能敌cmd击杀/敌城堡夺取接管；end/wait可新增击杀/捕获/招募/无即时己方损血攻击；Veto不再仅凭score<=-.5，风险和损失条件保留；触发只看关键cmd/castle等机会。

plan_verified.py已冻结battle-verified-plan.json，50槽初态种子和原bounded逐槽相同，model=bounded_verified，ID=verified-原ID；Policy/Value参数、分差/预算均未改。新source freeze包括原冻结源和新增文件。complete_verified.py已启动exec session75725，正在等待原controller97524完成原200槽及strict/中断审计/summary；之后自动备份pipeline-exit-original200、battle-summary-original200、BATTLES_ORIGINAL200，改pipeline-exit为running_verified_extension，再8并发play_verified.py→6并发battle_verified.ts strict→summarize.py all合并250→pipeline-exit passed total250。不得在原200完成时提前交付；必须等追加50。

当前原200进度=137。deliver.py已改为250槽且要求verified gates/play/pipeline收据，主胜场行展示原四臂和修订版，manifest v2包括原200+追加50、两种purity证据；原结果绝不替换。summarize.py默认仍原200，all才250。deliver尚未执行，CURRENT仍未更新。新Ts类型检查通过，deliver AST通过。下一步补充README/FRAMEWORK_VERIFIED与CURRENT文字若必要，并等待所有250完成后运行deliver、复核manifest全部SHA和阶段3保全。

固定原120面板已完成（尚待原200后strict）：阶段3 Random/Apk/Heur=10/6/6（APK1动作截断）；pure=10/6/7（Heur1墙钟）；Value重排=10/1/2（APK动作1墙钟1，Heur动作1墙钟1）；原bounded=10/5/7（APK墙钟1）。原固定结果均保留，不以离线MSE代替胜率。当前原200已完成153，继续扩展开发根。FRAMEWORK_VERIFIED.md已写；deliver.py已250化、包含5臂固定胜场与修订版描述性非退化检查，CURRENT插入句也包含实际胜场。最终追加50不替换原200，既有截图无须。manifest v2包括verifiedFramework/固定胜场/原200+追加50范围。必须等待97524和75725两条控制链完成，不可在pipeline-exit-original200通过时结束。

原200已经全部完成且strict通过：200槽116063动作，归档8局4693动作strict与重跑前缀完全一致，35原完成局SHA保持。原expanded20/臂Heur：stage3 13胜6负1墙钟；pure11胜7负2墙钟；rerank7胜7负6墙钟；原bounded6胜4负6墙钟4决策预算截断。原固定Natural10/6/6，pure10/6/7，rerank10/1/2，oldbounded10/5/7。97524应已exit0，75725已从等待转修订50实际运行，最近7/50自然胜（不是实时计数）；不可再修改修订源码或model/plan。曾内部考虑自然败局/capture回应额外探测，但发现真实淘汰会清空单位且有界响应不承诺穷举，不做任何追加改动；用户指定move→attack/多军问题已覆盖，避免再扩张版本。最终只250槽，不再额外新变体。

当前环境已跨到2026-10-19，实验目录仍20261018立项标识；deliver.py补充completedAtUtc/Local，新增expanded胜场与描述性非退化行，manifest promotionRecommended=false。报告不得只展示固定图小幅提升而隐瞒扩展根退化。最终SOURCE/NN参数与原200/追加50分别冻结，不因结果再调阈值。

全部250槽已完成并strict通过：136511提交动作。修订50：27胜13负4墙钟6决策预算截断，固定10/6/5，扩展6/20；不再迭代调参，搜索提升目标未达成且不晋升。当前75725已应exit0。接下来主代理运行deliver.py，逐文件复核阶段3保全及manifest，检查REPORT/CURRENT。最终要明确实验交付完成不代表搜索胜率提升。Python所有顶层脚本AST通过；pre-delivery git status已保存。

最终保全检查首次失败：PRESERVE中80个阶段2packed pkl缺失，并非哈希内容改写。独立captures/storage-cleanup-20261018-02/result.json列同类缓存清理163件，但无逐件清单，只能类别对应。阶段3全4771、新训练600缓存SHA保持；rows_for只读且contract绝对路径全指新目录。新增preservation_audit.py保留首次失败与清理receipt副本，完整历史快照passed=False，不改expected SHA，不恢复独立清理。deliver改为据实报告此例外并单独核验阶段3与本次训练。

最终REPORT与CURRENT已生成，status=completed_with_observed_battle_regression，完整历史快照False例外已披露。模型SHA=e93a212f07fa7a91348c4e7311dc93f2ece4d3b8ea14d559d40a4d3cbe4f6421；不晋升。verify_delivery.py只读复核清单全部文件、两份实战源码冻结、250槽136511动作、CURRENT旧内容与Python语法。后续若需新一轮优化，应另立实验，不覆盖本次失败与截断。
