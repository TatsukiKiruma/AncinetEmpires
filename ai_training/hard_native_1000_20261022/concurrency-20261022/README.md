# 并发采样证据

2026-10-22 当前production-05的1 worker标准基线：60.07秒、8核在线，整机CPU均值46.99%、区间峰值54.16%；提交220动作，3.662动作/秒，含一次自然终局及换局启动，38℃。PSS峰值209.71MiB、RSS合计峰值340.78MiB（共享页会重复），MemAvailable最低2125.63MiB。结果见BASELINE_1WORKER.json及20261022-185118-w1原始样本。

大核有一次频率上限2.6496GHz低于硬件2.8032GHz；CPU cooling状态均0，HAL没有有效温度列表，因此只确认观察到频率上限限制，不能单独归因为发热。较早同局14.65秒短样本CPU42.31%、动作4.659/s在baseline-1worker-10s-raw.json，不能用此短样本替代完整区间吞吐。

工具tools/phone_training_hard/concurrency_metrics.py只读。传--workers N --duration 60（或120）--interval 10；每个worker传一个--task-root，克隆包分别重复--package，默认自动推导该包files/.aeii-hard-production数据根，也可重复--data-root/--state-path。root STATE沿用package/appPid/injectPid/attempt字段。每个新session保存PROTOCOL、分段样本和SUMMARY；不启动、停止或增加worker。

整机CPU=100×(总jiffies差-idle差-iowait差)/总jiffies差；8核总能力=100%，各核单独占用在cpuPerCorePercent。90%门禁使用任一区间达到90%则stopIncreasingAt90Percent=true。整机包含其他应用和采样开销，不等于训练进程CPU。进程CPU只对PID及startTicks相同的相邻样本求差，退出进程会漏计，因此仅为下界。

动作通过active STATE与新增completed.tsv累计；换局不会清零，失败尝试已提交动作也计入工作量。STATE刷新和采样串行读取会有端点误差。原1 worker采样开销最高6.17秒/次，主要是逐进程dumpsys meminfo，比较并发时要保留相同间隔和口径。短时结果不能证明长跑温度稳定。

process_thaw.sh是独立参数化守护副本：TASK_ROOT MAIN_PID STARTTICKS PACKAGE UID。按UID计算AMS owner标签，缓存主PID+启动时钟，真实服务绑定识别renderer；仅发现frozen才逐PID解冻，不读cmdline，不改全局设置。Android sh -n及原包/模拟clone服务记录解析通过；分析阶段没有执行任何解冻命令。
