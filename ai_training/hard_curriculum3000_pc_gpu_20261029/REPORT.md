# 第2001—3000局电脑GPU采集接手报告

2026-10-29。**冻结与兼容性检查完成；生产采集未启动，等待用户选择原生来源或GPU神经采集路径。** 本批仍是1000局采集任务，不是训练模型权重。

本机RX 9070 XT当前GPU张量检查通过。指定APK困难决策由Android WebView JavaScript及Java回退执行，当前没有GPU计算入口；标准JVM也无法直接装载APK的DEX／Android类。现有GPU模块使用2M神经模型，不能直接替代原生困难教师。完整证据和可执行前置步骤见[适配设计](ADAPTATION_DESIGN.md)。

## 已冻结的第三批

| 类别 | 计划 | 自然完成 | 未尝试缺口 |
|---|---:|---:|---:|
| 正常 | 100 | 0 | 100 |
| 参数变化 | 100 | 0 | 100 |
| 优势／劣势残局 | 300 | 0 | 300 |
| 多单位均势 | 200 | 0 | 200 |
| 高阶兵种 | 100 | 0 | 100 |
| 技能 | 100 | 0 | 100 |
| 建筑收尾 | 100 | 0 | 100 |
| 合计 | 1000 | 0 | 1000 |

实际双人400、三人300、四人300，全部二十张地图保留。前42条为二十一格各两局，包含于1000。首条执行局号2001对应`hc7-20261027-1014`、seed`2030001014`、Duel、小劣势双人预设，初态SHA为`3ae606c9eed91f035a4c2bc068370153adf481258cb62963a1ab8e47fefbd608`。没有按设计槽位行号截取或重新洗牌。

800份完整派生初态的摘要与原件匹配；另200份正常／参数开局保留原生地图初始化语义。人口20／30／50分别25／549／426局。Mourningstar、The Crucible、Waterways、Winterstorm的既有近似地形标记原样保留，涉及本批163局；原生地图字节检查全部匹配，没有放宽可信度。

类别、人数、地图和二十一格的目标与缺口在[RESULTS.json](RESULTS.json)，完整输入在[JOBS.json](JOBS.json)，来源及逐job摘要在[INPUT_IDENTITY.json](INPUT_IDENTITY.json)。原job中的历史`device=unassigned`未改，新设备分配另见[ASSIGNMENT.json](ASSIGNMENT.json)；新授权见[AUTHORIZATION.json](AUTHORIZATION.json)，旧授权已保留。

## 当前真实状态

实际父局启动0、自然完成0、运行错误0、初态不符0、动作／时间截断0、观察门禁跳过0、未尝试1000。零错误只表示没有运行，不能称“1000局无错”。没有生产进程或后台采集启动命令；所有诊断进程均为有限检查，命令、PID及解释器身份在对应证据中。

`PARENT_LEDGER.json`逐父局记录未尝试原因；`ATTEMPTS.json`为空且保留下一实际runOrdinal=1。恢复时先读取[RUN_STATE.json](RUN_STATE.json)并重新核对输入身份，不能重置次数或复用成功局生成新配额。

没有连接、操作、停止或重发两台手机任务，也没有从前2000局搬补缺口。本目录所有新产物独立保存，历史资产及共享工作区保留。盘前检查C盘空闲34,507,575,296字节（约32.14GiB），准备后仍约32GiB；最终空间和目录体积见`DELIVERY_MANIFEST.json`。

## 本轮检查

- 独立5项合同回归通过，覆盖精确局号筛选、完整对象保全、配额与初态身份，以及拒绝改seed、缺字段、人数缩减等错误。
- GPU显式`cuda:0`张量检查通过，实际结果357389824，与CPU整数参考一致；没有加载模型或创建优化器。
- 原HTML20／30／50人口三个版本的桌面CPU初始化加载通过；决策调用0、对局0、原生初态构造0。不能等同原生端到端验收。
- 指定APK SHA、HTML SHA、全部二十张地图与本地解包来源检查通过。Downloads旧路径失效的首次失败证据保留，随后复用仓库既有同SHA APK完成。
- Java诊断类编译执行成功；三项原生／Android类查找均失败，明确排除直接把APK放到标准JVM classpath的现成方案。
- 公共代码未修改；本轮不运行含重放用例的公共全套测试，也没有重跑旧GPU100局基准。历史公共检查通过、训练工作区旧版本检查失败仍是历史结论，不冒称本轮全量验证通过。

本轮strict、forced、APK原生重放全部`disabled_by_user`，没有训练、生成训练张量或自动准入，既有2414／268分区不变。

## 运行命令与下一步

以下是**已经运行的诊断／静态复核命令**，不是生产启动命令。探针证据拒绝覆盖，重复检查须另建输出，不能删除旧记录。

```powershell
node ai_training/hard_curriculum3000_pc_gpu_20261029/prepare.mjs
node --test ai_training/hard_curriculum3000_pc_gpu_20261029/test_contract.mjs
node ai_training/hard_curriculum3000_pc_gpu_20261029/probe_host.mjs
node ai_training/hard_curriculum3000_pc_gpu_20261029/probe_jvm.mjs
& 'C:/code/AncinetEmpires/ai_training/.venv-rocm/Scripts/python.exe' -X utf8 ai_training/hard_curriculum3000_pc_gpu_20261029/probe_apk.py ai_training/hard_native_3000_20261022/assets/hard-target.apk APK_PROBE_LOCAL.json
& 'C:/code/AncinetEmpires/ai_training/.venv-rocm/Scripts/python.exe' -X utf8 ai_training/hard_curriculum3000_pc_gpu_20261029/gpu_probe.py ai_training/hard_curriculum3000_pc_gpu_20261029/evidence/GPU_PROBE.json
```

需要选择：①保留原APK来源，允许电脑Android宿主CPU执行，先完成宿主验收再用本批观察局推进；②改为2M模型GPU多场景自对局，完成完整初态适配并以不同来源另计；③保持原生＋GPU要求，暂不采集。未获来源／计算方式变更前不启动生产。选择原因是已验证的技术边界，不是重复索要既有第三批启动授权。
