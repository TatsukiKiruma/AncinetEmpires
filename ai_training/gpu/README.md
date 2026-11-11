# GPU采集与完整2M训练

若要使用当前项目困难AI复刻采集，请阅读[GPU采集简短指南](DATA_COLLECTION_QUICKSTART.md)和[优化汇总](OPTIMIZATION_SUMMARY.md)。本页下方是独立2M神经模型链，其`prepare.ts`与严格回放入口不适用于当前困难AI记录，也不代表获准恢复采集、回放或训练。

此目录提供独立桌面入口。保留现有手机采集、手机训练、历史模型及应用界面；所有实验写入新建的 `runs/` 子目录。网络复用 `expert_iteration_2m_20261022/model.py` 的 1,966,910 参数模型，批量前向从同目录实现移植，仅将中间张量分配到输入设备。

## 加速边界

- **训练**：网络前向、反向、AdamW更新在GPU执行。CPU负责读取gzip、校验和组批。
- **项目引擎自对局**：CPU复用权威GameEngine、合法动作及编码器；多个对局的网络前向合并到常驻GPU进程。不是4秒束搜索，也不是原APK困难AI。
- **手机原APK采集**：原生AI逻辑不是PyTorch网络，不能通过 `--device` 迁移到电脑GPU。本实现没有改变这条手机任务。

AMD ROCm仍使用PyTorch的 `cuda:0` 设备名称。显式请求GPU但不可用时直接报错，只有 `auto` 允许自动选择CPU。

## 环境

本机RX 9070 XT使用独立Python 3.12环境 `ai_training/.venv-rocm`，固定PyTorch 2.9.1+rocm7.2.1。安装命令：

```powershell
powershell -File ai_training/gpu/setup_rocm.ps1
```

AMD官方Windows文档仍将机器学习训练列为不支持；通过本项目算子测试仅说明当前机器/版本能运行，不代表官方训练支持。Linux/WSL使用对应官方ROCm PyTorch环境，也可运行这些Python入口。不要在其他显卡上盲目安装Windows AMD wheel。

- [官方Windows安装说明](https://rocm.docs.amd.com/projects/radeon-ryzen/en/latest/docs/install/installrad/windows/install-pytorch.html)
- [官方限制](https://rocm.docs.amd.com/projects/radeon-ryzen/en/latest/docs/limitations/limitationsrad.html)

本机受限执行环境曾导致MIOpen锁文件失败；非沙箱执行并使用独立可写的新缓存目录后通过。不要并行删除运行中的锁文件；失败缓存保留供诊断。下列环境变量只影响当前PowerShell及其子进程，不修改系统设置：

```powershell
$env:MIOPEN_USER_DB_PATH = 'C:/code/AncinetEmpires/ai_training/gpu/runs/miopen-db-clean'
$env:MIOPEN_CUSTOM_CACHE_DIR = 'C:/code/AncinetEmpires/ai_training/gpu/runs/miopen-cache-clean'
$gpuPython = 'C:/code/AncinetEmpires/ai_training/.venv-rocm/Scripts/python.exe'
& $gpuPython -X utf8 -m unittest discover -s ai_training/gpu -p test_gpu.py -v
```

## 训练

从随机初始化训练100个既有已准入父局一遍（73,112条状态、有效batch 8、9,139次更新）：

```powershell
& $gpuPython -X utf8 ai_training/gpu/train.py --device cuda:0 --out ai_training/gpu/runs/my-train100
```

默认FP32，微批次8；不同地图尺寸只拆微批次，完整有效批次的归一化、尾批、候选全集、policy/value mask均保留。损失沿用100局手机试训：全部候选加softPriors后的策略CE，以及自然赢家六槽CE加Brier槽求和。学习率沿用原参考调度725,697次更新和5%预热，不能把一次小规模试训当作充分收敛或棋力提升。

`--device cpu` 可作对照；`--max-updates 100` 是800条状态的短测，输出标记 `smoke_only`，不称为100局训练。`--microbatch 1` 可降低显存；改变 `--batch-size` 会改变优化过程。

输出含环境/源码/数据摘要、初始与最终模型、完整模型和优化器检查点、耗时、实际更新数和显存峰值。输出目录必须不存在。此入口是有限单遍基准，不自动恢复、部署或追加训练；异常生成 `ERROR.json`，不生成成功回执。最终检查点保留优化器/调度器/RNG，可供后续显式实现续训。

## 生成对局及训练分片

```powershell
node ai_training/run.mjs node --import tsx gpu/collect.ts --python $gpuPython --device cuda:0 --model C:/code/AncinetEmpires/ai_training/phone_2m_continue414_20261027/completion/job/output/final --games 100 --parallel 16 --out C:/code/AncinetEmpires/ai_training/gpu/runs/my-collect100
node ai_training/run.mjs node --import tsx gpu/verify_collection.ts gpu/runs/my-collect100
node ai_training/run.mjs node --import tsx gpu/prepare.ts gpu/runs/my-collect100 gpu/runs/my-dataset100
& $gpuPython -X utf8 ai_training/gpu/train.py --device cuda:0 --dataset ai_training/gpu/runs/my-dataset100/DATASET.json --data-dir ai_training/gpu/runs/my-dataset100 --parents 100 --out ai_training/gpu/runs/my-selfplay-train100
```

采集默认Duel地图、固定随机种子、全候选softmax温度1加既有softPriors，双方共用指定模型。`--max-steps` 默认2000；自然结束、动作截断、运行错误分别记录。时间包括IPC、CPU规则/编码、GPU推理和轨迹写盘。不同设备浮点误差可能引起采样轨迹分歧，不能把整局耗时直接解释成纯GPU算子加速比。

转换器再次严格重放并复用权威编码和六槽标签；仅自然终局产生value标签，截断前缀只保留policy标签。自对局模仿数据不保证提升棋力。本目录新数据只用于独立工程训练，没有自动去重并加入现有训练/验证划分；正式模型训练前需另做谱系排重、数据划分和准入。

## 检查

```powershell
node node_modules/typescript/bin/tsc --noEmit -p ai_training/gpu/tsconfig.json
& $gpuPython -X utf8 -m unittest discover -s ai_training/gpu -p test_gpu.py -v
```

检查覆盖原网络与批量前向、完整批次与微批次梯度、CPU/GPU前向和梯度、GPU AdamW全参数状态。GPU不可用时GPU项明确跳过，不算通过。
