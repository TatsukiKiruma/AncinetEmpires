import json, pathlib, shutil, hashlib

P = pathlib.Path(__file__).resolve().parent
load = lambda name: json.loads((P/name).read_text(encoding='utf-8'))
r, gate, dataset, phone = load('trial-results.json'), load('GATE.json'), load('dataset-manifest.json'), load('phone-final.json')
browser = load('trained-browser-parity.json')
assert browser['trainedCheckpointBrowserPassed']
rows = '\n'.join(f"| {i+1} | {r['results']['pc']['trainingSeconds'][i]:.6f} | {r['results']['phone']['trainingSeconds'][i]:.6f} |" for i in range(3))
phase_size = sum(p.stat().st_size for p in P.rglob('*') if p.is_file())
text = f'''# 双人SD编码适配与PC/手机实际试训

2026-10-16完成。编码、候选顺序、独立前向和梯度闸门先通过，再进行两设备各三次实际试训。导出[candidate.json](candidate.json)，没有晋升、接入应用或运行独立棋力评测。

## 实际训练耗时

| 重复 | PC训练秒数 | 手机训练秒数 |
| --- | ---: | ---: |
{rows}
| 中位数 | {r['results']['pc']['medianTrainingSeconds']:.6f} | {r['results']['phone']['medianTrainingSeconds']:.6f} |

本轮手机训练耗时为PC的{r['phoneToPcTrainingTimeRatio']:.2f}倍。进程内端到端中位数分别为{r['results']['pc']['medianEndToEndSeconds']:.3f}秒和{r['results']['phone']['medianEndToEndSeconds']:.3f}秒，包含读取、预热和训练前后诊断，不含数据转换、ADB传输和进程启动；主机墙钟另见逐轮JSON。读取压缩输入本身在手机上约11秒、PC约1.2秒。

PC为AMD Ryzen 7 9800X3D，Java HotSpot 8；手机为MI 8 UD（c2357770、sdm845、Android API29、arm64），ART。两端使用同一份Java数值源码，分别编译为class和dex，float64运算、float32输入。两端训练线程为1、亲和性mask=1、最大堆384MiB；PC为BELOW_NORMAL，手机nice=19、使用最高频率1766400的小核。此为小模型、后台限额和不同运行时下的实际对比，不能外推为设备满性能或大模型训练速度。

每次均由相同初始权重重置，预热后以相同序列训练2400条，batch=8、300步、SGD学习率0.02、梯度范数裁剪1；policy监督学习，value头冻结，无RL。三次重复均独立从初始权重开始，不是连续训练900步。两端最终权重最大差{r['crossDeviceWeightMaxError']:.3g}；同设备重复最大差{r['withinDeviceWeightMaxError']:.3g}。实际改变{r['changedPolicyParameters']}个policy/共享编码参数，value头权重逐字节保持。

两端训练内加权交叉熵均从3.284169下降至2.798303，训练内top1从0.67%升至34.42%。这只能证明优化器和标签链能够工作，不能证明独立泛化或棋力提升。value输出没有结果训练或校准；共享编码更新也会改变value前向。

## 输入与模型范围

首个双人SD来源桶仍为原生1922父局、666578个合格原子policy标签，真实2份响应、445个合格policy标签；所有合格数据仍归train，现有数据没有划作测试集。

本轮小规模抽样为1955条原生+445条真实，共2400条：每个原生父局按SHA选一个合格段，再在其前32个合格原子内抽1条；另33条在完整合格段范围内抽样。真实双人SD全部445条纳入。覆盖行动方0/1共1584/816条、回合1至10016；详细地图、来源和原子定位见dataset-manifest与witnesses。样本偏向段首，不能视为全部原子均匀抽样。原生宏标签使用1/k权重，不把宏展开子步解释为新的原生教师查询；真实投降标签继续屏蔽。

新共享推理模块为src/ai_runtime/sd_v1，与训练器及规则引擎分离。完整可变长地形、玩家/规则、单位、墓碑输入，无单位槽位或裁图截断。保留经验、状态计时、移动余量、行动/治疗/支援锁、pending来源、指挥官身份、移动覆盖与堆叠实体。ID只解析引用；元数据、序列化来源字段和无战役语境的脚本ID按observation.ts明确排除。非空战役/脚本状态、未知规则或schema字段拒绝，不静默落入默认值。

固定schema为301维稀疏实体字段、77维动作字段，实体嵌入8维，四组均值和计数汇聚，候选连接行动者、目标单位/墓碑、落点地形实体后评分，独立value前向，总3566参数。使用新随机初始权重，没有复用旧34通道网络。当前schema只对本轮消费样本及声明的语义反例放行，尚未声称全部666578+445条都完成模型适配。正式全量训练前仍须流式检查完整桶，发现新字段时扩展schema并重跑闸门。

完整合法候选按actionCode码点升序；原生先验其规范顺序和前后态SHA，真实先验原engine顺序、候选SHA和规则态SHA，再以动作码双射映射标签。两类来源分别使用其初次收益合同；不拼接旧候选索引。

## 验收证据

- GATE.json在任何训练更新前生成，绑定源码、schema、初始权重、数据、dex与全部前置验收结果；run_devices在训练前逐项核对。
- 2400个实际状态、136857个完整合法候选均完成独立Python/TS编码、PyTorch/Node/真实Chrome/PC Java/手机ART前向对照；稳定argmax全部相同。初始logit最大差约1.11e-16，梯度最大差约1.04e-16；40参数有限差分最大差约1.67e-10，预设阈值未放宽。
- 语义反例覆盖经验、移动余量、状态计时、突击/治疗/支援锁、pending来源、堆叠单位、40单位无截断、未知规则拒绝以及候选反序输入。真实样本未出现recruit_and_deploy，本轮不声称该动作已有真实样本覆盖。
- 训练后candidate在实际Chrome重新核对2400状态，logit最大差{browser['logitsMaxError']:.3g}，argmax全部一致。浏览器权重可通过observe→encode→forward加载；未改现有UI或已发布策略。
- 公共npm run lint、npm test（28文件347测试）、npm run build通过；本阶段tsconfig独立类型检查、独立编码/梯度/设备/浏览器检查通过。初次沙箱测试缓存和Chrome权限问题在正常本机权限下重试解决。
- 原生37项与真实60项原源码身份保持；封存目录23270文件逐一SHA复核无变化，DELIVERY_MANIFEST的SHA仍为60696515a98d7d1c9885fd48bb084d714fc1dd7a45002a12057c21db7db2b81f。没有改写封存数据的modelSchemaAccepted标志。

## 采集与磁盘

没有进入采集APK、切换前台、停止或重启APK/Frida/采集器，也没有写采集目录。监测期间采集APK无PID；原Frida监听服务9236一直可见，结束时路径与监听参数保持。这个观察不能证明采集正在进行，未擅自启动采集。所有负载位于独立dalvikvm进程，任务结束未观察到残留训练进程。资源保护器每约3秒检查，采集APK出现、温度≥38°C、可用内存<1GiB或/data空闲<2GiB时只终止自己的绑定PID。

本轮最高电池温度{r['resources']['maxBatteryCelsius']:.1f}°C，最低可用内存{r['resources']['minAvailableMemoryBytes']/1024**3:.2f}GiB，最低手机空闲{r['resources']['minPhoneFreeBytes']/1024**3:.2f}GiB。手机专用目录{phone['remoteAllocatedBytes']/1024**2:.2f}MiB，保留输入和设备证据；未清理历史手机数据。

报告生成前本轮PC目录约{phase_size/1024**2:.1f}MiB，C盘空闲约{shutil.disk_usage(P).free/1024**3:.2f}GiB，低于512MiB新增预算并保留超过12GiB。已核对压缩文件可恢复原SHA后删除本轮唯一122578888字节未压缩中间文件，保留trial.bin.gz，不删除历史模型或数据。

## 重现入口

从仓库根目录执行build_dataset.ts生成固定抽样和schema；使用现有R8 venv的Python运行reference.py生成独立参照与trial.bin，再按已记录的确定性gzip方式生成trial.bin.gz。tools/downloads.json记录固定编译工具URL及SHA，Java以source/target 1.6编译，dx转换dex。check_node.ts、browser_runner.mjs和run_devices.py verify通过后运行gate.py，最后run_devices.py train。不能跳过闸门；训练器仅接受绑定输入与源码。编译和运行参数详见PLAN及run_devices源码。summarize_trial.py导出candidate与参照，post_browser_runner.mjs验收训练后权重。

独立评测继续采用上一阶段的新父局协议，本轮没有生成或消费独立评测数据。后续扩大训练前，应先完成整个双人SD桶的流式schema核查，再准备独立对局验收；本轮试训模型不作为已增强棋力的发布模型。
'''
(P/'REPORT.md').write_text(text, encoding='utf-8')
current = P.parent/'status/CURRENT.md'
old = current.read_text(encoding='utf-8')
entry = '''## 2026-10-16双人SD适配与两设备实际试训完成

见[报告](../sd_adapter_trial_20261016/REPORT.md)、[闸门](../sd_adapter_trial_20261016/GATE.json)、[实际试训结果](../sd_adapter_trial_20261016/trial-results.json)和[试训权重](../sd_adapter_trial_20261016/candidate.json)。2400个实际状态、136857个候选已通过独立Python/TS、真实Chrome、PC Java和手机ART前向/梯度验收；两端各3次、每次300步小规模policy试训完成。训练耗时中位数PC 0.352秒、手机MI 8 UD 11.842秒，约33.66倍；这是3566参数、单核后台设置下的对比，不代表满性能。

全部合格数据仍归train，本轮只训练1955原生+445真实条；完整桶尚未全量模型schema放行，未运行独立棋力评测、晋升或接入应用。value头冻结。封存23270文件SHA全部保持；本轮PC新增约48MiB、手机约6.61MiB。未操作采集APK/服务；监测时采集APK无PID，原Frida服务9236保留，不能据此称采集正在继续。历史来源层验收“未训练”仅描述上一阶段，未改写历史结论。

'''
if '## 2026-10-16双人SD适配与两设备实际试训完成' not in old:
    current.write_text(old.replace('# 当前接手状态\n\n', '# 当前接手状态\n\n'+entry, 1), encoding='utf-8')
print(json.dumps(dict(report=str(P/'REPORT.md'), phaseBytes=phase_size, freeBytes=shutil.disk_usage(P).free)))
