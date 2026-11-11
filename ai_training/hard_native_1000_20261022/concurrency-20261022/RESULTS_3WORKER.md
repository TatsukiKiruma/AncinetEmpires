# 3 worker实测与失败分类

bench-02使用原包、worker01、worker02三个独立进程；启动互斥的新控制器。先保存三份当前attempt均running且提交动作大于0的起始证据，再采样。

|配置|有效窗口|整机CPU均值|采样区间峰值|提交动作/秒|电池温度|PSS峰值|MemAvailable最低|
|---|---:|---:|---:|---:|---:|---:|---:|
|1 worker|60.07秒|46.99%|54.16%|3.662|38℃|209.71MiB|2125.63MiB|
|2 worker|119.94秒|60.91%|67.22%|5.828|38–39℃|343.32MiB|2065.91MiB|
|3 worker|120.12秒|67.13%|69.77%|6.668|40–41℃|448.13MiB|2302.91MiB|

3 worker共记录801提交动作。global独立监测25份状态均activeLimit=3、stopIncreasing=false，观测到的master短区间CPU最高75.721%；没有触90%限制，也没有观察到CPU cooling大于0或频率上限低于硬件最大值。RSS合计峰908.44MiB会重复计算共享页。单次采样耗时最高11.61秒，采后等待10秒，区间均使用实际设备uptime。

3 worker的提交动作率比本次2 worker窗口约高14.4%，但地图、局面、随机轨迹与启动控制版本不同，是短时观察值，不是受控加速比，也不能证明长期热稳定或有效数据产量。

## 失败不能混为一类

窗口中w00与w02各新增一次失败，w01没有新增失败。两份小failure.tsv把28与33都记为**app_disappeared**，设备epoch同为1792667859（19:17:39）。本地采样中的这两局旧STATE仍停在running181/260动作，无failed/error，不能把它们说成EVT-ERROR #10，也不能仅据记录判定系统具体杀进程原因。

2 worker窗口clone977明确记录EVT-ERROR #10，是另一类错误；原28第一次失败还发生在并发开始之前。新启动互斥下依然出现两份同秒app_disappeared记录，因此不能声称已证明消除了应用消失/前台切换类问题；具体因果仍需另查。性能结果支持3槽位在此窗口未触CPU门禁，稳定性结论必须保留这两例。

自然父局计数在采样端点增0；34的工作线程STATE刚complete，控制器尚未计入，不能以此称没有自然终局。提交动作率包含失败前缀和未结束对局，后续训练准入产量应另计。

原始文件：20261022-191644-w3/PROTOCOL.json、SUMMARY.json、sample-000至006.json；THREE_WORKER_START_PROOF.json、THREE_WORKER_GLOBAL_MONITOR.jsonl及THREE_WORKER_FAILURE_REASONS.json。没有改变cap或修改手机设置。
