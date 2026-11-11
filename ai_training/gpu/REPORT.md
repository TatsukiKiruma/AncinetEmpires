# GPU实现与实测报告（2026-10-29）

已在本机 **AMD Radeon RX 9070 XT** 上跑通GPU训练和项目引擎GPU批量推理采集，并完成100局采集到随机初始化完整2M模型训练的闭环。原手机APK采集、手机训练、已发布模型和UI未修改。

## 同一批100局端到端结果

| 阶段 | 实测耗时 | 结果 |
| --- | ---: | --- |
| GPU批量推理自对局 | 214.216秒 | 100局自然结束，0截断，24,536动作 |
| CPU严格重放与编码 | 144.204秒 | 100父局、24,536条状态；每局摘要及原始来源身份记录 |
| GPU随机初始化2M训练一遍 | 85.913秒 | 3,067次AdamW更新，全部1,966,910参数进入优化器 |
| 上述三阶段合计 | **444.333秒（约7分24秒）** | 不包含依赖安装、另行运行的检查及阶段间人工停顿 |

采集配置：Duel单图、16局并行、seed 20261029、两边使用已有2414局模型、全候选softmax温度1加既有softPriors；每局上限2000动作，本次没有触发上限。这是项目引擎自对局，不是手机原APK困难AI采集，也不使用4秒束搜索。100局共享地图/开局模板，不能当作100种独立场景或独立棋力验证集。

训练配置：新模型随机初始化seed 20261024，不加载已有权重；FP32、有效batch 8、微批次8、单遍、全部候选与实体保留；沿用原100局手机试训的策略CE、自然胜负六槽CE+Brier和学习率调度。100局在训练前全部经独立严格重放，转换器再次验证每一步。全部194个参数张量均更新，峰值张量显存203,185,664字节（约194MiB）。此显存指标为PyTorch最大allocated，不含驱动、缓存等整卡占用。

训练进程总耗时85.913秒；其中数据迭代至最终保存82.555秒，训练循环82.429秒，数据读取4.712秒，计算77.332秒。导出的新模型105个跨语言样本全部通过，logits、概率和value与高精度PyTorch参考最大绝对误差均为0。模型可运行和损失下降不代表棋力提升，未部署到应用，也未混入历史冻结训练/验证集。

结果入口：

- [采集回执](evidence/collect100-result.json)、[独立严格重放](evidence/collect100-strict-replay.json)、[采集配置与模型身份](evidence/collect100-run.json)
- [编码耗时](evidence/prepare100-time.json)、[训练分片manifest](evidence/generated-data100-manifest.json)
- [训练回执](evidence/generated-train100-result.json)、[配置和源码身份](evidence/generated-train100-run.json)、[进程计时](evidence/generated-train100-process-time.json)、[跨语言一致性](evidence/generated-train100-node-parity.json)
- 本地新模型：`runs/generated-train100/final.bin`、`final.json`；完整模型/AdamW/调度器/RNG状态：`checkpoint.pt`。大文件和数据未纳入Git。

## CPU/GPU对照与额外完整100局验证

同一PyTorch版本、同一seed、相同前800条已准入状态、100次更新、4个CPU线程、有效/微批次均为8：

| 设备与口径 | 训练循环秒数 |
| --- | ---: |
| CPU | 24.474 |
| RX 9070 XT，部分首次内核准备 | 15.222 |
| RX 9070 XT，重复形状缓存已准备 | 8.183 |

缓存准备后的短测吞吐约为CPU的 **2.99倍**；这不是完整对局生成或整个训练流水线的加速倍数。CPU/GPU最后一批loss分别为11.9366207/11.9366226。数值不承诺逐位相同，专门测试检查了前向和梯度容差。

另对原 `phone_2m_scratch100_20261024` 的已准入100父局 **73,112条状态** 跑完随机初始化新2M训练一遍：9,139次更新，训练循环440.310秒，含最终保存440.516秒（不含Python导入和模型初始化），峰值张量显存约206MiB，194个张量均更新，105个跨语言样本通过，最大logits误差3.815e-6。该数据集与上面新采集的100局不同，不能按“每100局”直接比较耗时。

