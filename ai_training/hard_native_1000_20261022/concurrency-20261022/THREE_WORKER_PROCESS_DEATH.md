# 三进程基准中两个宿主同时退出的证据

2026-10-22，手机 `c2357770`，Android 10 / API 29。目标队列为 `/data/local/tmp/aeii-hard-concurrency-20261022-bench-02`。本轮只读日志；未修改、停止或重新启动手机上的进程和队列。

结论：19:17:36 系统 ActivityManager 以后台 CPU 使用超限为由先杀死两个 WebView renderer，Chromium 随后因所有关联 WebView 未处理 renderer 退出而主动结束两个宿主。此次宿主消失的直接链路已闭合，不能归因为 libGDX 暂停同步超时、模型动作错误或内存 OOM。

## 原始日志及身份

以下文件保留 `adb logcat` 返回的原始行字节，仅按时间字段截取结束边界，没有按消息内容筛选。它们是指定时间窗的日志，并非完整设备日志。

| 文件 | 来源与时间范围 | 字节数 | SHA-256 |
| --- | --- | ---: | --- |
| [events 原始日志](THREE_WORKER_PROCESS_DEATH.events.raw.log) | `logcat -d -b events -v threadtime -T "10-22 19:16:00.000"`，保留至 19:17:45.999；含 logcat 返回的前置 chatty 记录 | 143546 | `f83475ffa60893886e8413779be02124d5bbba9b7b0177f141ce0f488ae3bd25` |
| [main/system/crash 原始日志](THREE_WORKER_PROCESS_DEATH.main-system-crash.raw.log) | `logcat -d -b main -b system -b crash -v threadtime -T "10-22 19:17:31.000"`，保留至 19:17:40.999 | 79239 | `b500ba214d6dcc050d64a57519b044e3d39f967b5e88bc8acbda96d82c2d71b9` |

原 APK SHA-256 为 `a2adcc856384dea4ebac7434c78c2abbdcb1f428e502925fd4beb39c95cd6d48`。克隆包的 APK 整体摘要不同；此处通过实际进程启动组件确认 renderer 归属，不根据相近启动时间猜测。

| 应用 | 宿主 PID / UID | renderer PID / 隔离 UID | events 证据行 |
| --- | --- | --- | --- |
| 原包 `net.toyknight.aeii.android`，本次父局 28 | `24680 / 10779` | `24970 / 99004` | 宿主第 47 行；renderer 第 128 行，组件属于原包 |
| `net.toyknight.aeii.worker02`，本次父局 33 | `25646 / 10781` | `26003 / 99005` | 宿主第 304 行；renderer 第 405 行，组件属于 worker02 |

renderer 的进程名均为 `com.google.android.webview:sandboxed_process0:org.chromium.content.app.SandboxedProcessService0:0`，但 events 的组件分别为原包和 worker02；它们是两个不同 PID、不同隔离 UID 的进程。

## 已闭合的退出时间线

| 时间 | 实际事件 | 原始日志位置 |
| --- | --- | --- |
| 19:17:36.743 | ActivityManager 杀 `26003`，adj 900，原因为 `excessive cpu 26680 during 300056 dur=212237278 limit=2` | events 706；main/system/crash 277 |
| 19:17:36.744 | ActivityManager 杀 `24970`，adj 910，原因为 `excessive cpu 40500 during 300056 dur=212237278 limit=2` | events 707；main/system/crash 278 |
| 19:17:36.959 / .961 | 原宿主、worker02 的 Chromium 分别发现 renderer 24970、26003 退出，code -1 | main/system/crash 308、309 |
| 19:17:36.961 / .965 | 两宿主的 `aw_browser_terminator.cc(89)` 明确记录关联 WebView 未处理 renderer 退出，随后 `killing application` | main/system/crash 310、311 |
| 19:17:37.147 / .161 | Zygote 确认宿主 25646、24680 均因信号 9 结束 | main/system/crash 326、333 |
| 19:17:37.143 / .166 | ActivityManager 记录两个宿主 `am_proc_died` | events 720、723 |

因此，控制器约 19:17:39 观察到的 `app_disappeared` 是上述退出链的后续观测，并非它发出的清理信号。

