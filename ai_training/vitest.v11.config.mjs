/**
 * V11 test configuration.
 *
 * Two environment adaptations, both test-only:
 *
 * 1. `esbuild: false`. The confined execution environment denies process and
 *    pipe creation (EPERM), and vite's `vite:esbuild` transform plugin needs a
 *    long-lived esbuild child process. `v11TsTransform()` performs the
 *    TypeScript/TSX transpile with the `typescript` compiler that is already a
 *    devDependency, entirely in-process.
 *
 * 2. A single-thread pool, because the default forked worker pool also needs
 *    process creation.
 *
 * Neither change affects the application build (vite.config.ts is untouched).
 *
 * Run with:  pwsh -File v11/tools/run-tests.ps1
 */
import { createRequire } from 'node:module';
import { defineConfig } from 'vitest/config';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const TS_FILE = /\.(ts|tsx|mts|cts)$/;

/** In-process TypeScript transform used in place of `vite:esbuild`. */
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

export default defineConfig({
    esbuild: false,
    plugins: [v11TsTransform()],
    optimizeDeps: { noDiscovery: true, include: [] },
    test: {
        pool: 'threads',
        maxWorkers: 1,
        minWorkers: 1,
        include: ['tools/**/*.test.ts', 'src/**/*.test.ts'],
        exclude: [
            '**/node_modules/**',
            '**/dist/**',
            '**/_work/**',
            '**/training_runs/**',
            '**/build/**',
            '**/coverage/**',
        ],
        testTimeout: 300000,
        hookTimeout: 300000,
    },
});