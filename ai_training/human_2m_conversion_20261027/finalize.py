"""封存转换产物与真实缺口；不调用游戏、手机或训练器。"""
import collections
import csv
import gzip
import hashlib
import json
from pathlib import Path

OUT=Path(__file__).resolve().parent
def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def sha(p):
    h=hashlib.sha256()
    with Path(p).open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()

result=read(OUT/'CONVERSION.json');counts=collections.Counter();rows=[]
for receipt in result['reports']:
    p=OUT/receipt['output'];assert sha(p)==receipt['outputSha256']
    local=collections.Counter();end=None
    with gzip.open(p,'rt',encoding='utf8') as f:
        for line in f:
            r=json.loads(line)
            if r['kind']=='end':end=r
            if r['kind']!='sample':continue
            assert r['controller']['type']==1 and r['policyMask'] and not r['valueMask'] and not r['returnMask']
            assert r['candidateCount']>1 and r['macroAtomicCount']>0
            local[r['admission']]+=1
    assert sum(local.values())==receipt['convertedRows'] and end['complete']==receipt['complete']
    counts.update(local if receipt['complete'] else {'incomplete_source_rows':sum(local.values())})
    rows.append({k:receipt.get(k) for k in ['sourceId','kind','split','convertedRows','trainAdmittedRows','devRows','pendingRows','stateIdentityPendingRows','excludedRows','sourceStateMatches','sourceStateDifferent','complete','error','output','outputSha256','bytes']})
