/**
 * V12 in-process TypeScript tool runner (same contract as v11/tools/run-tool.mjs).
 *
 * Why this file exists instead of reusing v11/tools/run-tool.mjs:
 *
 * Vite's Windows path handling calls `optimizeSafeRealPathSync()`, which runs
 * `child_process.exec("net use")` to discover mapped network drives. This
 * environment denies process creation, so that `exec` throws `spawn EPERM`
 * asynchronously and kills the process before any tool code is loaded. The
 * failure is inside Vite, not in the tool.
 *
 * The V11 runner cannot be edited (it is part of the frozen v11 contract), so
 * this runner performs the one shim required: `child_process.exec` is replaced
 * with a stub that reports an error without spawning anything. Vite's callback
 * already handles `error` by returning early and leaving `safeRealPathSync` at
 * its default non-network implementation, so the shim is behaviour-preserving
 * for a machine with no mapped network drives.
 *
 * Usage:
 *   node v12/tools/run-tool.mjs <path/to/tool.ts> [args...]
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

// ---- process-creation shim (must run before vite is imported) -------------
const cp = require('node:child_process');
const denied = () => Object.assign(new Error('spawn EPERM (denied by sandbox)'), { code: 'EPERM', errno: -4048 });
for (const name of ['exec', 'execFile']) {
    cp[name] = function deniedSpawn(...args) {
        const cb = args.find(a => typeof a === 'function');
        if (typeof cb === 'function') process.nextTick(() => cb(denied(), '', ''));
        return { on() { return this; }, kill() {}, pid: undefined };
    };
}

const ts = require('typescript');

const [, , toolArg, ...forwarded] = process.argv;
if (!toolArg) {
    console.error('usage: node v12/tools/run-tool.mjs <tool.ts> [args...]');
    process.exit(2);
}

const repoRoot = process.cwd();
const toolPath = path.resolve(repoRoot, toolArg);
const TS_FILE = /\.(ts|tsx|mts|cts)$/;

function v12TsTransform() {
    return {
        name: 'v12:typescript-transform',
        enforce: 'pre',
        transform(code, id) {
            const [file] = id.split('?');
            if (!TS_FILE.test(file)) return null;
            const result = ts.transpileModule(code, {
                fileName: file,
                compilerOptions: {
                    module: ts.ModuleKind.ESNext,
                    target: ts.ScriptTarget.ES2022,
                    jsx: ts.JsxEmit.ReactJSX,
                    moduleResolution: ts.ModuleResolutionKind.Bundler,
                    esModuleInterop: true,
                    allowSyntheticDefaultImports: true,
                    isolatedModules: true,
                },
                reportDiagnostics: false,
            });
            return { code: result.outputText, map: null };
        },
    };
}

process.argv = [process.argv[0], toolPath, ...forwarded];

const { createServer } = await import('vite');

const server = await createServer({
    root: repoRoot,
    configFile: false,
    appType: 'custom',
    logLevel: 'warn',
    esbuild: false,
    plugins: [v12TsTransform()],
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null },
});

try {
    await server.ssrLoadModule(pathToFileURL(toolPath).href);
} finally {
    await server.close();
}
