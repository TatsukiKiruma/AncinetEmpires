/**
 * V11 test-runner escape shim (CommonJS preload).
 *
 * Vite's Windows "safe realpath" workaround runs `net use` through
 * `child_process.exec` while loading the config. In this confined environment
 * every process spawn is denied (EPERM), and the `net use` callback treats a
 * denied spawn as fatal, so the vitest config never loads.
 *
 * This shim keeps process spawning unavailable and makes that specific probe
 * fail in the way Vite already handles (an errored callback). Nothing else is
 * swallowed: every other spawn still fails loudly, so no training, evaluation
 * or Python job can silently no-op through this shim.
 */
'use strict';

const childProcess = require('node:child_process');
const PROBE = /\bnet\s+use\b/i;

function describe(args) {
    if (typeof args === 'string') return args;
    if (Array.isArray(args)) return args.join(' ');
    return String(args);
}

function spawnUnavailable(command) {
    const err = new Error('spawn unavailable in this environment (denied by sandbox): ' + command);
    err.code = 'EPERM';
    err.errno = -4048;
    err.syscall = 'spawn';
    return err;
}

const originals = {
    exec: childProcess.exec,
    execSync: childProcess.execSync,
};

childProcess.exec = function wrappedExec(command, ...rest) {
    if (PROBE.test(describe(command))) {
        const callback = rest.find(a => typeof a === 'function');
        if (callback) {
            process.nextTick(() => callback(spawnUnavailable(describe(command)), '', ''));
            return { on() { return this; }, kill() {}, pid: -1 };
        }
    }
    return originals.exec.apply(this, [command, ...rest]);
};

childProcess.execSync = function wrappedExecSync(command, ...rest) {
    if (PROBE.test(describe(command))) return Buffer.from('');
    return originals.execSync.apply(this, [command, ...rest]);
};

module.exports = { originals, PROBE };