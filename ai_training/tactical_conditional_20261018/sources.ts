import fs from 'node:fs';
import path from 'node:path';
import { projectSnapshot } from '../data_acceptance_20261016/phone/projection';
import { readNativeSnapshot } from '../data_acceptance_20261016/native_reader/reader';
import { DIR } from './io';

export function initialFor(parent: any) {
    const base = path.join(DIR, 'initial-native', parent.parentId);
    const state = projectSnapshot(readNativeSnapshot(fs.readFileSync(path.join(base, 'initial.bin'))), fs.readFileSync(path.join(base, 'config.bin')), parent.map);
    // 冻结合同记录原生字段为人口上限；这里只恢复每局显式配置，不改变公共招募规则。
    const rules = state.rules! as NonNullable<typeof state.rules> & { allowZeroPopulationRecruitAtLimit?: boolean };
    rules.populationLimit = rules.unitLimit;
    delete rules.unitLimit;
    rules.allowZeroPopulationRecruitAtLimit = true;
    for (const config of Object.values(rules.teams ?? {})) { config.populationLimit = config.unitLimit; delete config.unitLimit; }
    return state;
}
export function groupKey(a: any): string {
    const actor = a.unitId ?? a.attackerId ?? a.healerId ?? a.summonerId ?? a.supporterId;
    return (actor !== undefined ? `unit:${actor}` : a.castlePos ? `castle:${a.castlePos.x},${a.castlePos.y}` : 'global') + '|' + a.type;
}
