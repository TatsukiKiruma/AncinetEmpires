import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { SOURCE, save } from './io';
import { nativeEntries, replayEntries } from './streaming_loader';

export function scanCoverage() {
    const earliest: Record<string, any[]> = {}, modes: Record<string, number> = {}, types = new Map<string, number>();
    for (const e of nativeEntries()) {
        const text = gunzipSync(fs.readFileSync(path.join(SOURCE, 'phone', e.candidateShard))).toString();
        const header = JSON.parse(text.slice(0, text.indexOf('\n')));
        if (header.kind === 'header') { const mode = String(header.initialState.rules?.commanderCastleRecruitUsesPending); modes[mode] = (modes[mode] ?? 0) + 1; }
        for (const match of text.matchAll(/"code":"(heal|support|summon|destroy_town|post_attack_move|recruit_and_deploy):/g)) {
            const type = match[1]; types.set(type, (types.get(type) ?? 0) + 1);
            if ((earliest[type]?.length ?? 0) >= 5) continue;
            const start = text.lastIndexOf('\n', match.index) + 1, end = text.indexOf('\n', match.index), row = JSON.parse(text.slice(start, end < 0 ? text.length : end));
            if (row.macro >= e.maxGlobalMacroExclusive || !e.policyLabelEligible) continue;
            if (!earliest[type]) earliest[type] = [];
            if (!earliest[type].some(x => x.segmentId === e.segmentId)) earliest[type].push({ segmentId: e.segmentId, macro: row.macro, subAction: row.subAction, code: row.code });
        }
    }
    const replayModes: Record<string, number> = {};
    for (const e of replayEntries()) {
        const text = gunzipSync(fs.readFileSync(path.join(SOURCE, 'replay', e.packet.path))).toString();
        const header = JSON.parse(text.slice(0, text.indexOf('\n'))), mode = String(header.initialState.rules?.commanderCastleRecruitUsesPending);
        replayModes[mode] = (replayModes[mode] ?? 0) + 1;
    }
    const report = { nativeSegments: 5012, replayResponses: 255, nativePendingRecruitModes: modes, replayPendingRecruitModes: replayModes, rareActionRows: Object.fromEntries(types), earliest };
    save('source-action-coverage.json', report); console.log(JSON.stringify(report)); return report;
}
if (process.argv[1]?.endsWith('source_coverage.ts')) scanCoverage();