证据：[CPU短测](evidence/cpu-bench100-result.json)、[GPU短测](evidence/gpu-bench100-result.json)、[原已准入100局完整训练](evidence/train100-result.json)、[对应运行身份](evidence/train100-run.json)、[对应跨语言检查](evidence/train100-node-parity.json)。

## 加速边界和环境限制

GPU负责神经网络前向/反向和优化器更新；权威GameEngine、合法动作、编码和gzip仍在CPU。100局采集中的编码耗时154.544秒、推理及IPC48.527秒、规则执行和写盘10.353秒；编码约占总时间72%，目前已是主要瓶颈。没有运行同口径CPU完整100局采集，不能声称对局生成整体加速了3倍。

手机原APK困难AI使用原生程序逻辑，不是上述PyTorch网络，不能通过设置device迁移到电脑GPU。现有手机独立任务保持原样。

初始训练环境是PyTorch 2.14.0+cpu；新建独立 `ai_training/.venv-rocm`，安装Python 3.12对应的AMD官方PyTorch 2.9.1+rocm7.2.1。实际ROCm HIP版本7.2.53211，显卡驱动注册信息32.0.32015.7029，运行时只枚举到RX 9070 XT。包列表见[环境证据](evidence/environment.txt)。没有更新显卡驱动或修改系统安全设置。

AMD对该版本Windows环境仍明确列出“无机器学习训练支持”；本次是本机模型算子的实测成功，不代表官方支持承诺或其他机器都能运行。[官方安装说明](https://rocm.docs.amd.com/projects/radeon-ryzen/en/latest/docs/install/installrad/windows/install-pytorch.html)、[该系列Windows限制](https://rocm.docs.amd.com/projects/radeon-ryzen/en/latest/docs/limitations/limitationsrad.html)。

受限执行环境首次出现用户缓存目录权限失败；改为项目缓存后留下了失败锁，后续出现锁超时。保留这些失败记录，使用新缓存目录且在非沙箱环境执行后通过；没有删除运行中锁或关闭系统安全功能。完整73,112状态训练在约第7,400次更新附近出现一次MIOpen算法计时告警，随后继续完成；没有将该日志隐藏或当作所有Windows算子均稳定的证据。

## 实现与检查

独立模块分为设备/身份、分片解码、批量前向、损失、训练器、常驻推理桥、采集、严格重放和数据准备。复用现有2M网络和权威规则/编码，不修改公共游戏实现。显式GPU请求失败会报错；`auto`才允许CPU回退。所有实验要求独立输出目录，异常有错误回执，不能自动覆盖旧产物。

- 新模块TypeScript检查通过。
- Python真实样本3项检查通过：单条原网络与批量前向、微批次与整批梯度、CPU/GPU前向/梯度和GPU AdamW全参数状态；包含不同实体数量的真实前态。
- 100局独立严格重放通过；两个新模型各105个跨语言样本通过。
- CPU小规模采集→转换→训练闭环通过，截断样本valueMask关闭。
- 公共 `npm run lint`、`npm test`、`npm run build` 通过；公共测试517通过、20跳过，跳过项不记为通过。
- 训练工作区 `npm --prefix ai_training run lint` 有12个旧版本类型错误；`npm --prefix ai_training test` 为72文件通过/18文件失败、448测试通过/63失败，另有未发现测试套件等收集错误。错误位于未修改的历史版本工具、合同和已退休数据相关测试，本次未修复；训练工作区全量检查不能记为通过。完整记录在 `training-lint.log`、`training-test.log`。

运行方法见[使用说明](README.md)。这些入口是有限单遍训练和工程基准；不自动部署模型，不自动续训，也不提供断点恢复命令。最终完整检查点保留供后续显式恢复实现使用。
