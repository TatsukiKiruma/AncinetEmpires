import pathlib, json, gzip, hashlib, shutil
import numpy as np
import torch
from reference import forward, best, VW, ROOT

sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def candidate():
    initial = np.asarray(json.loads((ROOT/'initial.json').read_text(encoding='utf-8-sig')))
    weights = np.frombuffer((ROOT/'best.bin').read_bytes(), dtype='>f8').astype(np.float64)
    last = np.frombuffer((ROOT/'last.bin').read_bytes(), dtype='>f8').astype(np.float64)
    assert len(weights) == len(initial) and np.isfinite(weights).all() and np.isfinite(last).all()
    assert np.array_equal(weights[VW:], initial[VW:]) and np.array_equal(last[VW:], initial[VW:])
    epochs = [json.loads(line) for line in (ROOT/'training.jsonl').read_text(encoding='utf-8-sig').splitlines()]
    result = dict(schema=json.loads((ROOT/'schema.json').read_text(encoding='utf-8-sig')), weights=weights.tolist(), policyOnly=True, valueHeadFrozen=True, valueCalibrated=False, promoted=False, independentStrengthEvaluated=False, bestEpoch=epochs[-1]['bestEpoch'], selectionSha256=sha(ROOT/'selection.json'), gateSha256=sha(ROOT/'GATE.json'), initialSeed=30061016, priorWeightsLoaded=False)
    (ROOT/'candidate.json').write_text(json.dumps(result,separators=(',',':')))
    with gzip.open(ROOT/'encoded.jsonl.gz', 'rt') as f, gzip.open(ROOT/'trained-reference.jsonl.gz','wt') as out, torch.no_grad():
        for line in f:
            logits, value = forward(json.loads(line), torch.tensor(weights,dtype=torch.float64))
            z = logits.tolist()
            out.write(json.dumps(dict(logits=z,value=value.item(),best=best(z)),separators=(',',':'))+'\n')
    (ROOT/'checkpoint-audit.json').write_text(json.dumps(dict(passed=True,bestSha256=sha(ROOT/'best.bin'),lastSha256=sha(ROOT/'last.bin'),candidateSha256=sha(ROOT/'candidate.json'),valueHeadWeightsUnchanged=True,changedPolicyParameters=int(np.count_nonzero(weights[:VW]-initial[:VW])),bestEpoch=result['bestEpoch']),indent=2))
    print(json.dumps(dict(bestEpoch=result['bestEpoch'],candidateSha256=sha(ROOT/'candidate.json'))))


