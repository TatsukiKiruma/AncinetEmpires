/** 从既有开发动作重建一个根，采样CPU先验热点，不执行新对局。 */
import path from 'node:path';
import { Session } from 'node:inspector/promises';
import assert from 'node:assert/strict';
import { GameEngine } from '../../../src/game/engine';
import { ReachabilityContext } from '../../../src/ai_runtime/dual_v2/reachability';
import { softPriors } from '../../../src/ai_runtime/dual_v3/search_policy';
import { DATA, S3, read, save, sha } from './io';
import { lines } from './analysis';

const summary = read(path.join(DATA, 'resume-v3-screen-maxn-prior035-aggregate/SUMMARY.json'));
const game = summary.games.find((g: any) => g.id === 'p4-16-s0');
const manifest = read(path.join(S3, 'DEV_INITIAL_MANIFEST.json'));
const engine = new GameEngine(read(path.join(S3, manifest.slots[game.slot].file)), { applyInitialTurnStart: false });
for await (const step of lines(path.join(game.artifactDirectory, 'steps.jsonl.gz'))) {
    assert.equal(sha(JSON.stringify(engine.getState())), step.before);
    if (step.step === 2137) break;
    engine.step(step.action);
}
const state = engine.getState(), legal = engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender');
const session = new Session(); session.connect();
await session.post('Profiler.enable'); await session.post('Profiler.start');
for (let i = 0; i < 80; i++) softPriors(state, legal, new ReachabilityContext(state));
const { profile } = await session.post('Profiler.stop'); session.disconnect();
await save(path.join(DATA, 'prior-profile-v4.json'), profile, true);
console.log(JSON.stringify(profile.nodes.filter(n => n.hitCount).sort((a, b) => b.hitCount! - a.hitCount!).slice(0, 24).map(n => ({ name: n.callFrame.functionName, file: n.callFrame.url, line: n.callFrame.lineNumber, hits: n.hitCount })), null, 2));
