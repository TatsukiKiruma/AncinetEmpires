# AncinetEmpires 项目协作说明

本文件适用于仓库及子目录。修改前检查 git status --short，保留他人的代码、实验和报告。

## 公共代码

- 全程中文沟通，新增代码注释和默认用户文案使用中文。
- src/main.tsx、src/App.tsx、src/index.css 是界面入口；保持现有布局和交互。新增模块按单一职责分文件，展示与规则逻辑分离。
- src/game/types.ts 定义状态与动作；rules.ts、engine.ts、env.ts 分别负责合法动作、执行结算和环境封装。外部算法复用权威引擎，不另写规则。
- 默认地图来自 src/game/default_state.ts 和 apk_skirmish_map_assets.ts；生成的地图资产文件不能手工编辑。
- src/game/ai/ 是应用策略与推理；runtime/ 是共用前向、编码和搜索实现，不能依赖训练脚本或实验目录。
- tools/ 保存公共规则验证和资源工具；docs/README.md 是公共文档入口。研究工作只在进入 ai_training/ 后读取该目录的协作要求。

## 验证与规则约束

- 公共检查为 npm run lint、npm test、npm run build。训练工作区有独立检查，不能互相替代。
- 修改动作与回合结算时核对 getLegalActions、GameEngine、AncientEmpiresEnv 的编码、mask、初始收益与克隆一致性，并增加可复现回归。
- APK SD/SO、官方地图来源和地形可信度按现有实现及证据维护，不为单个样本放宽全局规则。APK 原始资源检查依赖本地解包目录，缺失不能记为通过。
- forced 回放校验与 strict 合法动作诊断结论不能互换。详情见 docs/apk-analysis/APK_RULE_ALIGNMENT_HANDOFF.md。
- 环境截断、代理奖励与自然胜负必须分开，见 docs/environment/interface.md。
- 不删除历史模型、数据和归档证据；不提交账号配置、密钥、本地 APK 解包资源和训练大文件。
