# 小米8与三星采集职责交接

## 2026-10-24小米500局已预加载（优先于下文未下发记录）

用户已授权预先下发第2501–3000局，并在原1000局完成后由手机自动接续。500局已完整上传小米8独立根`/data/local/tmp/aeii-hard-production-parallel-mi8-20261024-02`，仍最高2路、沿用原CPU和资源守护。原1000局根与数据保持；02:24接续进程观察旧段965/1000，尚未启动新段。

手机本地门禁检查原总调度与三个分片均complete、959份分片账本和DONE标记与冻结父局/尝试逐一匹配（加此前保留41局）、旧任务锁身份和采集应用均已退出，再次核验新脚本/配置/安装APK/注入器SHA后，启动新的500局。等待进程PID8996/startTicks3238298是当时已核验的记录，不能据此盲操作；PPID1、stdin=/dev/null、输出在手机文件，可拔线独立接续，无电脑或网络循环，不承诺重启后自动恢复。

本地入口`ai_training/hard_native_1000_20261022/PRELOADED_COLLECTION.json`，完整计划/实际手机源码/上传回执在`continuation-2501-3000-20261024/`。`PRELOADED.json`为当前回执；`gate-timestamp-02/`保存门禁跨秒时间戳修订及10项测试结果，原始生成源码清单保留。原控制器分别取DONE与账本时间，两者可能跨秒，门禁要求父局和attempt严格相同、时间合法且有序，不要求秒值完全相等。

以后“查询小米进度”使用`Python312/python.exe -X utf8 tools/phone_training_hard/mi8_collection.py status`，同时读旧段、CHAIN_STATE.json和新段STATE（尚未启动时为null）。不得为查询重新prepare/deploy；新段完成数不能与旧段初始41局重复累加。本次未操作三星、未取回小米全量原始数据、未自动训练。

## 2026-10-24追加段更新（优先于下文旧快照和旧三星根）

三星旧第1001–2000局已完成1000/1000，新增210局已取回、既有790局复核，合计1000唯一父局、448909动作，传输异常0。同步入口仍为`ai_training/hard_native_second_20261023/LATEST_SYNC.json`，完整索引在`sync/20261023T163438Z/INDEX.json`。292次失败尝试涉及219父局，均已重试完成，失败证据保留。

用户已授权三星继续第2001–2500局（原冻结计划零基区间[2000,2500)，共500局）；第2501–3000局预留小米，尚未授权下发。新三星根为`/data/local/tmp/aeii-hard-production-parallel-samsung-20261024-04`，仍固定serial=ce071717887a94940b7e、worker11/12/13、无su、最高3路。新本地目录`ai_training/hard_native_second_20261023/continuation-2001-2500-20261024/`，`ACTIVE_COLLECTION.json`给出当前计划。`control.py status`已自动路由新段，报告须区分本段500局、此前已完成1000局与手机累计。

新段复用实际手机采集bundle、原APK安装及智能守护。首启因私有umask导致run-as无法读取shell配置，保留三份失败启动日志后，仅将输入改为shell打开文件经stdin交给run-as，修复后原位续采。证据在新目录`bootstrap-02/`。新master PID17235、三个controller PID17284/17297/17314仅为启动记录，后续必须重新核对启动时钟。旧段数据原件均保留，新旧目录独立，不自动训练。

用户2026-10-24明确要求创建新对话接管手机采集职责，并立即查询当前进度。以后说“查询小米8进度”只查小米8，说“查询三星进度”只查三星；未指明设备时分别列两台。不要让用户重复提供已有的设备序列号、目录或任务信息。三星目前未连接电脑，不能读到实时数据时要明确写“离线，最后快照”，不得说成当前完成数。

## 设备路由

机器可读配置见同目录DEVICE_REGISTRY.json。所有设备命令显式指定adb -s <serial>，绝不用默认设备、adb -d或“唯一在线设备”替代用户所指的设备；不用adb kill-server影响另一台。不做无关网络扫描。

