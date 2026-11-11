# 手机独立采集

设备 `c2357770`，2026-10-22 15:49 本地启动。电脑部署进程已经退出；手机 root 调度器的 PPID 为 1，标准流全部指向手机文件，不依赖 ADB 会话。第 3 局使用新尝试 `hts1000-20261022-0003-a02`，保留此前断线与启动失败现场。前两局沿用 PC 已保存回执，剩余 998 局的原父局、地图和 seed 继承冻结计划。

手机控制目录：`/data/local/tmp/aeii-hard-standalone-20261022-02`。根 `STATE.json` 保存完成数与当前尝试，`completed.tsv` 保存逐局完成记录；配置、冻结脚本、启动器日志均在手机。单局状态位于应用私有 `files/.aeii-hard-standalone/hard1000-20261022-02/<attemptId>/STATE.json`。

原始数据在应用私有 `files/.aeii-hard-collect/<attemptId>/`，包括 config、initial、final、gzip actions、gzip states、result、gzip decision-evidence 七件。每局收尾后新增 `artifact-manifest.json` 和 `safe-cleanup-receipt.json`，原始 SHA 与父局身份一并保存。完成计数表示采集完成，独立规则重放及训练准入仍后置。

手机本地 root shell 使用官方 Android arm64 Frida inject 17.2.5 逐局启动全新应用进程，原有一父局/一线程/一引擎限制保持。手机局内驱动独立等待 worker 结束并完成 UI 收尾、流关闭与摘要记录，再由手机调度器退出本局进程、启动下一局。没有 PC 常驻调度器或 PC Frida 连接。

官方压缩资产 SHA256：`73c3126b9900837aed429e9ae721283c347833481ee4594da436c3069bde247f`，已与 GitHub release asset digest 比对；未修改的解压 ELF SHA256：`5566391c8b1741cf66c1ab82d80bfb024b5d9291c6f819b3a9c5162b4c78ea1f`。APK 身份未改，每局在进程内重新核验指定困难 APK SHA。

电量/温度/空间守护在手机执行，低电或过热时暂停，恢复后继续。任务持有内核及应用局内部分唤醒锁。手机重启或人为强制停止不在自动恢复范围；失败时保留现场并停止后续调度，不能把失败计为完成。

重新连接后读取手机控制目录中的 `STATE.json` 可获得实时状态。需要停止时，在控制目录新建空 `STOP` 文件；局内驱动等在途动作安全结束，不再启动下一局。不要直接杀正在执行动作的注入进程。所有手机数据保留，导回后按原始文件摘要核对。

源码与配置在 `source/`、`configs/`、`SOURCE_SHA256.json`。根目录运行入口为 `tools/phone_training_hard/prepare_standalone.py` 与 `deploy_standalone.py`，本轮进程环境明确设置 `AEII_STANDALONE_ROUND=02`。已有运行目录禁止覆盖或重复启动。
