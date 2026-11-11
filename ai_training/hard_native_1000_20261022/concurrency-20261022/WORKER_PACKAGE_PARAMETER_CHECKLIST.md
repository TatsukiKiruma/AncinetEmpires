# 多进程 worker 副本参数清单

本清单只读核对现有生产链，未修改 production 文件或手机。原 APK SHA256 为 `a2adcc856384dea4ebac7434c78c2abbdcb1f428e502925fd4beb39c95cd6d48`。类加载器静态证据保留在 `classloader-static-20261022.json`，其方案已停止；手机 WebView 88 单进程内共享 renderer 的限制由主代理另行记录。

| 位置 | 现状与副本所需参数 |
| --- | --- |
| `tools/phone_training_hard/production_runtime.frida.js:216` | `config.package` 缺省为原包。每个副本显式传入实际安装包名，例如 `net.toyknight.aeii.android.worker01`；不依赖缺省值。 |
| `production_runtime.frida.js:37-43` | `HARD_EXPECTED.sha256` 核对当前应用 `ApplicationInfo.sourceDir` 的整个 APK。应注入各副本 APK 实际摘要，同时保留原始源 APK、DEX、HTML 摘要作为独立来源字段。修改 manifest/重签名后整包摘要必然改变。 |
| `production_runtime.frida.js:46-59` | 私有根从当前应用 `getFilesDir()` 获取，已自然隔离，无固定 UID。配置的 `outputDirectory` 必须属于该副本自己的 `files/.aeii-hard-production/<attemptId>`。 |
| `production_worker.rhino.js:104-109` | `cfg.taskRoot` 限制为 `/data/local/tmp/aeii-*`，输出目录与当前应用私有目录相符即可。每副本单独的 taskRoot、attemptId、STOP、STATE、manifest、日志和控制锁；不得指向原包私有目录。 |
| `production_worker.rhino.js:112-145` | 从当前 Activity 的类加载器解析 `aer.extension.*`，直接调用当前进程的 `c.a.b.c.j.b`。完整 Java 类名保持原值，不改为 worker 包名。每进程自动隔离 view、lastAccepted、选择槽、资源密钥与 Rhino ThreadLocal。 |
| `prepare_production.py:21-23,84-100` | REMOTE、PRIVATE、HARD_EXPECTED 和 config.package 均需来自当前 worker 身份。原 `USER_APK` 仍用于证明用户指定来源，安装副本路径/摘要另记，不能用副本摘要改写原来源记录。 |
| `deploy_production.py:14,37-48` | 固定 PACKAGE 需参数化，`pidof`、`pm path`、安装 APK 摘要核对都面向当前副本。inject 路径与二进制 SHA 可在所有副本间复用。 |
| `production_controller.sh:4,135-160` | PACKAGE 需参数化。启动组件应分成包名和完整 Activity 类名两个参数：`<worker包>/net.toyknight.aeii.android.AndroidLauncher`。现有 `$PACKAGE/.AndroidLauncher` 会指向不存在的 worker Java 类。 |
| `production_thaw.sh:7-8,80-90` | PACKAGE、MAIN_UID=10779、`u0a779`、`u0a779i` 都需按当前副本真实 UID/用户身份生成。renderer 归属仍按本包 caller、当前主 PID/启动时钟和真实服务绑定确定。不能只替换主包名而保留原 UID 正则。 |
| `production_controller.sh:5-6,111-118`、`deploy_production.py:63` | TOTAL=1000、INITIAL_DONE=2、固定998条检查不能复制到每个并行子队列。全局保留已完成2局，剩余998父局只由一个总账分发；子队列使用本地任务数和本地完成数，避免重复计局。 |
| `production_controller.sh:23-33,72-101` | 每副本独立 controller.lock、DONE_SEQS、owned-processes、解冻缓存和唤醒锁标签。全局完成标记应带包名/workerId；终止仍限各自记录的 PID 与启动时钟。 |

对原 APK Manifest 的直接解析确认：

- Application 为完整类名 `net.toyknight.aeii.android.AERAppContext`，主 Activity 为完整类名 `net.toyknight.aeii.android.AndroidLauncher`；这两个类名应保留。
- 未声明 sharedUserId、显式组件 process 或 taskAffinity，副本应获得独立 UID 和默认独立进程。
- `com.google.firebase.provider.FirebaseInitProvider` 的 authority 为 `net.toyknight.aeii.android.firebaseinitprovider`。各副本必须在 manifest 内改为唯一 authority，避免与原安装及彼此冲突。
- 自定义 `permission` 及其 `uses-permission` 名为 `net.toyknight.aeii.android.permission.C2D_MESSAGE`；副本应配套改为各自唯一名称。另有两处 intent-filter category name 为原包名，也应按 worker 包调整。Manifest 字符串不能无差别全局替换，否则会损坏应保留的 Application/Activity Java 类名。
- 原有 `aer.extension.*`、`c.a.b.*`、Gdx、Rhino、资源路径 `assets/hard-ai/runtime.html`、`maps/`、`mods/SD/` 均保持原值。当前 runtime/worker 没有其他固定 UID。

建议每份 worker 身份记录包含 `workerId/packageName/mainActivity/userId/uid/privateRoot/taskRoot/sourceApkSha256/installedApkSha256/classesDexSha256/originalHtmlSha256/runtimeHtmlSha256`。这只是来源和归属元数据，不改变原 `j.b.call`、Java 困难回退、评分或随机源。

现有 worker 资源检查只读电量、温度和空间，不计算整机 CPU。2/4 worker 的总吞吐与整机 CPU 90% 止增应由总调度器统一测量；不要让各副本各自按 CPU 进程百分比推断整机余量。
