import fs from 'node:fs';
import { APK_TERRAIN_CONFIGS, mapSkirmishApkTerrainId } from '../../src/game/apk_terrain';
import { TERRAIN_CONFIG } from '../../src/game/terrain';
import { REL_KEYS } from './spatial';
import { parameterCount, type Schema } from './model';
const root = 'ai_training/sd32_phone_20261016/';
const old = JSON.parse(fs.readFileSync('ai_training/sd_300_parent_pilot_20261016/schema.json', 'utf8'));
const schema: Schema = { version: 'sd-rel32-phone-v1', token: old.token, candidate: { keys: [...old.candidate.keys, ...REL_KEYS] }, hidden: 32, baseCandidateCount: old.candidate.keys.length,
  terrainMap: Object.fromEntries(APK_TERRAIN_CONFIGS.map(t => [String(t.id), mapSkirmishApkTerrainId(t.id)]).filter(([, v]) => v !== null)),
  castleTerrain: Object.entries(TERRAIN_CONFIG).filter(([, c]) => c.tags.includes('castle')).map(([k]) => +k),
  townTerrain: Object.entries(TERRAIN_CONFIG).filter(([, c]) => c.tags.includes('town')).map(([k]) => +k),
};
let seed = 90061016;
const weights = Array.from({ length: parameterCount(schema) }, () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed / 4294967296 - 0.5) * 0.12; });
fs.writeFileSync(root + 'schema.json', JSON.stringify(schema)); fs.writeFileSync(root + 'initial.json', JSON.stringify(weights));
console.log(JSON.stringify({ parameters: weights.length, dimensions: [schema.token.keys.length, schema.candidate.keys.length], hidden: schema.hidden }));
