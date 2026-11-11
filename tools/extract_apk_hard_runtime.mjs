/** 从已提取的 APK 脚本生成隔离模块；生成结果不得手工编辑。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { injectHardCompute } from './apk_hard_compute_transform.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.resolve(root, process.argv.find(arg => arg.startsWith('--source='))?.slice(9)
    ?? 'deliverables/original_apk_hard_20261021/static/hard-ai-runtime.html');
const targetPath = path.join(root, 'src/game/ai/runtime/apk_hard_policy.generated.js');
const html = fs.readFileSync(sourcePath);
const scripts = [...html.toString('utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
if (scripts.length !== 1) throw new Error(`预期 APK 资源中只有一个脚本，实际 ${scripts.length} 个`);
const script = scripts[0][1];
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const ast = ts.createSourceFile('apk-hard-runtime.js', script, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
if (ast.parseDiagnostics.length) throw new Error('APK 脚本无法解析');
if (!script.includes('scope.hardAiDecide = function (snapshotJson)')) throw new Error('APK 决策入口缺失');

// 保留上游函数的默认CPU路径与初始化顺序；生成阶段注入可选数值后端，不修改原HTML。
const body = injectHardCompute(ts.transpileModule(script, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, removeComments: true, newLine: ts.NewLineKind.LineFeed },
}).outputText);
const generated = `/**\n * APK 困难 AI 上游生成资产，禁止手工编辑。\n * 来源：aer-4.2.5.1-patch.apk.1 / assets/hard-ai/runtime.html。\n * 使用 tools/extract_apk_hard_runtime.mjs 重新生成；不调用页面初始化。\n */\n`
    + `export const APK_HARD_RUNTIME_HTML_SHA256 = '${sha256(html)}';\n`
    + `export const APK_HARD_RUNTIME_SCRIPT_SHA256 = '${sha256(script)}';\n`
    + `export function instantiateApkHardPolicy(environment) {\n`
    + `const { document, window, Math, console, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame, alert, confirm, prompt, fetch, XMLHttpRequest, WebSocket, FileReader, Blob, URL, localStorage, sessionStorage, navigator } = environment;\n`
    + body
    + `\nreturn window.hardAiDecide;\n}\n`;
if (process.argv.includes('--check')) {
    if (!fs.existsSync(targetPath) || fs.readFileSync(targetPath, 'utf8') !== generated) {
        throw new Error('APK 困难 AI 生成模块与资源不一致');
    }
} else {
    fs.writeFileSync(targetPath, generated, 'utf8');
}
console.log(JSON.stringify({ sourcePath, targetPath, htmlSha256: sha256(html), scriptSha256: sha256(script), generatedSha256: sha256(generated), generatedBytes: Buffer.byteLength(generated), check: process.argv.includes('--check') }, null, 2));
