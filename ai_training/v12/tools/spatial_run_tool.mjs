/**
 * Sandbox-safe clone of v11/tools/run-tool.mjs.
 *
 * v11's runner crashes in this sandbox with `Error: spawn EPERM` because Vite's
 * `optimizeSafeRealPathSync()` calls `child_process.exec('net use')`, and the
 * sandbox denies process creation. `getRealPath()` only calls `safeRealpathSync`
 * when `preserveSymlinks` is false, so setting `resolve.preserveSymlinks: true`
 * skips that code path entirely. `node_modules` in this repo is a real directory
 * (npm + package-lock.json, not pnpm symlinks), so preserving symlinks does not
 * change which files are loaded.
 *
 * v11/tools/run-tool.mjs is intentionally left unmodified.
 *
 * Usage: node v12/tools/spatial_run_tool.mjs <path/to/tool.ts> [args...]
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const [, , toolArg, ...forwarded] = process.argv;
if (!toolArg) {
    console.error('usage: node v12/tools/spatial_run_tool.mjs <tool.ts> [args...]');
    process.exit(2);
}

const repoRoot = process.cwd();
const toolPath = path.resolve(repoRoot, toolArg);
const TS_FILE = /\.(ts|tsx|mts|cts)$/;

function v11TsTransform() {
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
    plugins: [v11TsTransform()],
    // The sandbox fix: never call safeRealpathSync() (which spawns `net use`).
    resolve: { preserveSymlinks: true },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null },
});

try {
    await server.ssrLoadModule(pathToFileURL(toolPath).href);
} finally {
    await server.close();
}
