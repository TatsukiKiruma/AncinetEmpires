/**
 * V11 test-runner preload (ES module) - currently a no-op companion to
 * core-spawn-shim.cjs.
 *
 * History: an earlier revision forced esbuild into in-process transpile mode
 * via ESBUILD_BINARY_PATH. That turned out to be unnecessary once
 * vitest.v11.config.mjs disabled `vite:esbuild` and supplied its own
 * TypeScript transform, and the env var could confuse a real esbuild build.
 * The file is kept so the documented test command has a stable target; it
 * deliberately does nothing.
 */
export const V11_ESBUILD_INPROCESS = false;