# 远古帝国游戏与规则环境

项目提供 TypeScript 战棋规则引擎、Gym-like 环境，以及 React/Vite 中文对局界面。界面与环境复用同一套规则；应用保留现有 AI 选择和已发布模型。

## 运行

```text
npm ci
npm run dev
npm run lint
npm test
npm run build
```

默认对局为官方 Duel 地图、SD 遭遇战。环境不依赖界面，可直接使用内置地图运行。

## 文档

- [文档索引](docs/README.md)
- [规则入口](docs/rules/README.md)
- [状态、动作、奖励和终止语义](docs/environment/interface.md)
- [开发验证](docs/development/verification.md)
- [APK 规则与回放证据](docs/apk-analysis/APK_RULE_ALIGNMENT_HANDOFF.md)

## 项目分区

`src/` 是应用与公共规则，`tools/` 是公共规则工具。既有模型研究集中在 [ai_training](ai_training/README.md)，训练接手要求仅在其目录内维护。完整应用不需要研究目录即可运行。

## 独立研究交付

`npm run export:clean` 生成 `deliverables/clean_workspace/`。已有目标不会被覆盖；可用 `npm run export:clean -- --out deliverables/新的目录名` 生成新副本。

该副本是无界面的公共游戏环境，包含内置地图、接口说明、规则测试和最小合法动作示例，不包含旧策略、模型、实验、Git 历史或账号配置。可将生成目录整体交给独立研究者。原项目界面及已发布 AI 保持原样。

需要压缩包时运行 `pwsh -File tools/package_clean_workspace.ps1`。打包器按交付清单核对哈希，只包含源码和文档，不包含安装后的依赖、缓存或编译目录；已有压缩包不会覆盖。
