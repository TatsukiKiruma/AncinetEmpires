import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { DIR, read, sha } from './common';
import { extractGame, pureReference } from './expert_extraction';

const generation = Number(process.argv[2]), lane = Number(process.argv[3] ?? 0), lanes = Number(process.argv[4] ?? 1);
const folder = `generations/gen_${String(generation).padStart(2, '0')}`, plan = read(folder + '/league-plan.json');
const raw = gunzipSync(fs.readFileSync(path.join(DIR, 'evaluation-exclusions.txt.gz'))).toString(), receipt = read('evaluation-exclusion-receipt.json');
if (sha(raw) !== receipt.sha256 || !receipt.includesFixedDevStates) throw Error('专家提取排重身份不完整');
const excluded = new Set(raw.trim().split('\n')), reference = pureReference(plan);
for (const slot of plan.slots) if (slot.index % lanes === lane) {
    const r = await extractGame(slot, folder, excluded, reference);
    console.log(JSON.stringify({ slot: slot.id, eligible: r.eligible, corrections: r.corrections, unchangedPlanOverrides: r.unchangedPlanOverrides }));
}
