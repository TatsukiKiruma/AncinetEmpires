"""从已审阅的阶段6评测器生成本次独立入口，保留旧文件。"""
from pathlib import Path

TASK = Path(__file__).resolve().parent
ROOT = TASK.parents[1]
source = (ROOT / 'ai_training/dual_stream_v2_phase6_20261022/arena.ts').read_text(encoding='utf8')
start = source.index('const TRAINING =')
end = source.index('\nfunction rng(', start)
source = source[:start] + '''const TASK = path.join(ROOT, 'ai_training/pretrain_preflight_20261022');
const PLAN_PATH = path.join(TASK, 'EVALUATION_SPLITS.json');
const readJson = (filename: string) => JSON.parse(fs.readFileSync(filename, 'utf8'));
const ORIGINAL_PLAN = readJson(PLAN_PATH);
const CANDIDATE = process.env.EVAL_CANDIDATE!;
const CONFIG = ORIGINAL_PLAN.candidates.find((candidate: any) => candidate.id === CANDIDATE);
assert.ok(CONFIG, '候选未预登记');
const GENERATION = CANDIDATE;
const POLICY_MODE: string = ORIGINAL_PLAN.mode;
assert.equal(POLICY_MODE, 'search');
const PANEL = process.env.EVAL_PANEL ?? 'standard';
assert.ok(['standard', 'extension'].includes(PANEL));
const PANEL_CONFIG = ORIGINAL_PLAN[PANEL];
const OUTPUT = path.resolve(ROOT, process.env.EVAL_OUTPUT ?? `ai_training/pretrain_preflight_20261022/evaluation/${PANEL}/${CANDIDATE}`);
const hashBytes = (bytes: string | Uint8Array) => crypto.createHash('sha256').update(bytes).digest('hex');
const hashState = (state: GameState) => hashBytes(JSON.stringify(state));
const MAPS: string[] = PANEL_CONFIG.maps;
const MAX_STEPS = ORIGINAL_PLAN.maxSteps;
const MAX_ROUNDS = ORIGINAL_PLAN.maxRounds;
const MAX_WALL_MS = ORIGINAL_PLAN.maxWallMs;
const SEARCH_OPTIONS = ORIGINAL_PLAN.searchOptions;
''' + source[end:]
start = source.index('async function loadArtifacts()')
end = source.index('\nfunction army(', start)
source = source[:start] + '''async function loadArtifacts() {
    const generationDir = path.join(ROOT, CONFIG.frozen);
    const assets = CONFIG.assets.map((asset: any) => {
        const bytes = fs.readFileSync(path.join(generationDir, asset.name));
        assert.equal(hashBytes(bytes), asset.sha256, '冻结模型或校准被修改');
        assert.equal(hashBytes(fs.readFileSync(path.join(ROOT, asset.path))), asset.sha256, '原始模型或校准身份变化');
        return asset;
    });
    const makeModel = (prefix: string) => {
        const bytes = fs.readFileSync(path.join(generationDir, prefix + '.bin'));
        return new DualStreamModel(readJson(path.join(generationDir, prefix + '.json')), bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    };
    return { model: makeModel('model'),
        parentValueModel: CONFIG.parentMixture > 0 ? makeModel('parent-model') : undefined,
        headBias: readJson(path.join(generationDir, 'head-calibration.json')).headBias,
        valueCalibration: readJson(path.join(generationDir, 'value-config.json')),
        assets, expected: CONFIG.modelSha256, classes: { DualStreamModel, DualStreamPureAI, DualStreamTurnSearchAI }, archivedRuntime: [] };
}
''' + source[end:]
source = source.replace("const bundle = path.join(OUTPUT, 'runtime-v4.mjs');", "const bundle = path.join(OUTPUT, 'unused.mjs');")
source = source.replace("const before =", "const before =")
source = source.replace('const artifacts = await loadArtifacts(), before = sourceManifest(true);', '''const artifacts = await loadArtifacts(), before = sourceManifest(true);
    const authority = before.files.filter(file => file.path.startsWith('src/'));
    const authoritySha = hashBytes(JSON.stringify(authority));
    const authorityPath = path.join(TASK, 'evaluation/frozen-runtime-identity.json');
    if (fs.existsSync(authorityPath)) assert.equal(authoritySha, readJson(authorityPath).sha256, '公共运行时改变，拒绝混合评测');
    else fs.writeFileSync(authorityPath, JSON.stringify({ sha256: authoritySha, files: authority }, null, 2));''')
source = source.replace('name: `第${GENERATION}代权重＋v6-hard-slayer运行时`,', 'name: `${CANDIDATE}完整策略组合＋current-v6r3运行时`, panel: PANEL, canonicalRuntimeSha256: authoritySha,')
source = source.replace('if (process.env.PHASE6_GOLD_DELTA) for (const p of initial.players) p.gold += Number(process.env.PHASE6_GOLD_DELTA);', 'for (const p of initial.players) p.gold += PANEL_CONFIG.goldDelta;')
source = source.replace('const seed = 20261021 + mapIndex * 100 + seat * 1009;', 'const seed = PANEL_CONFIG.seedBase + mapIndex * 100 + seat * 1009;')
source = source.replace('valueCalibration: artifacts.valueCalibration, onWitness:', 'valueCalibration: artifacts.valueCalibration, parentValueModel: artifacts.parentValueModel, onWitness:')
source = source.replace("    return { count: samples.length, mean:", "    const q = (p: number) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? 0;\n    return { count: samples.length, p50: q(.5), p90: q(.9), p99: q(.99), mean:")
source = source.replace("const summary = { identity, completedAt:", "const summary = { identity, planSha256: hashBytes(fs.readFileSync(PLAN_PATH)), completedAt:")
source = source.replace('五图各换边一次，共十局；SD 默认开局；', '${MAPS.length}图各换边一次，共${results.length}局；SD开局双方各加${PANEL_CONFIG.goldDelta}金币；')
target = TASK / 'arena.ts'
assert not target.exists(), '独立入口已存在，禁止覆盖'
target.write_text(source, encoding='utf8')
print(target)
