# 双流 v2 阶段 1 验证与流式入口

公共契约见 `../../src/ai_runtime/dual_v2/README.md`。本目录只做数据适配、几何增强和验收，无优化器更新或对战运行。

## 重跑

在仓库根目录运行，Python解释器需安装NumPy与PyTorch：

```text
node ai_training/run.mjs node --import tsx dual_stream_v2_phase1_20261020/build_manifest.ts
node ai_training/run.mjs node --import tsx dual_stream_v2_phase1_20261020/source_coverage.ts
node ai_training/run.mjs node --import tsx dual_stream_v2_phase1_20261020/gates.ts multiplayer
node ai_training/run.mjs node --import tsx dual_stream_v2_phase1_20261020/gates.ts data
node ai_training/run.mjs <Python解释器> -X utf8 dual_stream_v2_phase1_20261020/verify_bridge.py
node ai_training/run.mjs node --import tsx dual_stream_v2_phase1_20261020/gates.ts speed
npx tsc -p ai_training/dual_stream_v2_phase1_20261020/tsconfig.json --noEmit
npm run lint
npm test
npm run build
```

性能门禁应在上述其他进程结束后单独运行；不挑选或删除计时样本，全部200次保存在收据。manifest构建固定种子，变更来源或排重集合须作为新版本登记；未来新增评测不能悄悄覆盖本阶段已冻结身份。

## 流式消费

`streamDataset(manifest, 'train'|'dev', stats)` 是async generator。每次输出一个完整GameState、当前完整合法集合、按encodeAction重映射的targetIndex、来源身份、宏步1/k权重和valueMask。随后 `encodeSample(sample, symmetry)` 在线生成双流TypedArray、去投降后指针集合的目标下标及结果目标。直接迭代，不写特征缓存；提前break关闭上游压缩流。`tensor_bridge.ts`提供小端连续数组导出格式，Python验证逐字节还原和稀疏条件mask。

Python可直接使用 `from streaming_loader import stream_batches`，然后迭代 `stream_batches(split='train', batch_size=4, augment=True)`。每批返回变长图的字典列表，含真实target、宏权重、policy/value mask和来源哈希。数据通过stdout长度前缀二进制帧传递，应用背压，不落盘；stderr单独持续读取，避免全量运行诊断阻塞。`limit`只用于抽样验证；不指定时遍历所选分区的全部已准入来源。此接口本身不启动优化器。

原生分片使用既有 `inspectAndRead` 完整检查SHA、CRC、收据范围、闭合宏组、摘要链及原生value证据；随后按已验证字节逐行重建。真人包先完整验证SHA/CRC、整包收据、头尾、行号和原始摘要链，再重建当前规则链。每份输入最多驻留一个压缩分片，不创建解压临时文件。原生上限64MiB；来源包实际大小受封存SHA绑定。

当前规则相对2026-10-16封存版本的状态漂移单独计数，不伪称原生中间快照完全一致。原生发生漂移后关闭该段valueMask；真人value/return始终关闭。动作不再属于当前完整合法集合时，隔离当前分段/真人包剩余尾部，写入stats.quarantined并继续其他来源；绝不强行提交非法标签或修改源规则以过样本。自动换手不会出现的只有end_turn/surrender帧剔除；正常含其他选项的end_turn仍保留。跨源顺序索引从不直接混用。

分区覆盖3000原生父局（包括22个没有policy记录的父局）及255个合格真人响应。真人policy索引实际253份，另外2份纯投降从accepted receipt登记但不输出policy样本。原生按实际人数、地图族、计划、模式分层；同父局续段不拆分。真人可证API家族整体分区；未知家族不宣称统计独立。单组分层无法同时分入两区，保持训练并列入清单；开发集是已消费来源的开发验证，不是独立最终测试。

`excluded-evaluation-hashes.txt.gz`为阶段3～5的已消费前态集合，来源逐份SHA见exclusion-sources.json。流式准入同时检查来源beforeHash、当前完整stateHash和当前ruleStateHash。未来训练不得绕过该检查。

本目录预算100,000,000字节，包含源码、报告、排重集合与约1.16MB桥接样本；不生成全量dense张量。不删除任何旧模型、源对局、历史缓存目录或报告。
