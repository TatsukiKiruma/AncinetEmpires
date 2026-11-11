# 第三阶段当前接手入口

2026-10-31最新：100k Mac分支后继验收已完成，唯一候选40000、先验1.0，开发最多三个权重点及一次329父局离线＋54局基线/候选配对测试均闭合。正式REPORT.md和OMNI_BASE_MODEL_MANIFEST.json已交付，D盘`D:\AncientEmpiresData\continuation_stage3_20261030_v1\acceptance_mac100k_20261031_v1`。未加训、修改公共规则、替换UI或启动第四阶段。旧“待验收/训练中”条目不再是实时状态。

2026-10-31最新Mac成果已取回：用户明确授权取回。Mac已于08:53:25完成100000更新、3200000样本并退出。全部460个成果/工程证据文件、203个现存正式检查点已复制到`D:\AncientEmpiresData\continuation_stage3_20261030_v1\macbook_air_v1\returns\return-20261031T090130-f05d066d`，归档和每个文件SHA均通过。100k完整断点SHA `569e30b3531914798aa8010af6ebba3a193fcb4a133ea6d94511356c2890be57`，推理bin逐张量核对；1至100000完整指标、冻结输入16298文件本机路径和SHA谱系均已验证。Mac原件及环境保留，无新训练/评测/实战/封存操作。100k诊断degraded=true、plateau=true，尚未选最佳；阶段三最终验收未完成。当前收据`macbook_air_v1/RETURN_LATEST.json`，D盘入口README.md。历史“训练中/待取回”条目不再是当前状态，不得据此恢复任何任务。

2026-10-30最新追加并行补测：用户询问能否继续增加。已从14850完整点暂停，补测3worker及6线程；2线程2worker仍最快（同批0.269224秒/更新、CPU平均31.83%），其余更慢。未修改生产参数或合同，已从原正式点精确恢复，末次观测15022更新，监听停止，训练继续。证据见 `macbook_air_v1/MORE_REPORT.md`、`MORE_RESULT.json` 和 `MORE_RESUME_VERIFIED.json`。三星未操作，无封存访问。

2026-10-30最新Mac平衡调优：用户授权测试后选择有CPU余量的配置。Mac已在10958更新完整暂停、备份旧代码与状态，六组工程对照后采用1训练进程＋2计算线程＋2编码worker。编码样本/顺序和采样随机状态核验一致；工程权重未晋升。已从原点正式完成10959、闭合并由LaunchAgent精确恢复，不重置学习率或prior日程。新合同 `570daeee4786796971e67627a2e56e9476d5baf7fd3164dc7af67b8ede410eab`。正式额外200更新平均0.423139秒/更新，整机平均CPU29.53%、P95 35.20%；末次观测11441更新。监听已结束，训练继续，三星未修改。当前信息优先读 `macbook_air_v1/ACTIVE_TUNING.json`、`macbook_air_v1/TUNING_REPORT.md`，旧DELIVERY/500测速为历史；不要恢复旧运行配置、重新启动重复训练或新增自动监听。Mac仍在原目录，用户LaunchAgent标识不变。

2026-10-30最新三星收尾：用户要求停止训练并清理。已在5321更新、170272样本完整保存退出，全部专属任务目录约6.9GB完整取回到`D:\AncientEmpiresData\continuation_stage3_20261030_v1\phone_samsung_v1\closeouts\20261030T215659`，归档及43677普通文件SHA和最新导出逐张量均通过。完整断点SHA `5d8a58fe2f55a0172eada7eb7a29190608f0fd3c099ac0b0ae9bed27a0069763`。手机训练根目录、专属开机入口和已核验传输临时文件均已清理，通用Termux应用环境和其他手机文件保留。证据见`phone_samsung_v1/PHONE_TASK_CLOSED.json`及D盘收尾REPORT.md。三星任务已关闭；后续读取该收尾记录，不再访问已删除的手机训练路径。Mac继续既有独立分支，未发送任何Mac命令或停止指令，外部监听保持已结束。Windows原训练和原自动跟进仍暂停，封存验收仍未执行。

2026-10-30最新Mac分支：用户授权从4500检查点在MacBook Air独立训练，三星不停止。已在`/Users/larovinson/aeii-stage3-omni-from4500-20261030-v1`通过用户LaunchAgent启动M4 CPU分支，冻结合同SHA `7662ee2447bcbb088d73d07fb65b7498ecd73e427d4f6494cdcb8c5f154a6144`。MPS因确定性scatter_add未通过，已归档预检并选择通过梯度和逐位恢复验证的CPU。正式4501闭合后由独立进程精确恢复。用户追加要求只监听500更新，已完成5166→5666、236.298秒，0.472595秒/更新；当前末次观测5678更新。监听已停止，训练继续；不要新增自动跟进。完整证据见 `macbook_air_v1/REPORT.md`、`macbook_air_v1/DELIVERY.json` 和 `macbook_air_v1/MONITOR_500_RESULT.json`。Mac完成后保存停止，待用户通知取回，最终全局候选/唯一封存验收预算不翻倍，未执行任何封存测试。三星未发送停止或修改指令，手机当前未连接USB。Windows训练/自动跟进仍暂停。

