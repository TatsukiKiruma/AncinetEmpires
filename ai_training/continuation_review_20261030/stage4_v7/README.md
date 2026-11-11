# 第四阶段 V7

模型固定 Omni-Base，训练更新为零。新数据仅写 D:/AncientEmpiresData/continuation_stage4_v7_20261102_v1；历史目录只读。

运行时修复：同单位占领/修复排除待机，全波次禁手过滤；Wave A单轨并使用正确先验尺度；跳过Wave B；禁止自动缓存子动作，每步重搜；根唯一允许动作快返；按存活人数启用可选双反扑。

C1/C2仅twoPlayerResponseVariants分别为1/2；C3仅将C1价值改为zero_sum_margin。其他参数按用户规范固定。先C1 Dev18健康门禁，再C2/C3；健康C1/C2按equalRank、equalWin、2P独胜、substantiveRate、C1顺序选择。复用同身份18局收据并补足36局，完整Dev54健康及棋力双门禁通过后才创建唯一封存令牌。失败立即停止并报告。

analysis.ts逐步重放实战轨迹，检查状态摘要及合法性，统计模型waitOverCaptureCount；Dev54要求为零。INITIAL.json保存实际引擎配置供重放，不另外访问封存初态。

公共检查、独立类型与教师合同、真实GPU一致性通过后由prepare.ts冻结。host.py隐藏运行controller.ts，单局由supervise.py监督180秒无心跳、7200秒墙钟及磁盘余量。单并发；异常局不覆盖、不重跑。结束生成RUN_CLOSED.json与EVIDENCE_MANIFEST.json；未生成结束证据不得宣称全部完成。
