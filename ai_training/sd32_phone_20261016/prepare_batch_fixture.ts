import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { segmentWriter } from './stream_format';
const root = 'ai_training/sd32_phone_20261016/';
const rows = gunzipSync(fs.readFileSync(root + 'probe-base.jsonl.gz')).toString().trim().split('\n').slice(0, 2).map(s => JSON.parse(s));
const out = await segmentWriter(root + 'format-batch.dict.gz', 8);
for (let i = 0; i < 8; i++) { const r = rows[i % 2]; await out.row(r, r.target, r.weight); }
await out.close();
