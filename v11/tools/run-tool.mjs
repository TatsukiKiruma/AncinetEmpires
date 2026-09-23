/**
 * V11 in-process TypeScript loader for command-line tools.
 *
 * The project convention is `node --import tsx tools/<tool>.ts`, but tsx
 * transpiles through an esbuild child process and this environment denies
 * process creation. This runner loads a tool the same way the V11 test
 * configuration does: a Vite SSR module runner with `esbuild: false` and an
 * in-process TypeScript transform using the installed `typescript` package.
 *
 * Usage:
 *   node v11/tools/run-tool.mjs tools/v11/run.ts replay
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const [, , toolArg, ...forwarded] = process.argv;
if (!toolArg) {
    console.error('usage: node v11/tools/run-tool.mjs <tool.ts> [args...]');
    process.exit(2);
}

const repoRoot = process.cwd();
const toolPath = path.resolve(repoRoot, toolArg);
const TS_FILE = /\.(ts|tsx|mts|cts)$/;

function v11TsTransform() {
    return {
        name: 'v11:typescript-transform',
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
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null },
});

try {
    await server.ssrLoadModule(pathToFileURL(toolPath).href);
} finally {
    await server.close();
}