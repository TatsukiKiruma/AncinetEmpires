# T00: 环境与版本冻结报告

- **执行日期**：2026-10-13
- **工作区绝对路径**：`C:\code\AncinetEmpires\ai_training\r4_teacher_stage_20261013_121700`
- **规则版本**：`apk-4.2.5.1-rules-20261013-r4`
- **环境交付包 SHA-256**：`323924ab76a8272322f4b122d64e4af4ff2574a85c6a4d996bf4cb9680bffea8`（与策略包 `plan_defaults.yaml` 严格一致）
- **状态判定**：**PASS**

---

## 1. 独立环境解压与文件哈希核验

1. 从 `deliverables/AncientEmpires-clean-environment.zip` 解压至独立子目录 `env/`。
2. 对照 `DELIVERY_MANIFEST.json` 中列出的全部 62 个文件进行 SHA-256 逐一核验：
   - 匹配文件数：62 / 62
   - 不匹配文件数：0
   - 缺失文件数：0
   - 规则与基线源码哈希完全一致。

## 2. 硬件与运行环境信息

- **操作系统**：Windows 11 (10.0.26340-SP0 AMD64)
- **处理器**：AMD64 Family 26 Model 68 Stepping 0 (16 逻辑核心)
- **物理内存**：47.1 GB
- **Node.js**：v22.18.0
- **Python**：3.12.10 (MSC v.1943 64 bit)
- **PyTorch**：2.14.0+cpu（CUDA 可用状态：`False`，GPU 不可用单列，不阻断 CPU 搜索教师验证）

## 3. 锁定依赖安装与五项标准验证

在独立环境 `env/` 目录下执行锁版本安装与全部验证，无任何网络解析假冒：

| 命令 | 退出码 | 耗时 | 结果说明 | 日志文件 |
|---|---|---|---|---|
| `npm ci --prefer-offline` | 0 | 9.0s | 成功安装锁定依赖 239 个包 | `artifacts/logs/t00_npm_ci.log` |
| `npm run lint` | 0 | 2.34s | `tsc --noEmit` 类型检查通过，无错误 | `artifacts/logs/t00_npm_lint.stdout.log` |
| `npm test` | 0 | 8.99s | 12 个测试套件，285 项测试全部通过 | `artifacts/logs/t00_npm_test.stdout.log` |
| `npm run build` | 0 | 1.78s | `tsc -p tsconfig.build.json` 构建通过 | `artifacts/logs/t00_npm_build.stdout.log` |
| `npm run smoke` | 0 | 0.64s | 游戏回合运行冒烟示例通过 | `artifacts/logs/t00_npm_smoke.stdout.log` |
| `npm run smoke:ai` | 0 | 4.12s | HeuristicAI 与 ApkLikeAI 各 100 步冒烟通过 | `artifacts/logs/t00_npm_smoke_ai.stdout.log` |

## 4. 边界与受保护资产核验

- 主项目源码（`src/`、`tools/`、`package.json` 等 14 个核心文件）在开始时记录基线 SHA-256，保存于 `artifacts/source_manifest.json`。
- 本阶段所有新增代码、配置与报告严格限定在 `C:\code\AncinetEmpires\ai_training\r4_teacher_stage_20261013_121700`，不修改主项目。
- 独立环境内部的游戏规则（`env/src/game/*`）视为只读，后续研究通过接口调用。
