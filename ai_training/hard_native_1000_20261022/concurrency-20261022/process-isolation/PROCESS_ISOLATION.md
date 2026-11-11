# 原困难 AI 的独立进程方案静态审查

2026-10-22；只读本地 exact APK 与既有反编译材料，未连接手机、安装副本、发出采集任务或修改生产源码。以下“可行”指静态实现路径成立，不代表已经证明多个后台 WebView 的实机吞吐。

结论：从 exact APK 生成只改清单身份与签名的独立包副本，是当前较小的进程隔离路径。每个副本由 Android 正常创建原 `AndroidLauncher`，自然获得真实 Activity、主 Looper、原 assets、原 Gdx 初始化和各自静态字段；比另写 companion Activity 加载原 APK 的类、资源和 native library 更少引入宿主差异。原安装包和数据可以完全保持不动。[Android 进程说明](https://developer.android.com/guide/components/processes-and-threads)、[清单包身份说明](https://developer.android.com/guide/topics/manifest/manifest-element)。

## exact APK 的直接证据

- 原 APK SHA256：`a2adcc856384dea4ebac7434c78c2abbdcb1f428e502925fd4beb39c95cd6d48`；minSdk 19、targetSdk 29。清单共 18 个组件，没有 `android:process`、`sharedUserId` 或 instrumentation。多开原包 Activity 不会得到新的宿主 Java 静态状态。
- `AndroidLauncher.onCreate()` 先调用 `ResourcePackUi.attach(this)`，再按原逻辑 `AndroidApplication.initialize(...)`。`Ui.attach()` 只设置本进程静态 Activity 并重置本进程 Hard；因此副本仍能从正常入口得到 `ResourcePackUi.currentActivity()`，无需虚构 Activity。
- `ResourcePackHardAi` 的 WebView、loaded、lastAccepted，以及 `AiSelection` 绑定属于进程静态状态。不同 APK 副本由不同应用进程承载，能隔离这些字段。Chromium 的 renderer 子进程并不能替代宿主 Java 状态隔离。
- `ResourcePackUi.base()` 使用 `activity.getFilesDir()/resource-packs`。原配置 `.aeii/` 在 Android 分支经 `Gdx.files.local()` 进入各包私有 files。无需复制原应用约 23 GB 数据。
- exact DEX 字符串未发现旧 dotted 包名 `net.toyknight.aeii.android`、`/data/data/`、`/data/user/`、`Android/data` 的固定路径常量；原类名的 slash 描述符当然仍在。10 个原生 `.so` 的可打印字符串未发现旧包身份或上述私有绝对路径。游戏、资源包扩展和原 Launcher 命名空间内未发现 `getPackageName/getIdentifier/getPackageInfo/checkSignatures` 调用。这是静态扫描范围内的结果，不排除运行时拼接等未观测行为。

原始清单见 `exact-manifest.xml`；身份、核心 payload SHA、选中方法原始指令和扫描边界见 `STATIC_REVIEW.json`。既有 JADX 输出用于补充阅读，包身份和关键调用以上述 exact DEX 指令为准。

## 清单必须精确处理的字段

| 字段 | 副本处理 |
| --- | --- |
| `manifest.package` | 唯一副本包名，如 `net.toyknight.aeii.worker01` |
| `application android:name` | 保留原绝对类名 `net.toyknight.aeii.android.AERAppContext` |
| Launcher 等组件类名 | 保留原绝对类名；本清单组件已全部绝对化，无需改 dex |
| `FirebaseInitProvider android:authorities` | 改为新包名加 `.firebaseinitprovider`，避免与原包或其他副本冲突 |
| 自定义 `permission` 与对应 `uses-permission` | 两处均改为新包名加 `.permission.C2D_MESSAGE`；保留旧名会与原版不同签名的 signature 权限发生冲突 |
| 两个 GCM intent-filter 的旧包名 category | 同步改为副本包名 |
| Launcher 的 `android.intent.category.LAUNCHER` | 单独换为内部 category，避免桌面重复图标；后续使用精确组件启动 |
| min/target SDK、资源 ID、其他组件类名 | 保持原值 |

不能对 AXML string pool 做旧包名前缀的全局替换：组件类名必须仍指向原 dex 中的类。资源表 `resources.arsc` 中原资源 package 名和数字 R 引用保留，payload 字节无需修改。Provider authority 用于系统唯一定位，需独立身份。[Provider 官方说明](https://developer.android.com/guide/topics/manifest/provider-element)。

## 签名与非规则行为边界

副本签名必然不同于原 APK，副本整体 SHA 也不同；“原 AI 不变”应准确记录为 `classes*.dex`、`assets/hard-ai/runtime.html`、所有其他非清单与非签名 payload 的解压后字节 SHA 全部一致，原安装 APK SHA 另行保持原值。不得把副本整体写成原 APK 身份。

重新打 ZIP 时不保留原 v2/v3 签名块与旧 JAR 签名条目；生成新的 v1 签名。新 `.SF` 不应残留声称具有 v2 的 `X-Android-APK-Signed`，否则可能触发签名剥离检测。非签名 `META-INF` payload 不应一概删除。Android 10、target 29 可使用 v1；Android 11 针对 API30 新增 v2 要求，此结论不外推到后者。[AOSP 签名块与剥离防护](https://source.android.com/docs/security/features/apksigning/v2)、[Android 11 签名要求](https://developer.android.com/about/versions/11/behavior-changes-11#minimum-signature-scheme)。

`AERAppContext.onCreate()` 仍会初始化 OneSignal，Firebase Provider 也保留原行为。副本包名、证书和 Launcher category 变化可能让通知注册、动态资源名称查找或 `getLaunchIntentForPackage()` 降级；既有通知代码包含 null 处理，但尚未实机证明全部通知分支。未发现困难 AI 对这些通知路径的依赖。不要为此修改困难代码或以规则回退掩盖启动错误。

每个副本是独立包和独立私有 WebView 目录，无需为跨包隔离调用 `WebView.setDataDirectorySuffix`。如果未来改为同包多进程，才需在首次 WebView 使用前为各进程分配不同 suffix。[WebView 官方契约](https://developer.android.com/reference/android/webkit/WebView#setDataDirectorySuffix(java.lang.String))。

## 其他路径与剩余运行边界

- 原包没有可复用的额外 process 组件；instrumentation 的 targetProcesses 选择已有目标进程，并不会替未声明的原包凭空建立 4 个完整 Activity 宿主。
- companion Activity 方案原则上可行，但必须解决原 APK ClassLoader、AssetManager、native library 和 Gdx/Activity 的一致宿主环境；仅 `createPackageContext` 或 new Activity 不足。当前副本方案避免这一重建。
- root `app_process` 缺少正常 Activity token/应用启动环境，且特权 UID 下 WebView 有平台限制；不建议为了该捷径修改系统服务或 WebView 限制。
- 2/4 个正常应用进程在后台仍可能被 Android 内存回收、WebView 调度或 MIUI 冻结。包隔离解决静态竞争，不保证 2 倍/4 倍速度。应分别记录 PID/UID、各包 Activity 与 Gdx 绑定、实际动作进度和进程退出，继续使用现有每进程资源守护。
- 调度器、注入器和所有输出路径必须绑定副本包名及其本次 PID，避免硬编码原包的 force-stop/路径。任务分配按唯一 parentId 分片，不能多个副本重复完成同一局后累计。

本审查没有修改 APK builder、生产 worker、历史数据或手机配置。
