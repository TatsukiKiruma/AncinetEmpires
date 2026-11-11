import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const workerScript = path.resolve(__dirname, '../research/policy_worker.ts');
const workerScriptUrl = pathToFileURL(workerScript).href;

const worker = new Worker(`
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register('tsx', pathToFileURL('./'));
import '${workerScriptUrl}';
`, {
    eval: true,
    workerData: {
        policyType: 'first_legal',
        stateJson: JSON.stringify({}),
        playerId: 0,
        maxWallMs: 1000
    }
});

worker.on('message', m => console.log('WORKER MSG:', m));
worker.on('error', e => console.log('WORKER ERR:', e));
