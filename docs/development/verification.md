# 开发验证

公共应用：

首次安装依赖后执行 `node ai_training/run.mjs --prepare`，为手机采集工具与研究源码建立支持链接。此命令不启动任何采集或训练。

```text
npm run lint
npm test
npm run build
```

类型检查和测试默认覆盖应用、公共规则与公共工具；归档副本、训练实验及本地产物不参与默认扫描。训练工作区有独立的类型检查和测试命令，不能以公共检查通过代替训练验证。

APK 资源复核使用 `npm run apk:map-report -- --check`、`apk:terrain-report`、`apk:unit-report`、`apk:language-rule-report`、`apk:skirmish-rule-report`、`apk:script-report`、`apk:dex-report` 和 `apk:training-report`。后者检查通用场景与环境合同，不是训练结果评估。读取原始资源的命令依赖本地 `APK/_analysis/unpack/`；缺失时不能记为通过。

独立交付副本应在自己的目录执行 `npm ci`、`npm run lint`、`npm test`、`npm run build`、`npm run smoke`。只交付生成目录，不附带原仓库的 Git 历史、账号配置或运行缓存。
