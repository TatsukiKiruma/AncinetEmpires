/** 只读检查已训练模型的候选顺序等变性；不能代替 Python/TS 完整一致性测试。 */
import fs from 'node:fs';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { SpatialResNetPredictor, loadSpatialResNetFromJson } from '../../src/game/ai/spatial_conv_net';
import { GameEngine } from '../../src/game/engine';
import { encodeCandidateActionSpatial } from '../../src/game/ai/spatial_tensor_encoder';
import type { Action, GameState } from '../../src/game/types';

/** 投石车在距离 3 攻击士兵；真实规则不允许该士兵在此距离反击。 */
function probeCounterFeature() {
    const state: GameState = {
        turn: 1, currentPlayer: 0, winner: null,
        map: { width: 5, height: 3, tiles: Array.from({ length: 3 }, () =>
            Array.from({ length: 5 }, () => ({ terrainId: 6, ownerId: null }))) },
        players: [0, 1].map(id => ({ id, gold: 0, isAlive: true, commanderDeathCount: 0 })),
        units: [
            { id: 'catapult', ownerId: 0, unitClass: 'catapult', pos: { x: 0, y: 1 },
                hp: 100, maxHp: 100, hasMoved: false, hasActed: false },
            { id: 'soldier', ownerId: 1, unitClass: 'soldier', pos: { x: 3, y: 1 },
                hp: 100, maxHp: 100, hasMoved: false, hasActed: false },
        ],
    };
    const engine = new GameEngine(state);
    const action: Action = { type: 'attack', attackerId: 'catapult', targetId: 'soldier' };
    const legal = engine.getLegalActions(0).some(a => a.type === 'attack'
        && a.attackerId === 'catapult' && a.targetId === 'soldier');
    if (!legal) throw new Error('反击核验样例的攻击不合法');
    const features = encodeCandidateActionSpatial(engine.getState(), 0, action, 'v2');
    engine.step(action);
    const after = engine.getState();
    return { action, distance: 3, legal,
        encodedCounterDamage: Number(features.semantics[15]) * 100,
        actualAttackerHpLoss: 100 - (after.units.find(u => u.id === 'catapult')?.hp ?? 0),
        defenderRemainingHp: after.units.find(u => u.id === 'soldier')?.hp ?? 0,
        scope: '只有一个受控反击样例；未测全部能力、光环和回合开始效果。' };
}

async function main() {
    const checkpoint = 'v13/out/v13_20260924_t13/T13-07/data_v3_b0_v31/runs/s42/best.json';
    const data = 'v13/out/v13_20260924_t13/T13-07/data_v3_b0_v31/pool_v31_subset.jsonl';
    const bytes = fs.readFileSync(checkpoint);
    const predictor = new SpatialResNetPredictor(loadSpatialResNetFromJson(bytes.toString('utf8')));
    const stream = fs.createReadStream(data, { encoding: 'utf8' });
    const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
    const rows: unknown[] = [];
    try {
        for await (const line of lines) {
            if (!line.trim()) continue;
            const row = JSON.parse(line);
            const encoded = { spatialTensor: new Float32Array(row.spatialTensor),
                globalFeatures: new Float32Array(row.globalFeatures), mapWidth: 20, mapHeight: 20,
                subjectPlayerId: row.subjectPlayer, version: 'v2' as const };
            const first = predictor.predict(encoded, row.candidateActions);
            const reversed = predictor.predict(encoded, [...row.candidateActions].reverse());
            const aligned = [...reversed.actionLogits].reverse();
            const maxDiff = Math.max(...first.actionLogits.map((x, i) => Math.abs(x - aligned[i])));
            rows.push({ sampleId: row.sampleId, candidates: aligned.length, maxAlignedLogitDiff: maxDiff,
                valueDiff: Math.abs(first.value - reversed.value),
                originalAction: row.candidateActionCodes[first.bestActionIndex],
                reversedAction: [...row.candidateActionCodes].reverse()[reversed.bestActionIndex] });
            if (rows.length >= 8) break;
        }
    } finally { lines.close(); stream.destroy(); }
    const result = { schema: 'v14_readonly_permutation_probe_1', generatedAt: new Date().toISOString(),
        checkpoint, checkpointSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        scope: '8 个存储样本的 TS 前向反序检查及一个合法攻击样例；没有验证训练梯度或跨语言一致性。',
        rows, counterFeatureProbe: probeCounterFeature() };
    fs.writeFileSync('v14/review/policy_permutation_probe.json', JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
