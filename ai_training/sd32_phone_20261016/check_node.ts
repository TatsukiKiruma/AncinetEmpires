import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { check } from './check_shared';
const root = 'ai_training/sd32_phone_20261016/';
const json = (n: string) => JSON.parse(fs.readFileSync(root + n, 'utf8'));
const lines = (n: string) => gunzipSync(fs.readFileSync(root + n)).toString().trim().split('\n').map(v => JSON.parse(v));
const result = check(lines('probe-base.jsonl.gz'), lines('probe-encoded.jsonl.gz'), lines('reference.jsonl.gz'), json('schema.json'), json('initial.json'), json('reference-gradient.json'));
fs.writeFileSync(root + 'node-parity.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