|设备|序列号|系统/权限|任务|正式手机根|最高并发|
|---|---|---|---|---|---:|
|小米8/小米/米8|c2357770|MI 8 UD，Android10，root|第一段1–1000局，共1000局|/data/local/tmp/aeii-hard-production-parallel-20261022-01|2|
|三星/三星Note8|ce071717887a94940b7e|SM-N9500，Android9，无可用su|第二段1001–2000局，共1000局|/data/local/tmp/aeii-hard-production-parallel-samsung-20261023-03|3|

两段各1000局，不能把三星报成“2000局总任务”或把已完成第1001号父局当成完成1001局。小米累计数是初始保留41局＋三个分片doneParents；三星initialDone=0。每个根的w00/w01/w02目录是扁平的<根>-w00等。

ADB：C:/Users/SHIINA/OneDrive/Documents/闲聊/手机投屏/scrcpy-win64-v5.0.1/adb.exe。
Python：C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe，加-X utf8。
ADB此前需要require_escalated；沙箱内device/daemon错误不能直接解释为手机断开。

## 接手后的第一步

1. 先读仓库AGENTS.md及ai_training/AGENTS.md、README.md、status/CURRENT.md，保留大量现存脏工作区、历史数据/模型/报告。
2. adb devices -l重新列设备，不信刚才的连接快照。当前父对话首次交接检查只见c2357770；三星用户已说明未连接。核对目标serial与getprop ro.product.model。
3. 对每台在线手机只读查询实时根STATE、各worker STATE及活动尝试的私有STATE，读dumpsys battery、date +%s、/proc/uptime、completed.tsv。明确区分真正collecting、CPU让行、温度/电量/空间暂停。
4. 对离线三星读取LATEST_SYNC.json/INDEX.json，只报告带时间的本地快照。以后三星连接时直接按注册serial查，无需再问是哪台手机。
5. 在新对话主动给出本次进度结果，而不只回复“已接手”。报告时间、完成/剩余、是否正在采集、主要暂停原因；ETA须基于近期自然完成局数和实际墙钟，包含失败重试/温控影响，不以提交动作率代替局产量。

## 查询入口及身份核验

三星已有专用只读入口：

    Python312/python.exe -X utf8 tools/phone_training_hard/second_device/control.py status

其device.py已固定ce071717887a94940b7e。读控制文件用普通adb shell；读私有采集状态用device.app(package, command)，内部run-as，仅允许worker11/12/13。不要对三星使用su，不要替换三星原用户游戏。原用户包SHA不同不是采集副本出错；采集副本安装身份见hard_native_second_20261023/INSTALLED.json。

小米使用adb -s c2357770 shell su -c读取对应根。私有文件在/data/user/0/<package>/files/.aeii-hard-production/<attemptId>/STATE.json。为避免单命令输出/错误判断问题，可将root命令包装为：id >/dev/null; <只读命令>; aeii_read_status=$?; sleep 0.05; exit $aeii_read_status。后台启动命令不能直接拼成“&;”，需要括号子shell或正确换行。

必须核对STATE.updatedEpoch与手机当前时间，读取master.lock/identity及各controller.lock/{pid,starttime}，用/proc/PID/stat的启动时钟和非Z/X核真实身份。三星无权读取某进程时记“无法核验”，不能直接说进程已死。

不要读取/proc/PID/cmdline：小米退出竞态曾持续返回NUL。空PID必须先拒绝，避免/proc//stat误读/proc/stat。重启后旧PID会复用为系统进程，绝不按旧PID杀进程。

小米曾在2026-10-23约17:25重启，旧STATE停在16:05仍显示running；旧PID3047/3091已复用为系统进程。核对DONE_SEQS与completed.tsv及此前41局后保留804局原位恢复，18:11已806。证据在production-parallel-01/resume-after-reboot-20261023-180822/。部分旧状态文件断电后为空：以完成标记与账本交叉核对，不把空文件或旧running当作实时结果。

## 最近快照：均是历史，不是实时

