# 困难版 APK 安装与 3000 局原生采集

**2026-10-25 清理更新：** 经用户明确授权，`original-backup-02/original-data.tar` 已删除。删除前已将 41 个非旧采集实验文件（存档、下载地图、配置等）与原 APK 提取至 `preserved-original-save-20261025/`，并逐项核对原设备 SHA-256。提取回执见 `../cleanup_20261025_storage/backup-extraction.json`。不能再使用旧安装脚本从完整 tar 回滚当时全部私有数据；下文“完整归档保留”等文字仅描述当时的历史操作。当前困难版采集资产和控制入口未删除，手机数据未操作。

**用户已于 2026-10-22 改为先直接采集 1000 局。** 本目录的 20 局验收协调器及后续 3000 局调度已停止，不再继续；历史回执原样保留。当前任务见 `../hard_native_1000_20261022/`，下发记录及切换原因分别见该目录和本目录 `USER_CHANGE_1000.json`。

本轮对应用户 2026-10-22 的继续执行指令。历史预检报告保持原文，本目录记录新安装、试采、独立验收及正式采集事实。正在运行的约 200 万参数训练使用自己的冻结数据版本，本轮不修改其来源或把新数据自动混入该进程。

目标设备 `c2357770`，目标包 `net.toyknight.aeii.android`。指定困难 APK SHA-256 为 `a2adcc856384dea4ebac7434c78c2abbdcb1f428e502925fd4beb39c95cd6d48`；完整静态身份与最小原生配置来源见 `assets/`。冻结八图各 375 局的原计划继续引用 `../pretrain_preflight_20261022/HARD_SAMPLING_PLAN.json`。

## 数据保全与替换安装

`original-backup-01` 保留第一次二进制归档命令引用错误的失败证据，未卸载应用。`original-backup-02` 是修正后的完整备份尝试，须以 `BACKUP_VERIFIED.json` 为准，不能凭目录存在判断完成。原版 APK、完整私有数据归档、设备逐文件 SHA 清单及关键文件的隔离解包恢复核验分别保存。

`installation-01` 的暂存移动因加密目录边界退回复制，已识别并停止，原版未卸载。`parking-recovery-02/RECOVERY_VERIFIED.json` 证明已将完整副本禁止覆盖地补回，43,993 个原文件全部 SHA 一致，失败暂存及 PC 归档保留。`atomic-probe-01` 只对空目录验证了同父 libc rename；`install_verified_v2.py` 未执行，因 Android 可能按 CE inode 追踪改名目录而已停用，不能把改名视为卸载隔离证明。[AOSP 卸载实现](https://android.googlesource.com/platform/frameworks/native/+/8d0c61014f716f945ee64415e95bdd28365320a0/cmds/installd/InstalldNativeService.cpp) 支持这一风险判断，设备具体 inode 回查未另行实测。

后续采用标准完整归档恢复方案：先验证原始 stdin 的隔离解包，再标准卸载/安装指定包，从 PC 完整归档直接流式恢复所有原数据、修正新 UID/SELinux 标签并全量核对 SHA。先检查其他用户和外部 data/obb/media，发现未备份资料即拒绝。完整 PC 原件归档及原版 APK 始终保留。文件完整不等于 Android Keystore 或账号登录可恢复，账号登录不作已验收声明。安装是否完成以 `installation-*/INSTALL_VERIFIED.json` 为准。

`installation-03/INSTALL_VERIFIED.json` 已确认标准替换安装及恢复完成：23,676,789,248 字节归档完整回写，43,993 个原文件全部 SHA 一致，无额外文件，新安装根目录 inode 保持，UID/SELinux 标签已修复。目标 APK 摘要一致；PC 原始归档和原版 APK 保留。

## 采集与验收

新工具为 `tools/phone_training_hard/launch_collect.py`、`resident_collect.frida.js`、`native_engine_collect.rhino.js`、`worker_collect.rhino.js`，旧短冒烟版本不改。完整单局最多 20000 个动作，使用真实 APK 引擎与原始 WebView `Math.random()`；不将 Java 配置种子冒称 JS 可重复种子。每个应用新进程只跑一局，保留全部动作、前态和最终快照、逐决策 JS 主路径证据及传输 SHA。

`tools/phone_training_hard/verification/run.py` 独立附加已安全停止采集线程的本次进程，重放保存动作，另外在项目权威规则中做 strict 验收。原生重放、项目 strict、冻结默认初态匹配和自然 Value 资格分别记录。错误、回退、普通 AI、截断均不可冒充完整合格正式父局。

实机调试得到的运行组合为隔离 Frida 17.2.5 与官方 `frida-tools 14.3.0` Java bridge，端口仅绑定手机 `127.0.0.1:27043`；既有 27042 服务及系统 Python 未更改。实际依赖摘要见 `assets/RUNTIME_ENVIRONMENT.json`。17.15.0 新进程注入失败、17.7.3 linker 崩溃、17.15.2 JNI slot 失败均保留，未冒充通过。为确保预编译内联不绕过监控，在本次应用虚拟机执行 `Java.deoptimizeEverything()`，吞吐包含该仪器化开销。

匿名任务类普通构造参数完整、泛型参数为空，导致 bridge 误建模；采集器改为在 `Activity.runOnUiThread` 的真实任务入队处读取原任务字段并绑定回调，不替换构造器或注入随机源。`debug-entry-11/hard-debug-011/verification.json` 已证明五步调试全 JS 主路径、原生四组件完整字节重放、项目 strict 和默认初态匹配均通过；它是截断调试，Value 为 false，不计正式父局。

观察到旧调试组合在会话释放后进程退出，确切卸载原因尚未确认。因此正式入口在安全收尾、产物 SHA 固定后保持 collector 驻留，由独立 Python 子进程运行原有验收器，记录命令、源码/计划摘要和退出码；验收结束后才释放采集会话。独立重放仍不调用 AI，也未放宽任何组件比较。失败尝试及进程退出证据全部保留。

`tools/phone_training_hard/batch_controller.py` 区分单局、八图 20 局验收与正式 3000 局。前两阶段不计正式配额。已验收父局可以恢复跳过；失败尝试保留并停止调度。只有本次明确拥有、起始时间未变且已安全收尾和验收的 PID 才可精确退出；不终止未知游戏进程。资源不足或输入/源码身份改变则停止。

正式开跑时间、合格局数与进程身份必须读取新回执和实际进程，不能从计划或本文推断已经开跑。20 局完成后按实测报告容量、自然结束比例、独特轨迹、串行吞吐及 3000 局外推，之后才启动正式轮次。

## 工具证据边界

本机 REA 的 Android 反编译提供器缺少 `jadx-headless-mcp` JAR，失败回执已保存在 `rea-target-*.json`；未安装或改全局配置。APK 身份使用已有 Androguard 核对，实机行为使用现有版本匹配的 Frida 和逐决策证据，不称为已取得 REA 运行证据。
