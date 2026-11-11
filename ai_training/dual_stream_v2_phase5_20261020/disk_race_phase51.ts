import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { directoryBytes } from './durable_log';
import { ROOT, save } from './common';

// 夹具放在阶段5扫描范围之外，避免干扰仍在运行的旧扫描器。
const parent = path.resolve(ROOT, '.runtime');
fs.mkdirSync(parent, { recursive: true });
const fixture = fs.mkdtempSync(path.join(parent, 'phase51-disk-race-'));
const child = path.join(fixture, 'disappearing');
fs.mkdirSync(child); fs.writeFileSync(path.join(child, 'temporary'), 'xx');
fs.writeFileSync(path.join(fixture, 'stable'), '1234');
const original = fs.readdirSync;
let removed = false;
try {
    (fs as any).readdirSync = (target: string, options: any) => {
        if (path.resolve(String(target)) === child && !removed) {
            removed = true;
            assert.equal(path.dirname(child), path.resolve(fixture));
            fs.rmSync(child, { recursive: true });
        }
        return original(target, options);
    };
    assert.equal(directoryBytes(fixture), 4);
    (fs as any).readdirSync = () => { throw Object.assign(Error('独立权限错误夹具'), { code: 'EACCES' }); };
    assert.throws(() => directoryBytes(fixture), /独立权限错误夹具/);
    save('phase51-audit/disk-race-regression.json', { passed: true, disappearedChildIgnored: true, stableBytesCounted: 4, permissionErrorsPropagate: true });
} finally {
    (fs as any).readdirSync = original;
    assert.equal(path.dirname(path.resolve(fixture)), parent);
    assert.ok(path.basename(fixture).startsWith('phase51-disk-race-'));
    fs.rmSync(fixture, { recursive: true });
}
