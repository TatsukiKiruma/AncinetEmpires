import fs from 'node:fs';
import path from 'node:path';
import { DIR, read, save } from './common';
import { gzipRows } from '../dual_stream_v2_phase1_20261020/io';

const q = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return { count: sorted.length, p50: sorted[Math.max(0, Math.ceil(sorted.length * .5) - 1)] ?? null, p95: sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)] ?? null, p99: sorted[Math.max(0, Math.ceil(sorted.length * .99) - 1)] ?? null, max: sorted.at(-1) ?? null };
};

/** 采样的双方超时、真实反扑完成度及队列尾延迟也直接参与晋升。 */
export async function auditLeagueQuality(folder: string, plan: any) {
    const roots: number[] = [], queues: number[] = [], teacher: number[] = [], opponent: number[] = [], failures: any[] = [];
    let finite = true, attempts = 0, complete = 0, expandedChains = 0, staticComplete = 0, unknown = 0, errors = 0, walls = 0, teacherTimeouts = 0, opponentTimeouts = 0;
    const decision = (ms: number, isTeacher: boolean, telemetry: any) => {
        finite &&= Number.isFinite(ms); (isTeacher ? teacher : opponent).push(ms);
        if (!isTeacher || !telemetry) return;
        finite &&= Number.isFinite(telemetry.rootValue);
        if (telemetry.queued) queues.push(ms);
        else {
            roots.push(ms); attempts += telemetry.retaliationAttempts; complete += telemetry.retaliationComplete;
            for (const risk of telemetry.risks ?? []) { finite &&= Number.isFinite(risk.penalty); expandedChains += risk.expandedChains; staticComplete += Number(risk.staticComplete); }
        }
    };
    for (const slot of plan.slots) {
        const prefix = `${folder}/games/${slot.id}`, result = read(prefix + '/result.json');
        for await (const row of gzipRows(fs.readFileSync(path.join(DIR, prefix, 'actions.jsonl.gz')))) decision(row.ms, row.teacher, row.telemetry);
        if (result.failedDecision) decision(result.failedDecision.ms, result.failedDecision.teacher, result.failedDecision.telemetry);
        if (result.classification === 'decision_timeout') {
            if (result.failedDecision?.teacher === true) teacherTimeouts++;
            else if (result.failedDecision?.teacher === false) opponentTimeouts++;
            else unknown++;
            failures.push({ id: slot.id, classification: result.classification, failedDecision: result.failedDecision });
        }
        if (result.classification === 'wall_truncation') { walls++; failures.push({ id: slot.id, classification: result.classification }); }
        const interruption = path.join(DIR, prefix, 'interruption.json');
        if (fs.existsSync(interruption)) { errors++; failures.push({ id: slot.id, interruption: read(interruption) }); }
        else if (result.resumeSegments > 0) { unknown++; failures.push({ id: slot.id, reason: '恢复了采样前缀，但没有登记停止归属' }); }
        if (result.classification === 'error' || result.error) errors++;
    }
    const quality = { zeroModelTimeouts: teacherTimeouts === 0, zeroOpponentTimeouts: opponentTimeouts === 0, zeroExecutionErrors: errors === 0, zeroWallStops: walls === 0, zeroUnknownStops: unknown === 0, retaliationComplete100: attempts > 0 && attempts === complete, finiteNumerics: finite, rootMaxWithin1000ms: roots.length > 0 && roots.every(ms => ms <= 1000), queueBelow1ms: queues.length > 0 && queues.every(ms => ms < 1) };
    const result = { quality, failures, teacherTimeouts, opponentTimeouts, errors, walls, unknown, retaliation: { attempts, complete, expandedChains, staticComplete, fullEnemySearch: false }, rootLatency: q(roots), queueLatency: q(queues), teacherLatency: q(teacher), opponentLatency: q(opponent) };
    save(folder + '/league-quality.json', result);
    return result;
}