with (OUT/'MULTIPLAYER_CONVERSION.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.DictWriter(f,list(rows[0]));w.writeheader();w.writerows(rows)
campaign=read(OUT/'CAMPAIGN_RESULT.json');verification=read(OUT/'FORMAT_VERIFICATION.json')
frames=read(OUT/'train-admitted.frames.gz.json');assert frames['rows']==counts['train_admitted']
assert sha(OUT/'train-admitted.frames.gz')==frames['sha256']
summary={'status':'multiplayer_converted_campaign_blocked','multiplayerSources':result['total'],
 'completeMultiplayerSources':result['completeSources'],'failedMultiplayerSources':result['total']-result['completeSources'],
 'completeSourceRowsByAdmission':dict(counts),'trainTensorRows':frames['rows'],'trainTensorSha256':frames['sha256'],
 'campaignEliteSources':65,'campaignMacrosPrepared':sum(r['macros'] for r in campaign['reports']),'campaignTrainingRows':0,
 'campaignBlocker':'现存材料没有逐决策原生状态或事件控制者；没有可复用的完整PC战役运行时，禁止将地形/宏动作替代真实前态。',
 'pendingAdmissionBlocker':'原14份永久排重索引缺失12份；旧来源级验收不能替代新增逐行全集排重。',
 'formatVerified':verification['passed'],'trainingStarted':False,'optimizerUpdates':0,'phoneOperations':0,
 'newReplayValidation':False,'conversionStateAdvances':sum(r['advancedAtoms'] for r in result['reports']),
 'notes':'转换执行一次必要的前态重建；没有重复strict/forced/原生重放验收。既有414局任务未操作。'}
(OUT/'SUMMARY.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
report=f'''# 人类数据转当前 2M 格式（2026-10-27）

多人转换已完成：{result['completeSources']}/{result['total']} 份来源完整转换，失败 {result['total']-result['completeSources']} 份。**65 份战役仅完成宏记录准备，训练格式转换仍受缺少原生决策状态阻塞。没有启动训练，没有操作手机或现有 414 局任务。**

| 当前产物 | 行数／份数 | 使用范围 |
|---|---:|---|
| 已准入真人训练张量 | {counts['train_admitted']} | 来自既有最终准入前缀；value/return 关闭 |
| 完成格式转换但待完整排重 | {counts['pending_full_exclusion']} | 保留真实状态和标签，默认 reader 拒绝训练 |
| 重建前态摘要与旧记录不同 | {counts['pending_state_identity']} | 保留当前转换状态，训练和开发用途均关闭 |
| 开发真人状态 | {counts['dev']} | 保持旧 dev 分区，只允许开发读取 |
| 已命中现存排重／开发摘要的状态 | {counts['excluded']} | 保留证据，禁止训练 |
| elite 战役宏记录 | {sum(r['macros'] for r in campaign['reports'])}／65 份 | source 格式，不是训练样本；policy/value 关闭 |

上述是当前转换结果，不复用旧 117,510 总量作为新样本数。只输出真人席位决策，AI 席位动作用于必要的状态重建；不把它们混入真人训练。去除 end_turn、surrender 及只有单候选的行。宏展开的原子权重为 1/k，保留 macro/subAction。输入来源为 294 份有 policy 的旧来源包、3 份最终前缀、18 份新增且已有 strict 通过记录的响应；两份旧纯投降、重复下载和未验收分歧没有混入。

**输出格式**：`states/*.jsonl.gz` 是逐决策完整状态、候选集合摘要、动作码、控制者和准入状态；`encode.mts` 只读这些前态生成与当前训练器一致的 `dual-v2-le-typedarrays-v1` 张量帧。编码器不推进游戏状态，复用公共 encoder、完整候选、sourceIndices 映射和 softPriors。`train-admitted.frames.gz` 已实际生成，不只是配置文件，可由 `reader.read_frames(..., purpose='train')` 直接读取为当前 2M 模型需要的 tensor 字典。其余状态保留为惰性编码格式，没有预先落盘全量密集张量，也没有宣称每条待准入数据都已完成模型前向检查。

训练帧 SHA-256：`{frames['sha256']}`。全部训练帧已被 Python 完整读取并核对帧／数组 SHA、形状、目标范围和有限数值。冻结的 1,966,910 参数 2M 模型仅做前向检查，单样本与批前向比较见 `FORMAT_VERIFICATION.json`；没有构建优化器，没有 backward/step，也没有更新 checkpoint。

**验收复用边界**：旧源文件／收据 SHA 先绑定；转换仅为生成前态顺序消费一次已验收动作，没有调用 validateBatch、validateApkReplay、stepStrict、forced 或原生验收器，也没有终局回合／评分二次验收。当前候选映射、已准入前缀前态身份和输出数值检查属于转换合同，不能取消，否则会生成错误训练标签。必要状态推进数记录在 SUMMARY，不声称本次为纯静态处理。

**未把待准入行冒充训练行**：原永久排重全集 14 个文件缺失 12 个。当前使用现存索引与保存的 dev 前态继续排除命中项；其余旧来源／新增响应保持 `pending_full_exclusion`。原 615 条真人前缀有既存最终逐行准入收据；本次还要求前态身份一致及非单候选，最后 {counts['train_admitted']} 条放入 train。开发仍保留 dev；默认 reader 对开发、待准入、已排除数据拒绝训练。待准入不表示历史验收失败，只表示当前缺少完整的训练隔离证据。

另有转换前态摘要与旧记录不一致的情况，可能包含规则版本或状态字段变化，不能直接断言动力学错误，也不能用旧验收覆盖当前前态。未命中其他排除条件的这类行单列 `pending_state_identity`，连同历史 dev 来源也默认禁止作为当前开发样本；原 train/dev 归属字段保留不变。这里只收紧新产物的用途，没有重新做规则重放验收。

**战役的具体缺口**：65 份 elite 的 seed、w 对象、act、地图、脚本和既有原生回执都已绑定；`campaign-source/` 保存完整宏顺序。历史回执只包含终态摘要及结果，没有逐决策前态，控制者还受脚本和阵营变化影响。本地原 APK 的 DEX／反编译文本不能直接充当可复用 PC 原生运行时。当前通用 GameEngine 也不是 25 关原生脚本队列的完整实现；另写一个近似战役执行器会超出已有验收证据。故没有伪造 state、合法候选或真人归属，65 份训练行明确为 0。

继续完成战役需要独立的原生决策状态导出或已有等价快照材料，保持整段动作先入队及原生事件顺序，仅在真实决策边界取前态；不是再次做终局验收。当前没有操作正在训练的手机，也没有自动安排以后执行。取得这些状态后才可接入同一 2M 编码器。

文件入口：`MULTIPLAYER_CONVERSION.csv` 为逐来源输出；`PLAN.json` 绑定输入与旧验收；`CONVERSION.json` 记录完成／失败及计数；`CAMPAIGN_RESULT.json` 明确战役准备状态；`reader.py` 是独立只读 reader。未改当前手机训练器或自动接入其作业。

只读编码命令示例（从仓库根运行，输出必须使用新文件名）：

```powershell
node ai_training/run.mjs node --import tsx human_2m_conversion_20261027/encode.mts --mode train --output human_2m_conversion_20261027/train-new.frames.gz
```

此命令只编码，不训练。`--mode dev` 单独导出开发；`--mode inspect` 每来源取一条诊断帧并将 policyMask 关闭，不能作为训练数据绕过准入。独立 TypeScript 检查通过；不重跑公共游戏测试或旧回放验收。
'''
(OUT/'REPORT.md').write_text(report,encoding='utf8')
files=[{'path':str(p.relative_to(OUT)).replace('\\','/'),'sha256':sha(p),'bytes':p.stat().st_size} for p in sorted(OUT.rglob('*')) if p.is_file() and '__pycache__' not in str(p) and p.name!='DELIVERY_MANIFEST.json']
(OUT/'DELIVERY_MANIFEST.json').write_text(json.dumps({'files':files,'bytes':sum(x['bytes'] for x in files)},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps(summary,ensure_ascii=True))
