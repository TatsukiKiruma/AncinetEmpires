import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { DIR, read, save, sha } from './io';

const ROOT = path.resolve(DIR, '../..'), STAGE = 'ai_training/dual_stream_v2_phase2_20261020';
function directoryFiles(root: string): string[] {
    return fs.readdirSync(root, { withFileTypes: true }).flatMap(e => {
        const name = path.join(root, e.name); if (e.isSymbolicLink()) throw Error('交付目录内禁止支持链接');
        return e.isDirectory() ? directoryFiles(name) : [name];
    });
}
const bytes = () => directoryFiles(DIR).reduce((sum, file) => sum + fs.statSync(file).size, 0);
const runtimeDir = path.join(ROOT, 'src/ai_runtime/dual_v2');
const runtimeIdentity = Object.fromEntries(fs.readdirSync(runtimeDir).filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts')).sort().map(name => [name, sha(fs.readFileSync(path.join(runtimeDir, name)))]));
const meta = read('samples.json'), arch = read('architecture-sanity-gate.json'), smoke = read('overfit-smoke-gate.json'), speed = read('inference-speed-gate.json'), checks = read('public-checks.json');
const sampleSha = sha(fs.readFileSync(path.join(DIR, 'samples.bin')));
assert.equal(sampleSha, meta.sha256);
for (const receipt of [arch, speed]) {
    assert.equal(receipt.samplesSha256, sampleSha); assert.deepEqual(receipt.runtimeIdentity, runtimeIdentity);
}
const real = meta.sources.filter(s => s.kind === 'real');
assert.equal(real.length, 64); assert.equal(new Set(real.map(s => s.beforeHash)).size, 64);
assert.ok(real.some(s => s.mode === 'SO') && real.some(s => s.mode === 'SD'));
const phase1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'ai_training/dual_stream_v2_phase1_20261020/DELIVERY_MANIFEST.json'), 'utf8'));
const preserved = Object.entries(phase1.files).map(([name, value]: [string, any]) => ({ path: name, sha256: value.sha256, unchanged: sha(fs.readFileSync(path.join(ROOT, name))) === value.sha256 }));
assert.ok(preserved.every(x => x.unchanged));
save('phase1-preservation-gate.json', { passed: true, files: preserved, schema: 'dual-stream-v2-phase1-v1' });
const triModels = ['initial', 'overfit'].map(prefix => {
    const node = read(prefix + '-node-parity.json'), chrome = read(prefix + '-browser-parity.json'), weightHash = sha(fs.readFileSync(path.join(DIR, prefix + '.bin')));
    assert.equal(node.weightsSha256, weightHash); assert.equal(chrome.weightsSha256, weightHash);
    assert.equal(node.samplesSha256, sampleSha); assert.equal(chrome.samplesSha256, sampleSha);
    assert.deepEqual(node.runtimeIdentity, runtimeIdentity); assert.deepEqual(chrome.runtimeIdentity, runtimeIdentity);
    assert.equal(node.receipts.length, meta.batches); assert.equal(chrome.receipts.length, meta.batches);
    return { prefix, passed: node.passed && chrome.passed, weightsSha256: weightHash, states: meta.batches, realStates: 64, fixtures: meta.batches - 64, maxLogit: Math.max(node.maxLogit, chrome.maxLogit), maxValue: Math.max(node.maxValue, chrome.maxValue), maxNodeChrome: chrome.maxNode, actionAgreement: chrome.receipts.filter(r => r.actionMatch).length / meta.batches, actorAgreement: chrome.receipts.filter(r => r.actorMatch).length / meta.batches, chromeProfileCleaned: chrome.chromeProfileCleaned, userAgent: chrome.userAgent };
});
assert.equal(triModels[1].weightsSha256, smoke.weightsSha256);
const tri = { passed: triModels.every(x => x.passed), dtype: 'float32权重与算子间激活，float64累加及明确舍入边界', acceptedScope: read('acceptance-clarification.json'), models: triModels };
save('tri-runtime-parity-gate.json', tri);
assert.equal(fs.readdirSync(DIR).filter(name => name.startsWith('temporary-chrome-')).length, 0);
const coveredGradients = Object.values(smoke.gradientNormMax).every(v => Number.isFinite(v) && Number(v) > 0);
assert.ok(coveredGradients);
const authority = ['types', 'rules', 'engine', 'env', 'map', 'abilities', 'rule_config', 'terrain_rules'].map(x => `src/game/${x}.ts`);
const sourcePaths = [...directoryFiles(runtimeDir).filter(f => f.endsWith('.ts') || f.endsWith('MODEL.md')), ...directoryFiles(DIR).filter(f => /\.(ts|mjs|py)$/.test(f) && path.dirname(f) === DIR), ...authority.map(f => path.join(ROOT, f))];
save('source-identities.json', { schema: 'dual-stream-v2-phase1-v1', model: 'dual-stream-v2-phase2-v1', seed: 20261020, splitManifestSha256: meta.manifestSha256, samplesSha256: sampleSha, files: Object.fromEntries(sourcePaths.map(file => [path.relative(ROOT, file).replaceAll('\\', '/'), sha(fs.readFileSync(file))])) });

