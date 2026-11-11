import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { collect } from './collect';
import { exportDataset } from './dataset';
import { exportParity } from './parity';
import { evaluate, evaluationJobs, gate, screenComparison } from './evaluate';
import { schedule } from './scenarios';
import { data, here, root, K1, guard, read, save, fileSha, sha, DrainStop } from './io';

async function command(args: string[], log: string, env = process.env) {
    const fd = fs.openSync(log, 'a');
    try {
        const p = spawn(process.execPath, args, {cwd: root, env, windowsHide: true, stdio: ['ignore', fd, fd]});
        await new Promise<void>((resolve, reject) => {p.once('error', reject); p.once('exit', code => code === 0 ? resolve() : reject(Error(`子进程失败：${args.join(' ')}/${code}`)));});
    } finally {fs.closeSync(fd);}
}
function sourceLock() {
    const dirs = [path.join(root, 'src'), here, path.join(here, '../stage7')];
    const files = dirs.flatMap(dir => fs.readdirSync(dir, {recursive: true, withFileTypes: true})
        .filter(f => f.isFile() && /\.(?:ts|tsx|py|mjs)$/.test(f.name)).map(f => path.join(f.parentPath, f.name))).sort();
    return Object.fromEntries(files.map(file => [path.relative(root, file), fileSha(file)]));
}
function status(phase: string, extra: object = {}) {
    save(path.join(here, 'RUN_STATUS.json'), {phase, at: new Date().toISOString(), pid: process.pid, data, sealedAccess: 0, ...extra});
}
function report(text: string) {
    fs.writeFileSync(path.join(here, 'STAGE8_REPORT.md'), '# Stage 8 运行报告\n\n' + text + '\n\n数据目录：`' + data + '`。\n\nSealed 访问次数：0。应用默认模型保持 K1，只有晋升门禁通过才允许后续部署。\n');
}