2026-10-30最新：用户要求取回4400版本，核对无精确4400快照后，明确选择4500版及对应数据。已取回并验收，位置为 `D:/AncientEmpiresData/continuation_stage3_20261030_v1/phone_samsung_v1/returns/20261030T204810-71377923`，入口README.md。完整4500检查点SHA256为 `93db8a6361ee127f44142e54f6d1987677c011b25eb5691dc5030218aa3d50b5`；导出bin逐张量与原断点一致，完整1至4500指标及曝光统计均保留。51个手机快照文件传输SHA通过，本机已有冻结输入16305文件、4927292675字节重新逐文件核SHA一致。C盘收据为 `phone_samsung_v1/RETURN_RECEIPT-20261030T204810-71377923.json`。取回后手机观测4610更新，继续训练；电脑仍暂停，没有进行离线/实战评测、封存验收或应用部署。邻近4390原断点也作为取回过程的原始备份保留，没有伪造4400版本。后续最终成果仍待用户明确通知再取回。

原离线要求已执行：电脑暂停，三星独立离线续训，目标累计100k，允许超过12小时。不要恢复主机训练或自动取回。手机交付已通过，可拔线；交付时观测累计2801更新、89632样本，完整交付见 `phone_samsung_v1/PHONE_DISPATCH_REPORT.md` 和 `phone_samsung_v1/SAFE_TO_DISCONNECT.json`。

主机在2761更新、88352样本完整安全点闭合。检查点：`D:/AncientEmpiresData/continuation_stage3_20261030_v1/run-v2-batch8/training/checkpoint-02761-fefbb2c8a29c4393abb2ff00562824f8.pt`，SHA256 `865312b2a0950f180d2e374e457f41d3d8c72f1688095d4ca5400ff3ce1db360`。100k日程没有重启或拼接。同臂主机累计894.5950205秒。原84更新串行记录和v2原件均保留。PIPELINE_STATUS为stopped/explicit_stop，自动跟进100k已PAUSED。阶段一、二和原2414起点未修改。

手机：SM-N9500/Android9/ARM64，ADB序列号ce071717887a94940b7e，任务根目录 `/data/data/com.termux/files/home/aeii-omni-stage3-20261030-v1`。非root Termux0.118.3、Termux:Boot0.8.1、Termux:API0.53.0、私有Ubuntu24.04、Python3.12、PyTorch2.14.0+cpu、NumPy2.5.4、Node22.14。运行时已全部装齐。首次引导失败目录和日志保留；初始化、签名来源、逐文件摘要、CPU网络与断点恢复证据均在手机子目录。仅移除已验证且D盘完整归档的一次传输tar临时副本，没有删除模型或历史证据。

载荷4604训练父局（old2414/new2190）、紧凑3555175位置表、冻结1299态开发张量。完整输入包4.944680960GB、16311文件，SHA逐文件通过。封存测试原态和OMNI测试初态没有打包，最终测试执行次数0。手机保留原effective32、真实micro8、配比、mask、dropout、学习率和先验100k余弦日程；每20k固定开发诊断及原早停，500更新永久检查点、300秒双槽恢复、原子fsync持久化。温度45/42℃、电量20/25%、磁盘2/2.25GiB暂停/恢复。控制器和训练器独立会话、本机stdio、部分唤醒锁、互斥及意外进程退出限3次重试；开机解锁入口已设置，物理重启未测试。

交付工程自检权重明确不可晋升；正式手机从原2761起点完成一次更新至2762、闭合进程后独立控制器恢复。完整模型、AdamW、采样器、dropout和CPU RNG已精确恢复，GPU状态只保留来源原件及身份，未伪称跨硬件GPU随机状态可运行。ADB停止40秒及熄屏期间训练继续推进。原始12小时上限不约束手机墙钟，但更新边界100k和既定早停继续生效。完成保存停止，手机通知用户，不自动传回、不执行实战选择/封存测试、不进入第四阶段。

用户以后通知连接取回时：先只读核验手机DELIVERY_RECEIPT、MOBILE_CONTRACT、检查点链、COMPLETE/RESULT、metrics及RUN_CLOSURE；保留手机原件，复制到新的D盘成果目录并校验SHA。若仍在途先按完整边界停止后取回。继续阶段三开发候选选择：40k/100k及最多一个离线最佳、OMNI开发54局和既有历史40局对照。只在锁定唯一候选及先验后，执行一次329父局封存离线+54局配对最终验收。最终完成前不要记阶段三通过。完成后停所有进程并提交stage3/REPORT.md。禁止自动部署或第四阶段。
