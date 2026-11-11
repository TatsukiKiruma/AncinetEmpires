import fs from 'node:fs';
import crypto from 'node:crypto';
import { parseAppApkSkirmishMap } from '../../src/game/apk_skirmish_map_assets';

// 只读解析封存课程清单中的地图；输出仅写入本研究目录。
const root = 'ai_training/next_stage_research_20261015';
const input = `${root}/snapshot_20261015_233413/03_curriculum-continuity.json`;
const bytes = fs.readFileSync(input);
const curriculum = JSON.parse(bytes.toString('utf8'));
const names = [...new Set<string>(curriculum.quotas_and_map_balance.flatMap((plan: { map_counts: Record<string, number> }) => Object.keys(plan.map_counts)))].sort();
const rows = names.map(name => {
  const parsed = parseAppApkSkirmishMap(name);
  return { name, width: parsed.width, height: parsed.height, exceeds20: parsed.width > 20 || parsed.height > 20 };
});
const result = {
  capturedAt: new Date().toISOString(),
  input,
  inputSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  method: '使用公共 parseAppApkSkirmishMap 解码项目 APK 地图资产，逐张读取实际解析宽高；不创建或推进对局。',
  mapCount: rows.length,
  exceeds20Count: rows.filter(row => row.exceeds20).length,
  rows,
};
fs.writeFileSync(`${root}/representation_map_audit.json`, JSON.stringify(result, null, 2), { flag: 'wx' });
console.log(JSON.stringify(result, null, 2));