def report():
    audit = json.loads((ROOT/'data-audit.json').read_text(encoding='utf-8-sig')); selection = json.loads((ROOT/'selection.json').read_text(encoding='utf-8-sig'))
    epochs = [json.loads(line) for line in (ROOT/'training.jsonl').read_text(encoding='utf-8-sig').splitlines()]
    proc = json.loads((ROOT/'training-process.json').read_text(encoding='utf-8-sig')); cp = json.loads((ROOT/'checkpoint-audit.json').read_text(encoding='utf-8-sig'))
    browser = json.loads((ROOT/'trained-browser-parity.json').read_text(encoding='utf-8-sig')); assert browser['trainedCheckpointBrowserPassed']
    # 只清理本轮可从gzip逐字节恢复的临时二进制，不动历史文件。
    removed = []
    raw = ROOT/'trial.bin'
    if raw.exists():
        expected = sha(raw)
        assert hashlib.sha256(gzip.decompress((ROOT/'trial.bin.gz').read_bytes())).hexdigest()==expected
        removed.append(dict(path=raw.name,bytes=raw.stat().st_size,sha256=expected,recoverableFrom='trial.bin.gz'))
        raw.unlink()
    (ROOT/'recoverable-cleanup.json').write_text(json.dumps(removed,indent=2))
    size = sum(p.stat().st_size for p in ROOT.rglob('*') if p.is_file()); free = shutil.disk_usage(ROOT).free
    assert size < 512*1024**2 and free > 12*1024**3
    e0 = epochs[0]; eb = next(e for e in epochs if e['epoch']==cp['bestEpoch'])
    build_samples = [json.loads(line) for line in (ROOT/'build.log').read_text(encoding='utf-8-sig').splitlines() if line.startswith('{')]
    build_rss = max(r.get('rss', r.get('resources', {}).get('rss', 0)) for r in build_samples)
    overlap = audit['overlaps']; shared = len(audit['sharedValidationRoots'])
    detail = json.loads((ROOT/'overlap-detail.json').read_text(encoding='utf-8'))
    quarantine = sum(r['quarantinedMacroTail'] for r in audit['receipts'])
    gates = json.loads((ROOT/'GATE.json').read_text(encoding='utf-8')); changed = []
    for n,h in gates['bindings'].items():
        p = ROOT.parent.parent/n
        if sha(p)!=h: changed.append(n)
    assert not changed, changed
    summary = dict(completed=True,scope='300原生双人SD父局开发试验',fullTrainingStarted=False,fullTrainingRequiresUserConfirmationInThisChat=True,splits=selection['splits'],epochs=epochs,checkpoint=cp,overlap=overlap,sharedValidationRoots=shared,trajectoryAudit=detail,quarantinedSourceMacroTail=quarantine,resources=dict(phaseBytes=size,freeBytes=free,wallSeconds=proc['wallSeconds'],cpuSeconds=proc['cpuSeconds'],buildSampledRssBytes=build_rss,peakWorkingSetBytes=max(r['peakWorkingSetBytes'] for r in proc['resourceSamples']),minimumFreeBytes=min(r['freeBytes'] for r in proc['resourceSamples'])),gateBindingsUnchanged=True,independentEvaluationPerformed=False,promoted=False)
    (ROOT/'RESULT.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    pct = lambda x:f'{x*100:.2f}%'
    lines = ['# 300父局训练与开发验证结果','', '已完成授权的300父局阶段；全量训练未启动，等待用户在本会话明确确认。没有晋升、接入应用、RL或独立对局评测。','', '## 固定数据与划分','',f'来源为固定3000父局快照内1922个实际双人SD合格原生父局，分层固定抽取300。训练240局/88,998原子/54,655宏权重，开发验证60局/16,071原子/9,902宏权重；合计105,069条，使用所选父局全部合格数据。每宏展开k步各1/k；没有父局等权重重采样。所选父局各1个已采集段，无跨分区父ID/续段；来源地图名不作为人数依据。真实回放、其他人数和SO未混入。', '',f'固定seed=sd300-20261016-v1；按地图、planId、planKind最大余数分层抽样，再分配240/60。清单SHA：`{sha(ROOT/"selection.json")}`。源release/parent索引/summary及所选收据/分片SHA对照封存DELIVERY_MANIFEST，gzip/CRC、收据截止、前后态、动作码双射、有序完整候选和宏权重均复用权威reader/引擎复核。封存modelSchemaAccepted及历史分区没有改写。', '', f'300局全部合格原子模型编码通过：非法0、拒绝0、实体截断0。源隔离宏尾部共{quarantine:,}步保持隔离；不能把前缀当完整自然对局。训练阶段没有新环境回合或对局，因此不存在可报告的胜率、自然终局率或对局截断率。', '', '## 模型与训练', '',f'本阶段schema版本sd-entities-pilot-v2，字段字典从训练状态与旧合同预留字段建立后冻结，最终未新增任何字段键；维度{audit["featureDimensions"]}，嵌入8维，共{audit["parameters"]}参数。完整实体与共享前向算式沿用旧实现，本阶段副本与schema位于专属目录；旧src/ai_runtime/sd_v1未修改。验证未用于调字段、预训练或选择初始化。新初始化LCG seed=30061016，无旧candidate权重；value头参数冻结、未校准，不用于估值。', '',f'固定batch8，SGD0.02，梯度范数裁剪1，batch内按实际宏权重和归一化；末批6条保留，每epoch88,998条、11,125次更新。各轮连续更新，按固定epoch段排序遍历，段内时序保留。先完成epoch1闭环，再在最多10轮预算内继续；耐心2轮、最小改善1e-5，最佳选择只看开发验证加权交叉熵。实际{epochs[-1]["epoch"]}轮，最佳epoch{cp["bestEpoch"]}；10轮不是已证最优值。', '', '| 指标 | 初始化 | 最佳checkpoint |','|---|---:|---:|']
    for split, title in [('train','训练内'),('validation','开发验证')]:
        lines += [f'| {title}宏加权policy loss | {e0[split]["policyLoss"]:.6f} | {eb[split]["policyLoss"]:.6f} |',f'| {title}原子top1 | {pct(e0[split]["top1"])} | {pct(eb[split]["top1"])} |',f'| {title}宏加权top1 | {pct(e0[split]["macroWeightedTop1"])} | {pct(eb[split]["macroWeightedTop1"])} |']
    lines += ['', '这些是模仿标签诊断，只证明本阶段优化及开发验证结果，不能宣布棋力提升。合法性仅覆盖来源重建与编码；策略输出局限于合法候选，尚未实战评测。value头权重虽未更新，共享编码更新仍会改变其输出，不能作为已训练估值。', '', '## 重合与证据局限', '',f'60局中{shared}局规范语义初态与训练共享；完整轨迹与训练重复{len(audit["duplicateValidationTrajectoriesWithTrain"])}段。验证已编码前态之间的相邻语义状态对中{detail["validationSharedAdjacentStatePairs"]}/{detail["validationAdjacentStatePairs"]}与训练重合；最长共享根前缀逐局保存在overlap-detail.json。去metadata规则态、实体重命名语义态和实际稀疏网络输入分别审计，输入hash排除不进入前向的动作码字符串。实体语义摘要移除生成ID计数器、按实体属性重命名引用；对完全相同堆叠实体的引用置换没有证明完备不变性，不能据此主张严格独立。', '', '| 开发验证记录与训练交集 | 行数 | 占16,071条 |','|---|---:|---:|']
    for k,title in [('rule','去metadata规则态'),('semantic','实体重命名语义态'),('input','实际网络输入+候选')]: lines.append(f'| {title} | {overlap["validation"]["crossTrain"][k]} | {pct(overlap["validation"]["crossTrain"][k]/16071)} |')
    lines += ['', '219个地图+计划细层有大量单父局配额，60局按已冻结最大余数法分配后，仅覆盖5/7类计划；参数变体与优势残局未进入开发验证。300局仍覆盖全部7类，分布详见overlap-detail.json。没有看过模型成绩后改分区，但这意味着当前验证不能衡量上述两类、也不能代表整个1922父局桶；后续扩大训练需另建覆盖完整的开发面板。', '', f'上一轮2400条试训含1922父局的抽样，本次全部300父局已被数据/编码开发消费。与旧试训准确定位重合：训练{overlap["train"]["oldTrialExactLocatorRows"]}条、验证{overlap["validation"]["oldTrialExactLocatorRows"]}条；验证与旧试训语义态/网络输入重合分别{overlap["validation"]["oldTrial"]["semantic"]}/{overlap["validation"]["oldTrial"]["input"]}条。新初始化只隔离权重继承，无法抹去既有数据及方法开发消费。', '', '60局已用于早停/选模，是本阶段开发验证；以后用户确认全量训练时可以并入训练，但不能再用作那时最终评测。真正新父局最终独立评测须另按data_acceptance_20261016/INDEPENDENT_EVAL_PROTOCOL.md冻结并授权执行；本轮没有生成新评测父局。', '', '## 验收、资源与身份', '',f'训练前使用{audit["probes"]}个仅训练用途的全段位置探针完成独立Python编码、PyTorch/TS/PC Java/真实Chrome全候选前向与稳定argmax；Java/PyTorch完整梯度及Python/TS/浏览器有限差分均通过。阈值前向/解析梯度1e-8，有限差分1e-7，未放宽。GATE绑定源码、schema、初始化、300段二进制、选择与验收结果；训练后绑定重验通过。最佳checkpoint再次通过真实Chrome完整候选对照。具体误差见GATE.json及trained-browser-parity.json。公共lint、347测试及build通过，本阶段独立类型检查、14项来源reader回归与合同测试通过。训练工作区总lint仍有v15–v19历史类型错误，未通过；本轮没有改动这些文件，错误日志保留。', '',f'PC Java单线程、单核mask1、BELOW_NORMAL、384MiB堆；训练/验证进程墙钟{proc["wallSeconds"]:.2f}秒、CPU {proc["cpuSeconds"]:.2f}秒（含逐段gzip读取与各轮诊断），逐轮训练遍历耗时见training.jsonl。转换耗时{audit["elapsedSeconds"]:.2f}秒；转换RSS采样峰值{build_rss/1024**2:.1f}MiB；没有将编码、IO或评估开销冒充纯优化kernel时间。峰值工作集{summary["resources"]["peakWorkingSetBytes"]/1024**2:.1f}MiB。资源采样范围仅本轮PC进程，未监测或操作手机、ADB、APK/Frida或采集器。', '',f'当前本目录{size/1024**2:.1f}MiB，C盘空闲{free/1024**3:.2f}GiB，满足512MiB与12GiB水位；运行期间采样最低空闲{summary["resources"]["minimumFreeBytes"]/1024**3:.2f}GiB。中途将临时包改为单份逐段压缩稀疏流，首次未训练转换留摘要；仅删除本阶段可重建临时文件，历史数据/模型与对方目录未修改。', '',f'候选JSON SHA：`{cp["candidateSha256"]}`；最佳原始权重SHA：`{cp["bestSha256"]}`。checkpoint-audit.json绑定最佳/最后权重，RESULT.json含逐轮指标与资源；DELIVERY_MANIFEST.json封存本阶段交付文件。', '', '## 复现入口', '', '仓库根目录运行select.ts、build.ts；使用既有R8 venv Python运行reference.py、verify.py compress；Java8+旧试训固定ECJ编译本目录两份Java源；PortableTrainer verify对照trial.bin.gz后verify.py verify；check_node.ts、browser_runner.mjs、contract_test.ts和独立tsconfig通过后verify.py gate；run_train.py才允许训练。最后finalize.py candidate、post_browser_runner.mjs、finalize.py report。未获得新授权时不要执行300以外训练。检查记录见checks.json。', '', '下一步边界：等待用户在本会话明确确认正式全量训练；本结果不自动扩大到1922、3000或其他模式。']
    (ROOT/'REPORT.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    print(json.dumps(dict(completed=True,phaseMiB=size/1024**2,freeGiB=free/1024**3,bestEpoch=cp['bestEpoch'],bestValidation=eb['validation'])))


if __name__ == '__main__':
    import sys
    {'candidate':candidate,'report':report}[sys.argv[1]]()
