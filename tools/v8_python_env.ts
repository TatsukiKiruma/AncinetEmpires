/**
 * Python interpreter resolution for the AncientEmpires tooling.
 *
 * Several tools shell out to `python python/train_spatial_resnet.py` (and the parity verifier).
 * `python` on PATH is not guaranteed to be the interpreter that has torch installed - on a machine
 * with a bare conda base install it frequently is not - so tools resolve an interpreter that can
 * actually `import torch` and record it as provenance.
 *
 * Resolution order:
 *   1. the explicit argument
 *   2. the V8_PYTHON environment variable
 *   3. `python`, `python3`, then the Windows launcher forms `py -3.12` / `py -3.11` / `py -3.10`
 *
 * This module has no side effects and does not change any training behaviour: when `python` already
 * has torch, the resolved command is exactly `python`.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface TorchPython {
    /** Shell-safe command prefix, e.g. `python` or `py -3.12` or a quoted absolute path. */
    pythonCommand: string;
    torchVersion: string;
}

const DEFAULT_CANDIDATES = ['python', 'python3', 'py -3.12', 'py -3.11', 'py -3.10'];

export function resolveTorchPython(explicit?: string): TorchPython {
    const candidates: string[] = [];
    if (explicit) candidates.push(explicit);
    if (process.env.V8_PYTHON) candidates.push(process.env.V8_PYTHON);
    candidates.push(...DEFAULT_CANDIDATES);

    const tried: string[] = [];
    for (const candidate of candidates) {
        // Quote only path-like candidates that contain spaces. A launcher form such as `py -3.12`
        // is a command plus an argument and must stay unquoted.
        const isPathLike = /[\\/]/.test(candidate);
        const quoted = isPathLike && candidate.includes(' ') ? `"${candidate}"` : candidate;

        try {
            execSync(`${quoted} -c "import torch"`, { stdio: 'ignore' });
        } catch {
            tried.push(candidate);
            continue;
        }

        let torchVersion = 'unknown';
        try {
            const versionFile = path.join(os.tmpdir(), `v8_torch_version_${process.pid}.txt`);
            execSync(`${quoted} -c "import torch;open(r'${versionFile}','w').write(torch.__version__)"`, {
                stdio: 'ignore'
            });
            if (existsSync(versionFile)) {
                torchVersion = readFileSync(versionFile, 'utf8').trim();
                rmSync(versionFile, { force: true });
            }
        } catch {
            /* version string is optional provenance */
        }
        return { pythonCommand: quoted, torchVersion };
    }

    throw new Error(
        `No Python interpreter with torch available. Tried: ${tried.join(', ')}. ` +
        `Set V8_PYTHON to an interpreter that has torch installed.`
    );
}
