/** 仅加载原始脚本并检查宿主依赖，不调用任何对局决策。 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { digest } from './contract.mjs';

const out = path.dirname(fileURLToPath(import.meta.url));
const read = name => fs.readFileSync(path.join(out, name), 'utf8');
const save = (name, value) => fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const fixedPath = 'source/ai_training/hard_native_1000_20261022/production-independent-05/hard-ai-runtime.fixed.html';
const original = read(fixedPath);
function element() {
    return { value: '', checked: false, disabled: false, textContent: '', innerHTML: '', style: {}, dataset: {},
        classList: { add() {}, remove() {}, contains() { return false; }, toggle() { return false; } },
        querySelectorAll() { return []; }, querySelector() { return null; }, addEventListener() {}, removeEventListener() {},
        appendChild(child) { return child; }, removeChild(child) { return child; }, setAttribute() {}, click() {},
    };
}
const results = [];
for (const cap of [20, 30, 50]) {
    if ([...original.matchAll(/const\s+TEAM_POPULATION_LIMIT\s*=\s*30\s*;/g)].length !== 1
        || [...original.matchAll(/window\.__AEII_NATIVE_POP_LIMIT__\s*=\s*30\s*;/g)].length !== 1) throw Error('人口补丁锚点不唯一');
    const html = original.replace(/const\s+TEAM_POPULATION_LIMIT\s*=\s*30\s*;/, `const TEAM_POPULATION_LIMIT = ${cap};`)
        .replace(/window\.__AEII_NATIVE_POP_LIMIT__\s*=\s*30\s*;/, `window.__AEII_NATIVE_POP_LIMIT__=${cap};`);
    // 反向还原必须逐字节相同，防止夹带其他策略改动。
    const restored = html.replace(`const TEAM_POPULATION_LIMIT = ${cap};`, 'const TEAM_POPULATION_LIMIT = 30;')
        .replace(`window.__AEII_NATIVE_POP_LIMIT__=${cap};`, 'window.__AEII_NATIVE_POP_LIMIT__=30;');
    if (restored !== original) throw Error('人口之外的HTML字节变化');
    const artifact = `evidence/hard-ai-cap${cap}.html`;
    fs.writeFileSync(path.join(out, artifact), html, { flag: 'wx' });
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
    const nodes = new Map();
    const document = {
        getElementById(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); },
        createElement() { return element(); }, querySelectorAll() { return []; }, querySelector() { return null; },
        addEventListener() {}, removeEventListener() {}, body: element(),
    };
    const unavailable = () => { throw Error('本检查禁止异步、网络与页面初始化'); };
    const window = {};
    const context = vm.createContext({ document, window, console: { log() {}, warn() {}, error() {} },
        setTimeout: unavailable, clearTimeout: unavailable, setInterval: unavailable, clearInterval: unavailable,
        requestAnimationFrame: unavailable, cancelAnimationFrame: unavailable,
        alert: unavailable, confirm: unavailable, prompt: unavailable, fetch: unavailable,
        XMLHttpRequest: unavailable, WebSocket: unavailable, FileReader: unavailable, Blob: unavailable,
    });
    const result = { cap, artifact, sha256: digest(html), scripts: scripts.length,
        mainScriptSha256: digest(scripts[0]), onlyPopulationPatch: true, decisionsCalled: 0, gamesStarted: 0 };
    try {
        for (const [index, script] of scripts.entries()) vm.runInContext(script, context, { filename: `original-hard-cap${cap}-${index}.js`, timeout: 10000 });
        result.exportsHardAiDecide = typeof window.hardAiDecide === 'function';
        result.readonlyCap = window.__AEII_NATIVE_POP_LIMIT__;
        result.passed = result.exportsHardAiDecide && result.readonlyCap === cap;
    } catch (error) { result.passed = false; result.error = String(error.stack ?? error); }
    results.push(result);
}
const patterns = {
    webgpu: /\b(?:GPUDevice|GPUBuffer|GPUShaderModule|requestAdapter|requestDevice)\b|navigator\s*\.\s*gpu/,
    webgl: /\b(?:WebGLRenderingContext|WebGL2RenderingContext)\b|['"]webgl2?['"]/,
    gpuFramework: /\b(?:tensorflow|onnxruntime|torch|GPUKernel|GPU\.js)\b/i,
};
const scriptText = [...original.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]).join('\n');
const dependencyChecks = [
    ['worker', 'source/ai_training/hard_curriculum3000_execution_20261027/collector-v5/worker.rhino.js', /new Packages\.c\.a\.b\.c\.j\.b\(game\.engine\)/, /var action = ai\.call\(\)/],
    ['nativeEngine', 'source/ai_training/hard_curriculum3000_execution_20261027/collector-v5/native_engine.rhino.js', /Packages\.c\.a\.b\.a\.a/, /com\.badlogic\.gdx\.Gdx/],
    ['androidBridge', 'source/deliverables/original_apk_hard_20261021/static/patch-ResourcePackHardAi$1.dad.java', /android\.webkit\.WebView/, /android\.app\.Activity/],
    ['javascriptBridge', 'source/deliverables/original_apk_hard_20261021/static/patch-ResourcePackHardAi$2.dad.java', /evaluateJavascript/],
].map(([name, source, ...checks]) => ({ name, source, sha256: digest(read(source)), expectedDependenciesPresent: checks.every(check => check.test(read(source))) }));
save('evidence/HOST_PROBE.json', {
    utc: new Date().toISOString(), pid: process.pid, parentPid: process.ppid, executable: process.execPath, argv: process.argv,
    node: process.version, originalFixedHtmlSha256: digest(original), populationVariants: results,
    apiTokenScan: Object.fromEntries(Object.entries(patterns).map(([name, pattern]) => [name, pattern.test(scriptText)])),
    mathRandomCallSites: [...scriptText.matchAll(/Math\.random\s*\(/g)].length,
    dependencyChecks, decisionsCalled: 0, gamesStarted: 0, replay: 'disabled_by_user',
    conclusions: {
        exactJavascriptCanInitializeOnDesktopCpu: results.every(result => result.passed),
        nativeBCallTested: false, nativeRulesInitialized: false, originalWebViewRngPreserved: false,
        whyRngNotEquivalent: '加载检查使用Node VM原始Math.random；没有决策，不等同Android WebView随机实现',
        nativeGpuEntryFound: false,
        qualification: '标识符扫描及依赖证据；不声称数学上无法重写为GPU，也不声称本检查证明原生宿主等价',
    },
});
console.log(JSON.stringify({ populationVariants: results, dependencies: dependencyChecks, decisionsCalled: 0 }));
if (!results.every(result => result.passed)) process.exitCode = 1;
