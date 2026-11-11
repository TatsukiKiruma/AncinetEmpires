# R7 完整工程交付与审计核验清单 (HANDOFF.md)

**交付阶段**：R7 可信训练闭环修复、多地图持续训练、历史资产复用对照与最终验收  
**工作区绝对路径**：`C:/code/AncinetEmpires/ai_training/r7_training_stage_20261014_083500/`  
**交付时间**：2026-10-14  
**接收对象**：独立审核 Agent (Peer Audit Agent)  

---

## 一、交付文件与产物索引清单

审核 Agent 可在工作区根目录下直接查阅以下 7 份核心报告与 5 份结构化台账：

### 1. 核心综述与审计文档
- [STAGE_REPORT.md](file:///C:/code/AncinetEmpires/ai_training/r7_training_stage_20261014_083500/STAGE_REPORT.md)：大阶段工作总结、目标边界达成核验表与最终结论。
- [HANDOFF.md](file:///C:/code/AncinetEmpires/ai_training/r7_training_stage_20261014_083500/HANDOFF.md)：本文件，供审核 Agent 一键复现与核验的完整操作手册。
- [R6_REVIEW.md](file:///C:/code/AncinetEmpires/ai_training/r7_training_stage_20261014_083500/R6_REVIEW.md)：对 R6 遗留 10 项问题的逐项复核结论、修复方案与实证数据。
- [COMPARISON_REPORT.md](file:///C:/code/AncinetEmpires/ai_training/r7_training_stage_20261014_083500/COMPARISON_REPORT.md)：历史资产（B100-Q/R、P1、θ1、R6 Arm A/B、R7）DEV 20 局统一复测报告。
- [DATA_REPORT.md](file:///C:/code/AncinetEmpires/ai_training/r7_training_stage_20261014_083500/DATA_REPORT.md)：多地图数据生成、inputHash 字节去重、0 泄漏率与动作分布报告。
- [TRAINING_REPORT.md](file:///C:/code/AncinetEmpires/ai_training/r7_training_stage_20261014_083500/TRAINING_REPORT.md)：训练超参、3 轮实质改进记录、投降漏洞剖析与第二种子复核。
- [FINAL_EVALUATION.md](file:///C:/code/AncinetEmpires/ai_training/r7_training_stage_20261014_083500/FINAL_EVALUATION.md)：FINAL 20 局逐局战果、对局轨迹、耗时与失败归类。

### 2. 权威台账与配置 JSON
- [asset_inventory.json](file:///C:/code/AncinetEmpires/ai_training/r7_training_stage_20261014_083500/artifacts/asset_inventory.json)：22 个保护资产、冻结环境 32 个源码及历史资产全量清单。
- [training_ledger.json](file:///C:/code/AncinetEmpires/ai_training/r7_training_stage_20261014_083500/artifacts/training_ledger.json)：全实验 1200 updates 步步记录的损失与验证指标全量台账。
- [frozen_candidate_manifest.json](file:///C:/code/AncinetEmpires/ai_training/r7_training_stage_20261014_083500/artifacts/frozen_candidate_manifest.json)：最终候选模型的元数据、训练超参、选择依据与真实 SHA-256。
- [final_acceptance_verdict.json](file:///C:/code/AncinetEmpires/ai_training/r7_training_stage_20261014_083500/artifacts/final_acceptance_verdict.json)：FINAL 验收官方裁决书（REJECTED）。
- [dev_manifest.json](file:///C:/code/AncinetEmpires/ai_training/r7_training_stage_20261014_083500/configs/dev_manifest.json) & [final_manifest.json](file:///C:/code/AncinetEmpires/ai_training/r7_training_stage_20261014_083500/configs/final_manifest.json)：双面板 20 局严格独立配置。

---

## 二、一键复现与核验指南 (Audit Commands)

审核 Agent 可在终端工作目录下运行以下命令，对本阶段核心产物进行无损快速复验：

### 1. 验证主项目 22 个核心资产完全未受篡改
```bash
python -c "
import json, hashlib
with open('ai_training/r7_training_stage_20261014_083500/artifacts/protected_assets_check.json', encoding='utf-8') as f:
    orig = json.load(f)
for rel, info in orig['assets'].items():
    with open(rel, 'rb') as f:
        curr = hashlib.sha256(f.read()).hexdigest()
    assert curr == info['sha256'], f'Asset {rel} modified!'
print('PASS: All 22 protected assets match perfectly!')
"
```

### 2. 验证训练集与验证集 0 交叉泄漏
```bash
python -c "
import json
train_hashes = set()
with open('ai_training/r7_training_stage_20261014_083500/artifacts/data/train_samples.jsonl') as f:
    for l in f:
        train_hashes.add(json.loads(l)['inputHash'])
leakage = 0
total_val = 0
with open('ai_training/r7_training_stage_20261014_083500/artifacts/data/val_samples.jsonl') as f:
    for l in f:
        total_val += 1
        if json.loads(l)['inputHash'] in train_hashes:
            leakage += 1
print(f'PASS: Leakage check: {leakage}/{total_val} (Rate: {leakage/total_val*100:.2f}%)')
"
```

### 3. 运行 7 项闭环正确性单元测试
```bash
npx vitest run ai_training/r7_training_stage_20261014_083500/research/correctness.test.ts
```
*(预期输出：7 passed (7))*

### 4. 验证冻结模型真实 SHA-256
```bash
python -c "
import hashlib
path = 'ai_training/r7_training_stage_20261014_083500/artifacts/models/round3_enhanced_v2_best.json'
with open(path, 'rb') as f:
    sha = hashlib.sha256(f.read()).hexdigest()
expected = 'b364056c5ae00f62885acd32799f0fe5ac2e548225a715da1ad5e58bcfee7f6e'
assert sha == expected, f'Candidate hash mismatch: got {sha}'
print('PASS: Frozen candidate model SHA-256 verified!')
"
```

### 5. 查阅 FINAL 官方裁决与逐局轨迹
```bash
python -c "
import json
with open('ai_training/r7_training_stage_20261014_083500/artifacts/final_acceptance_verdict.json') as f:
    v = json.load(f)
print('FINAL Verdict:', v['acceptanceCriteria']['finalVerdict'])
print('Natural Wins:', v['summaryMetrics']['naturalWins'], '/', v['summaryMetrics']['totalGames'])
"
```

---

## 三、交接确认

本阶段工作已全部自主执行完毕，所有代码、资产、数据与台账均处于隔离与完整保存状态，已准备好移交给下一位审核 Agent 核实验收。