这段 main/system/crash 时间窗没有 `AndroidGraphics` 的暂停同步超时或 deadlock 记录，也没有两个目标宿主对应的 Java/native 崩溃记录。`lowmemorykiller` 对原宿主读取 `oom_score_adj` 失败的消息出现在宿主已经退出之后；它不能反推为 OOM 杀进程。Chromium 消息中的通用文字 `OOM or update` 也不能覆盖前面 ActivityManager 已明确给出的 `excessive cpu` 原因。

这不否认原 APK 的 `AndroidGraphics.pause()` 有超时杀进程分支，只说明本次死亡有另一条直接证据链。worker01 的 PID 26358 当时存活，未发生同一批 renderer 杀进程。

## 后台 CPU 策略与整机 CPU 上限是两件事

Android 10 的 ActivityManager 在进程状态不优于 HOME 时进行后台 CPU 检查，再按检查周期和进程后台时长选择阈值。本次日志中的 `limit=2` 来自该进程级策略，不能拿整机 CPU 未达 90% 来判断不会被杀。对应代码位于 [AOSP Android 10 ActivityManagerService 的后台 CPU 检查](https://github.com/aosp-mirror/platform_frameworks_base/blob/android-10.0.0_r47/services/core/java/com/android/server/am/ActivityManagerService.java#L15404)。

日志能够证明此次系统采取了这条策略；MIUI 对相关计时及阈值是否另有修改，本轮没有反编译系统服务，保留为未知。

## WebView 默认优先级与定向保活接口

目标 APK 的 `deliverables/original_apk_hard_20261021/static/patch-ResourcePackHardAi$1.dad.java` 第 15—20 行只创建 WebView、开启 JavaScript/文件访问、设置客户端并加载页面，没有调用 `setRendererPriorityPolicy`；当前生产预热脚本也没有该调用。Android 官方说明默认策略已经是 `RENDERER_PRIORITY_IMPORTANT`、不随不可见状态降低，且它相当于 `BIND_IMPORTANT`，renderer 与宿主保持相同优先级。因此仅再设置一次 `2, false` 不能让已经 cached 的宿主及其 renderer 获得更高的系统状态。[WebView 官方接口说明](https://developer.android.com/reference/android/webkit/WebView#setRendererPriorityPolicy(int,%20boolean))

可行的最小候选是独立的 root `app_process` 辅助进程，持有非空 Binder token，针对本任务确认归属的 PID 调用 `IActivityManager.setProcessImportant(IBinder, int, boolean, String)`。Android 10 的 AIDL 确有此签名；实现要求 `SET_PROCESS_LIMIT` 权限，设置 `forcingToImportant` 并重新计算重要性。[AIDL](https://github.com/aosp-mirror/platform_frameworks_base/blob/android-10.0.0_r47/core/java/android/app/IActivityManager.aidl#L224)、[ActivityManagerService 实现](https://github.com/aosp-mirror/platform_frameworks_base/blob/android-10.0.0_r47/services/core/java/com/android/server/am/ActivityManagerService.java#L5268)

`OomAdjuster` 将这种状态提升到 `PERCEPTIBLE_APP_ADJ`、`PROCESS_STATE_TRANSIENT_BACKGROUND`，并令 cached=false；按上述 AOSP 条件，它应退出这条后台 CPU 杀进程检查。默认 WebView 的重要绑定还会继承宿主重要性，具体 MIUI 实际效果应观察宿主及绑定 renderer 的进程状态，不能只凭 Binder 调用未抛异常认定成功。[OomAdjuster 的 force-imp 与服务绑定实现](https://github.com/aosp-mirror/platform_frameworks_base/blob/android-10.0.0_r47/services/core/java/com/android/server/am/OomAdjuster.java#L942)

手机 `cmd activity help` 未提供此接口的命令包装，`service -h` 只列出整数、浮点数和字符串参数，不能提供可持续存活的 Binder token。应通过该机 framework 的实际 AIDL 代理反射调用，避免猜测 MIUI Binder 事务编号。`setProcessStateSummary` 不是进程重要性接口。

辅助进程须保持 token 存活。清理时优先让辅助进程退出，AMS 的 token 死亡处理会先比较当前 token 身份，再自动撤销自己的提升。显式 false 调用会移除该 PID 当时的 token，接口自身不比较传入 token，故不能在 PID 重用或归属变化后盲目调用。所有定向操作应核对 PID、启动时钟、UID及任务归属；不调整全局阈值，不改 APK、AI 字节码或 HTML 策略。

本报告只验证日志与接口依据，未在诊断期间调用 `setProcessImportant`。辅助进程实现及实机结果由后续独立记录承担。
