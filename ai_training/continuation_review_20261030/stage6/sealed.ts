import fs from 'node:fs';
import path from 'node:path';
import { HERE, S3, read, save, fileSha, allowSealed } from './arena_io';
import { healthy, strength } from './gates';
import { runtimeIdentity } from '../stage4_v7/runtime_identity';
import { runPanel } from './match_runner';

// 读取任何封存面板前独立重算硬门禁并核验全部54份开发收据。
const gateFile = path.join(HERE,'GATE_DECISION.json'), gate = read(gateFile);
if (!gate.passed || gate.stage !== 'Dev54' || !healthy(gate.full,54) || !strength(gate.full.games)) throw Error('开发硬门禁未通过，禁止访问封存');
const id = gate.selectedId, configFile = path.join(HERE,`config-${id}.json`), config = read(configFile);
if (fileSha(configFile) !== gate.configSha256 || fileSha(config.modelPrefix+'.bin') !== config.modelVersion) throw Error('候选身份变化');
for (const game of gate.full.games) {
    const dir = path.dirname(game.artifactDirectory), summary = read(path.join(dir,'SUMMARY.json'));
    const receipt = read(dir+'.receipt.json');
    if (receipt.summarySha256 !== fileSha(path.join(dir,'SUMMARY.json')) || !summary.gpuExited || summary.configSha256 !== gate.configSha256 || summary.games[0].id !== game.id || summary.games[0].firstPlace !== game.firstPlace) throw Error('开发收据身份变化');
}
const sources = Object.fromEntries(['arena.ts','arena_io.ts','arena_client.ts','arena_writer.ts','accurate_batch.py','infer.py','gates.ts','match_runner.ts','sealed.ts','sealed_offline.py','final_statistics.ts'].map(name=>[name,fileSha(path.join(HERE,name))]));
await save(path.join(HERE,'FINAL_TEST_ATTEMPT.json'), {attempts:1,sealedAccess:1,selectedId:id,gateSha256:fileSha(gateFile),configSha256:fileSha(configFile),modelSha256:config.modelVersion,runtimeSha256:runtimeIdentity().sha256,sources,started:new Date().toISOString()},true);
allowSealed();
for (const split of ['test','historical']) {
    const panelFile = split === 'test' ? path.join(S3,'OMNI_ARENA_TEST_PANEL.json') : path.join(HERE,'../stage1/ARENA_PANEL.json');
    const panel = read(panelFile);
    if (panel.matches.length !== (split === 'test' ? 54 : 40)) throw Error('封存面板数量不符');
    const result = await runPanel(id,panelFile,panel.matches.map((m:any)=>m.id),split,`${split}-full`);
    await save(path.join(HERE,split === 'test' ? 'SEALED54_SUMMARY.json' : 'HISTORICAL40_SUMMARY.json'),result,true);
}
await save(path.join(HERE,'SEALED_MATCHES_COMPLETE.json'),{complete:true,sealedAccess:1,workers:2},true);
