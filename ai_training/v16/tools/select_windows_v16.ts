/**
 * V16/T16-01 §3.2：从已采集的失败窗口里选固定 40 个反事实窗口（owner：T16-01）。
 *
 * 选择规则（预登记，写进输出，避免"挑好看的窗口"）：
 * - 五图各 8 个；
 * - 每图先手（seat 0）与后手（seat 1）各 4 个；某图某一座位不足时如实记录缺口，
 *   由同图另一座位补足，并在 `seatBalanceDeficit` 里写明；
 * - 同一 `gameId` 最多取 3 个窗口（原本就是每局上限 3 个）；
 * - 同一张图内按 `l1ScoreGap` 升序（越大越负 = L1 越不认可模型动作）优先，
 *   并列按 (gameId, stepIndex) 字典序，保证选择可复算；
 * - 排序键与结果一并写进 `selected.json`，第三方可逐项复算。
 *
 * 用法：
 *   node ... v16/tools/select_windows_v16.ts --inputs a.windows.jsonl,b.windows.jsonl \
 *     --per-map 8 --per-seat 4 --out <dir>
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { V16_MAPS } from './eval_v16_protocol';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
    return fallback;
}

const INPUTS = (arg('--inputs', '') as string).split(',').map((s) => s.trim()).filter(Boolean);
const PER_MAP = Number(arg('--per-map', '8'));
const PER_SEAT = Number(arg('--per-seat', '4'));
const OUT_DIR = path.resolve(arg('--out-dir', 'v16/out/v16_20260926_core/T16-01/counterfactual') as string);

interface Window {
    windowId?: string;
    gameId: string;
    mapName: string;
    candidateSeat: number;
    stepIndex: number;
    l1ScoreGap: number | null;
    proofLevel: string;
}

const rows: Window[] = [];
for (const file of INPUTS) {
    const abs = path.resolve(file);
    if (!fs.existsSync(abs)) throw new Error(`[T16-01] 窗口文件不存在：${abs}`);
    for (const line of fs.readFileSync(abs, 'utf8').split(/\r?\n/)) {
        if (!line.trim()) continue;
        rows.push(JSON.parse(line) as Window);
    }
}

const key = (w: Window): string => `${w.gameId}#step${w.stepIndex}`;
const dedup = new Map<string, Window>();
for (const row of rows) dedup.set(key(row), row);
const pool = [...dedup.values()];

function sortKey(w: Window): [number, string, number] {
    return [w.l1ScoreGap === null ? Number.POSITIVE_INFINITY : w.l1ScoreGap, w.gameId, w.stepIndex];
}

const selected: Window[] = [];
const deficits: Array<Record<string, unknown>> = [];

for (let m = 0; m < V16_MAPS.length; m += 1) {
    const mapName = V16_MAPS[m];
    const mapPool = pool.filter((w) => w.mapName === mapName);
    const chosen: Window[] = [];
    const chosenKeys = new Set<string>();
    const perGame = new Map<string, number>();
    const take = (w: Window): void => {
        const k = key(w);
        if (chosenKeys.has(k)) return;
        const used = perGame.get(w.gameId) ?? 0;
        if (used >= 3) return;
        chosenKeys.add(k);
        perGame.set(w.gameId, used + 1);
        chosen.push(w);
    };
    for (const seat of [0, 1]) {
        const seatPool = mapPool
            .filter((w) => w.candidateSeat === seat)
            .sort((a, b) => {
                const ka = sortKey(a);
                const kb = sortKey(b);
                if (ka[0] !== kb[0]) return ka[0] - kb[0];
                if (ka[1] !== kb[1]) return ka[1] < kb[1] ? -1 : 1;
                return ka[2] - kb[2];
            });
        const before = chosen.length;
        for (const w of seatPool) {
            if (chosen.filter((c) => c.candidateSeat === seat).length >= PER_SEAT) break;
            take(w);
        }
        const got = chosen.length - before;
        if (got < PER_SEAT) {
            deficits.push({
                mapName, seat, requested: PER_SEAT, available: got,
                poolSizeForSeat: seatPool.length,
                note: '该图该座位可用窗口不足；由同图另一座位补足到 --per-map，缺口如实记录，不用其它图顶替。',
            });
        }
    }
    // 补足到 per-map：按同一排序键继续取。
    const fallbackPool = mapPool
        .filter((w) => !chosenKeys.has(key(w)))
        .sort((a, b) => {
            const ka = sortKey(a);
            const kb = sortKey(b);
            if (ka[0] !== kb[0]) return ka[0] - kb[0];
            if (ka[1] !== kb[1]) return ka[1] < kb[1] ? -1 : 1;
            return ka[2] - kb[2];
        });
    for (const w of fallbackPool) {
        if (chosen.length >= PER_MAP) break;
        take(w);
    }
    if (chosen.length < PER_MAP) {
        deficits.push({
            mapName, seat: null, requested: PER_MAP, available: chosen.length,
            note: '整张图的窗口不足；缺口如实记录，不复制同一窗口凑数。',
        });
    }
    selected.push(...chosen);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const outPath = path.join(OUT_DIR, 'selected_40.jsonl');
fs.writeFileSync(outPath, `${selected.map((w) => JSON.stringify(w)).join('\n')}\n`, 'utf8');
const manifest = {
    schema: 'v16_counterfactual_selection_1',
    task: 'T16-01',
    inputs: INPUTS.map((f) => path.resolve(f).replace(/\\/g, '/')),
    selectionRule: '五图各 8；每图每座位目标 4；同 gameId 最多 3；地图内按 l1ScoreGap 升序（并列按 gameId, stepIndex）',
    requested: { perMap: PER_MAP, perSeat: PER_SEAT, total: PER_MAP * V16_MAPS.length },
    selectedTotal: selected.length,
    byMap: selected.reduce((acc: Record<string, number>, w) => { acc[w.mapName] = (acc[w.mapName] ?? 0) + 1; return acc; }, {}),
    bySeat: selected.reduce((acc: Record<string, number>, w) => { acc[`seat${w.candidateSeat}`] = (acc[`seat${w.candidateSeat}`] ?? 0) + 1; return acc; }, {}),
    seatBalanceDeficit: deficits,
    proofLevelFromWindows: selected.reduce((acc: Record<string, number>, w) => { acc[w.proofLevel] = (acc[w.proofLevel] ?? 0) + 1; return acc; }, {}),
    outPath: outPath.replace(/\\/g, '/'),
    outSha256: crypto.createHash('sha256').update(fs.readFileSync(outPath)).digest('hex'),
    selectedIds: selected.map(key),
};
fs.writeFileSync(path.join(OUT_DIR, 'selected_40.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
    outPath: manifest.outPath,
    selectedTotal: manifest.selectedTotal,
    byMap: manifest.byMap,
    bySeat: manifest.bySeat,
    deficits: manifest.seatBalanceDeficit.length,
}, null, 2));