guard(); assert(read(path.join(here, 'PHASE_A.json')).passed && read(path.join(here, 'GPU_SMOKE.json')).passed);
fs.mkdirSync(data, {recursive: true});
const lockFile = path.join(here, 'SOURCE_LOCK.json');
if (!fs.existsSync(lockFile)) save(lockFile, sourceLock());
const checkLock = () => assert.deepEqual(sourceLock(), read(lockFile), 'Stage 8 运行源码发生变化');
checkLock();
const pidFile = path.join(data, 'controller.lock');
const lock = fs.openSync(pidFile, 'wx'); fs.writeSync(lock, String(process.pid)); fs.closeSync(lock);
try {
    const arena = path.join(root, 'deliverables/stage7-k1-multiplayer-arena-20261110');
    const arenaOut = path.join(arena, 'v5-closed-loop-fix');
    const ids = read(path.join(arena, 'summary.json')).results.map((r: any) => r.id);
    status('waiting_arena', {expected: ids.length});
    while (!fs.existsSync(path.join(arenaOut, 'READY.json'))) {
        guard();
        assert(!fs.existsSync(path.join(arenaOut, 'FAILED.json')), '12局独立任务失败，保留现场');
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    assert(read(path.join(arenaOut, 'summary.json')).replayVerified === 12);
    save(path.join(data, 'parity-roots-closed-loop-v2.json'), [0,1,2,3].flatMap(block => schedule(1, block)).slice(0,64).map(j => ({state: j.state})));
    save(path.join(here, 'DEV_PANEL_MANIFEST_closed-loop-v2.json'), {sha256: sha(JSON.stringify(evaluationJobs())), games: evaluationJobs().jobs.length, sealedAccess: 0});
    status('preflight');
    await command(['ai_training/run.mjs', 'node', '--import', 'tsx', 'continuation_review_20261030/stage8/worker_smoke.ts'], path.join(data, 'worker-smoke.log'));
    // K1 的严格对拍输出写 Stage 8，不能改写已部署资产。
    const preflight = path.join(data, 'preflight-closed-loop-v2'); fs.mkdirSync(preflight, {recursive: true});
    for (const ext of ['.json', '.bin']) fs.copyFileSync(K1.prefix + ext, path.join(preflight, 'final') + ext);
    assert((await exportParity({prefix: path.join(preflight, 'final'), sha256: K1.sha256})).passed);
    await command(['ai_training/run.mjs', path.join(root, 'ai_training/.venv-rocm/Scripts/python.exe'), '-B', '-X', 'utf8',
        'continuation_review_20261030/stage8/train_smoke.py', K1.prefix, path.join(preflight, 'parity-input.frames')], path.join(data, 'train-smoke.log'));
    let model = K1;
    let baselineScreen:Awaited<ReturnType<typeof evaluate>>|undefined;
    let baselineFull:Awaited<ReturnType<typeof evaluate>>|undefined;
    // 旧L1与3000ms收据保持原位；旧L1先以部署预算独立筛查，不据旧预算晋升。
    const original=read(path.join(data,'gen1/L1/TRAIN.json'));
    assert(original.complete);
    status('screening',{candidate:'L1-original'});
    baselineScreen=await evaluate('K1-hard',K1,'hard',true);
    const originalScreen=await evaluate('L1-original-hard',{prefix:original.prefix,sha256:original.sha256},'hard',true);
    const originalDecision=screenComparison(baselineScreen,originalScreen);
    save(path.join(here,'SCREEN_DECISIONS.json'),{original:originalDecision});
    for(let generation=1;generation<=2;generation++) {
        checkLock();guard();
        const directory=path.join(data,`gen${generation}`);
        if(!fs.existsSync(path.join(directory,'SUMMARY.json'))){
            status('collection',{generation,model});assert((await collect(generation,model)).passed);
        }
        assert(read(path.join(directory,'SUMMARY.json')).passed);
        if(!fs.existsSync(path.join(directory,'DATASET.json'))){status('dataset',{generation});exportDataset(generation);}
        // Gen1修订版从K1重训，使父局留出不被原L1已消费的数据污染；后代沿用上代候选。
        status('training',{generation,candidate:`L${generation}-covered3`});
        await command(['ai_training/run.mjs',path.join(root,'ai_training/.venv-rocm/Scripts/python.exe'),'-B','-X','utf8',
            'continuation_review_20261030/stage8/train.py',String(generation),model.prefix,model.sha256],path.join(directory,'covered3-train.log'));
        const trained=read(path.join(directory,`L${generation}-covered3`,'TRAIN.json'));assert(trained.complete&&trained.coverageEpochs===3);
        const candidate={prefix:trained.prefix,sha256:trained.sha256};
        checkLock();status('parity',{generation});assert((await exportParity(candidate)).passed,'双端数值对拍失败');
        status('screening',{generation});
        const screened=await evaluate(`L${generation}-covered3-hard`,candidate,'hard',true);
        const decision=screenComparison(baselineScreen,screened);
        const decisions=read(path.join(here,'SCREEN_DECISIONS.json'));decisions[`L${generation}-covered3`]=decision;save(path.join(here,'SCREEN_DECISIONS.json'),decisions);
        if(decision.continueFull){
            status('evaluation',{generation});
            baselineFull??=await evaluate('K1-hard',K1,'hard');
            const versusHard=await evaluate(`L${generation}-covered3-hard`,candidate,'hard');
            const versusK1=await evaluate(`L${generation}-covered3-K1`,candidate,'K1');
            const promotion=gate(baselineFull,versusHard,versusK1);
            save(path.join(here,`L${generation}_GATE.json`),promotion);
            if(promotion.passed){
                status('public_gates',{generation});
                const npm=path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
                for(const task of ['lint','test','build'])await command([npm,'run',task],path.join(directory,`${task}.log`));
                checkLock();save(path.join(here,'PROMOTION_READY.json'),{candidate,generation,promotion,publicGates:true,sealedAccess:0});
                status('promotion_ready',{generation,candidate});break;
            }
        }
        if(generation===2){status('not_promoted',{generation});}
        else model=candidate;
    }

} catch (error) {
    if(error instanceof DrainStop){status('paused',{reason:String(error)});report('按STOP/DRAIN请求排空已派发对局并关闭服务，尚未派发的任务保留，未进入后续训练。');}
    else {status('failed', {error: String(error)}); report('运行因真实错误或门禁未通过而停止：`' + String(error) + '`。既有数据与模型保留。'); throw error;}
} finally {
    if (fs.readFileSync(pidFile, 'utf8') === String(process.pid)) fs.unlinkSync(pidFile);
    const evidence = fs.readdirSync(here).filter(f => /\.(?:json|md|ts|py|mjs)$/.test(f) && f !== 'EVIDENCE_MANIFEST.json')
        .map(file => ({file, sha256: fileSha(path.join(here, file))}));
    save(path.join(here, 'EVIDENCE_MANIFEST.json'), {files: evidence, sealedAccess: 0});
}