- 小米2026-10-23 22:19：915/1000，剩85；电13%、温34℃、充电中，低电量等待。当时master和三个controller的PID/startTicks核验存活，最后自然终局19:29。此后进度必须重新读取。
- 三星2026-10-23 16:21:16：790/1000，剩210；最高3路，CPU72.489%、38.2℃、约95%电量。电脑已保存完整790唯一父局、335211动作。本次新增753、复核旧37；六文件SHA/gzip/动作索引/状态帧数/自然终局和线程退出均核对，传输异常0。见hard_native_second_20261023/LATEST_SYNC.json与sync/20261023T081856Z/{REPORT.md,INDEX.json}。
- 三星累计219失败尝试：119 app_disappeared、1沿用inject_disappeared、88 EVT#10、11早期启动失败；涉及217父局，15后来完成，202当时未完成。最近一例退出由libGDX图形暂停同步超时后应用自行SIG9闭合，不能推断所有历史退出都同因。原队列会继续并在轮末重试。
- 三星来源对话：01a1661b-154e-7f23-a020-b974a2787e17，标题“第二台手机 1–3 worker 压测与第1001–2000局采集”。需要上下文可以read_thread，只读即可，不擅自发送消息去唤醒/修改旧对话。

## 沿用的任务与规则

- 用户已授权各手机完成各自1000局、手机本地独立运行、失败单独处理、保留完成局。最高90%CPU约束沿用；不是新建第三段采样或重跑验收的授权。
- 指定APK源：C:/Users/SHIINA/Downloads/aer-4.2.5.1-patch.apk.1，SHA a2adcc856384dea4ebac7434c78c2abbdcb1f428e502925fd4beb39c95cd6d48。原j.b.call及Java困难回退、原HTML Math.random保持；native seed不代表JS已播种。沿用已授权的人口常量100对齐原生30和APK data.bin密钥初始化，不改AI/规则/地图。
- 小米worker包为原包、worker01、worker02；root UID 10779/10780/10781，实际仍须核查。Binder重要性辅助+定向解冻，不改全局后台CPU阈值。独立副本保留462份源载荷。
- 三星worker11/12/13，UID10221/10222/10223，实际仍须核查。无root，采用可调试独立包＋wrap.sh＋Frida Gadget，保留462份源载荷且不动原用户游戏。
- 手机本地调度，无电脑常驻循环，拔线不影响进程；关机/重启会结束普通本地进程，不要承诺自动随开机恢复。
- 温度>=45℃、电量<20%、空间<2GiB暂停；恢复需温度<=42℃、电量>=25%、空间>=2.25GiB。已暂停且23%电量时仍不能恢复；充电等待不算正在采集。
- 小米最高2路，>=90%暂降，连续<75%满30秒恢复选定2路，不再试3/4。三星最高3路，有独立的CPU、失败密集和冷却恢复逻辑，不能硬套小米的2路上限。
- 成功是自然终局＋完整产物与THREAD_EXITED后才计数，失败/截断不计完成，原件保留。公共strict/训练准入后置，不再追加1/20局验收，不自动注入模型或冻结训练集。
- “查询进度”默认只读，不执行prepare/deploy/rollout重新安装或重建队列。不改正在跑的另一台设备。确因手机重启退出且未显式停止，需续采时先核APK/脚本SHA、完成账本与标记、原分片和锁身份，保留历史和中断尝试，原位跳过完成局恢复；不能盲杀未知进程。用户从未撤销完成各1000局的授权。
- 用户后续要求取回三星数据时，用second_device/sync_completed.py增量取回，不删除手机原件；未明确要求时不要因查询就做全量传输或训练。

## 主要文件

- tools/phone_training_hard/README.md；second_device/README.md、device.py、control.py、sync_completed.py。
- 小米：ai_training/hard_native_1000_20261022/production-parallel-01/，包含adaptive-02、lifecycle-03、resume-after-reboot-20261023-180822。
- 三星：ai_training/hard_native_second_20261023/production-03/PLAN.json、SEGMENT_PLAN.json、INSTALLED.json、adaptive-01/HANDOFF.json、LATEST_SYNC.json。
- 工作树有大量其他训练/模型/界面改动，禁止reset/清理/覆盖。不接管模型搜索研究；本新对话职责只为两台手机的采集进度、队列维护和用户要求的数据取回。