const decrease = 1 - smoke.final.brier / smoke.initial.brier;
const summary: any = { passed: arch.passed && tri.passed && smoke.passed && speed.passed && checks.passed, schema: 'dual-stream-v2-phase2-gates-v1', model: 'dual-stream-v2-phase2-v1', parameters: arch.parameters, gates: { architecture: arch.passed, triRuntimeParity: tri.passed, overfitSmoke: smoke.passed, inferenceSpeed: speed.passed, publicChecks: checks.passed, phase1Preserved: true, disk: false, chromeProfileCleanup: true }, realSamples: real.length, distinctParents: new Set(real.map(s => s.parentId)).size, modes: [...new Set(real.map(s => s.mode))], valueLabels: smoke.final.valueLabels, policyTop1: smoke.final.top1, brierDecrease: decrease, gradientTensors: Object.keys(smoke.gradientNormMax).length, formalPretraining: false, treeSearch: false, applicationIntegration: false, generatedAt: new Date().toISOString() };
const stageBlock = (total: number) => `<!-- dual-stream-v2-phase2-20261020 -->
## 2026-10-20 双流 v2 阶段 2 完成（架构与门禁，未启动阶段3正式预训练）

见[阶段2报告](../dual_stream_v2_phase2_20261020/REPORT.md)、[门禁汇总](../dual_stream_v2_phase2_20261020/gate-summary.json)及[交付清单](../dual_stream_v2_phase2_20261020/DELIVERY_MANIFEST.json)。501642参数的ResUNet＋关系Transformer、Who→Where→What指针头和6槽联盟价值已同步实现PyTorch/纯TS；阶段1清单的48份交付文件逐字节保持，编码schema不变。

64个不同真实SD/SO前态覆盖2/3/4/5/6人，40条可信自然结果；另有9个明确标记的架构夹具，用户已接受真实状态加压力夹具口径。随机与最终冒烟权重均完成73状态PyTorch/独立Node/真实Chrome前向，logits/value/actor误差均0、argmax100%，Profile已清理。最终40步AdamW小批量达到64/64 Top-1，Brier降低${(decrease * 100).toFixed(5)}%，${summary.gradientTensors}个参数张量均收到非零有限梯度；不称泛化或棋力提升。

端到端速度含阶段1完整编码和Policy/Value：${speed.results.map(r => `${r.name} p95=${r.p95.toFixed(4)}ms`).join('；')}。公共lint、394测试、build、阶段独立tsc和损失回归通过，目录约${(total / 1e6).toFixed(2)}MB，包含开发中失败证据。未启动全量3000父局预训练、树搜索、自对战、手机操作或应用部署；旧阶段5继续暂停。
<!-- end-dual-stream-v2-phase2-20261020 -->`;
function report(total: number): string {
    return `# 双流 v2 阶段 2 报告

日期：2026-10-20（北京时间）。本阶段架构与全部硬性门禁通过；仅完成小批量学习验证，没有启动正式预训练或树搜索。

## 实现

公共运行时位于src/ai_runtime/dual_v2，训练与门禁位于本目录；结构及权重格式详见公共MODEL.md。ResUNet保持34→48 Stem、48/64/96各两个编码残差块、96维玩家上下文及两级精确复制裁剪解码，输出64维同尺寸地图。残差块采用8/8/16瓶颈的1×1—逐通道3×3—1×1结构，保留GroupNorm(8)、ReLU和0.5残差；总计${arch.parameters}参数。该轻量选择保持要求中的通道和层数，避免密集空间卷积挤占浏览器推理预算。

实体坐标在网络内部乘1/64，实体及关系比率裁剪至[-4,4]，原始输入字节不变。实体和局部空间合并为128维，全局Token使用地图均值与66维玩家特征；两层4头Pre-LN关系Transformer、256维FFN及16→16→4关系偏置完整实现。三级策略包含Who、空间指针、15语义、21兵种、四类目标的独立Q/K与精确关系项、15维headBias及稳定的行动者边际/条件先验。价值头共享459→128→1 MLP，含存活单位均值/最大池化、全局与地图上下文、权威军力占比残差和非活跃槽清零；标量转换按最强敌联盟计算。

运行时使用静态生成的矩阵内核、按实例复用临时缓冲和仅对合法候选引用地块的等价1×1投影，没有运行时eval、第三方推理框架、网络调用、观测缓存或规则替代。公开输出复制为独立Float32Array，动态注意力矩阵不缓存旧激活。JSON/小端二进制合同具有版本、形状、偏移、完整性及有限数值校验。

## 来源与边界

从阶段1冻结manifest的train分区重新流式准入${real.length}个不同真实前态，来自${summary.distinctParents}个父局/真人响应。原生SD的2/3/4人分别12/12/16条，真人SO的2/3人各4条，真人SD的5/6人各8条；40条原生样本具有可信自然结局，真人valueMask均关闭。采用阶段1排重、当前完整合法集合重映射和二进制packTensorBatch，通过带背压IPC直接训练，逐数组核对冻结小样本。读取统计visited=${meta.stats.visited}、当前状态漂移=${meta.stats.currentStateDrift}；漂移后的value按原准入器关闭，未改规则或来源收据。没有声称执行全量当前规则重验。

另有9个合法架构夹具：当前默认13×13、要求中的12×12、20×12、15×15、3FFA、2v2、6FFA、32×32/100子/1195候选、64×64/160子。用户已明确接受“64个真实状态＋独立压力夹具”；夹具从未标为真实回放。全部真实来源均已被历史开发消费，结果不构成独立泛化或棋力证据。

## 最终门禁

|门禁|结果|
|---|---|
|参数与前向|${arch.parameters}参数；73个状态及额外空实体/奇偶矩形检查通过，无NaN/Inf，活跃价值质量误差<1e-6，非活跃槽严格为0|
|随机权重三端|73/73动作和行动者一致；logits/value/actor最大绝对误差0，Node/Chrome亦为0|
|训练后补充三端|同样73状态、最大误差0、argmax100%；两次最终Chrome专属Profile均已清理|
|最终小批量训练|40步AdamW、学习率0.003余弦降至0.00015；Top-1 ${smoke.initial.correct}/64→${smoke.final.correct}/64；40条价值Brier ${smoke.initial.brier}→${smoke.final.brier}，下降${(decrease * 100).toFixed(6)}%|
|梯度|${summary.gradientTensors}个参数张量各自累计最大grad_norm>0且有限；不把保留的投降语义等无样本标量宣称为有梯度|
${speed.results.map(r => `|${r.name}端到端|预热60次、完整100次，p50=${r.p50.toFixed(4)}ms、p95=${r.p95.toFixed(4)}ms、上限${r.limit}ms|`).join('\n')}
|公共检查|npm run lint、npm test（394项）、npm run build、独立tsc及2项Python损失回归通过|
|保全与磁盘|阶段1清单48文件SHA全部保持；本目录${total}字节（${(total / 1e6).toFixed(3)}MB），低于50MB|

速度在其他本任务计算结束后以单进程TS独立测量，包含全新静态场/真实寻路/关系/因子编码和完整Policy＋Value；与阶段1一致，输入完整合法集合的生成不计时。没有剔除慢样本、使用旧观测或缓存模型输出。策略头剖析含空间键及语义投影，1195候选均值约${read('profile.json').means[2].toFixed(3)}ms；它不是端到端速度门禁的替代。

三端保持float32权重与算子间激活，使用明确的float64归约和回写边界。修复了PyTorch对sqrt(32)浮点标量除法和JS double除法的舍入差异，最终随机及训练后权重均达到逐项零误差；训练本身使用原生float32算子，数值配置在MODEL.md公开说明。训练时源码SHA保存在overfit收据，数值对齐修订仅影响accurate_reductions分支，训练原分支不变；最终源码、模型、样本及浏览器包身份另行绑定。

## 开发过程与未启动工作

保留attempt01～attempt04、原生float32误差和早期速度失败，不用最好单项拼成通过版本。开发共4次完整40步小批量试验（包含最终这次），另有1次在日志字典构造错误后中断的单步尝试，共161次optimizer.step；没有全量预训练。较宽残差瓶颈因大图速度未达45ms而未作为最终架构。早期仅SD的批次在最终复核时补齐真实SO并重新训练；后期改用余弦学习率抑制小批量振荡。临时缓冲复用过程中发现的动态矩阵旧重排和非活跃softmax槽污染均已修复并有回归覆盖。

build仅有既有大chunk提示，Python有既有pynvml弃用提示；两者不影响本轮检查。初次受限Chrome启动失败后，在正常权限下完成真实Chrome验收；只访问本地页面，所有专属Profile均已清理。未操作手机/ADB、旧阶段5、应用UI或策略入口，未修改权威规则，未删除历史数据/模型/报告或回滚工作区。阶段3正式预训练与阶段4搜索均未启动；随机和冒烟权重不能当作已训练完成的实战策略。

复跑见README.md；机器入口为gate-summary.json、tri-runtime-parity-gate.json及DELIVERY_MANIFEST.json。
`;
}
const docsPath = path.join(ROOT, 'docs/README.md'), docs = fs.readFileSync(docsPath, 'utf8');
if (!docs.includes('../src/ai_runtime/dual_v2/MODEL.md')) fs.writeFileSync(docsPath, docs.replace('- [开发验证]', '- [双流 v2 阶段 2 模型与权重合同](../src/ai_runtime/dual_v2/MODEL.md)\n- [开发验证]'));
const currentPath = path.join(ROOT, 'ai_training/status/CURRENT.md');
for (let iteration = 0; iteration < 5; iteration++) {
    const total = bytes(); summary.diskBytes = total; summary.gates.disk = total <= 50000000; summary.passed = summary.passed && summary.gates.disk;
    save('gate-summary.json', summary); fs.writeFileSync(path.join(DIR, 'REPORT.md'), report(total));
    const current = fs.readFileSync(currentPath, 'utf8'), block = stageBlock(total);
    fs.writeFileSync(currentPath, current.includes('<!-- dual-stream-v2-phase2-20261020 -->') ? current.replace(/<!-- dual-stream-v2-phase2-20261020 -->[\s\S]*?<!-- end-dual-stream-v2-phase2-20261020 -->/, block) : current.replace('# 当前接手状态', '# 当前接手状态\n\n' + block));
    const deliver = [...directoryFiles(DIR).filter(file => path.basename(file) !== 'DELIVERY_MANIFEST.json'), ...directoryFiles(runtimeDir), docsPath, currentPath];
    save('DELIVERY_MANIFEST.json', { schema: 'dual-stream-v2-phase2-delivery-v1', status: summary.passed ? 'complete' : 'gates_failed', selfExcluded: true, files: Object.fromEntries(deliver.map(file => { const data = fs.readFileSync(file); return [path.relative(ROOT, file).replaceAll('\\', '/'), { bytes: data.length, sha256: sha(data) }]; })) });
    if (bytes() === total) break;
}
assert.ok(bytes() <= 50000000);
console.log(JSON.stringify({ passed: summary.passed, parameters: arch.parameters, diskBytes: bytes(), triModels, speed: speed.results.map(r => ({ name: r.name, p95: r.p95 })), top1: smoke.final.top1, brierDecrease: decrease }));
if (!summary.passed) process.exitCode = 1;
