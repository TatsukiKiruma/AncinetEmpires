import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { check } from './check_shared';
import { gradientCheck } from './check_gradient';
const root = 'ai_training/sd_300_parent_pilot_20261016/';
const json = (name: string) => JSON.parse(fs.readFileSync(root + name, 'utf8'));
const lines = (name: string) => gunzipSync(fs.readFileSync(root + name)).toString().trim().split('\n').map(x => JSON.parse(x));
const result = check(lines('witnesses.jsonl.gz'), lines('encoded.jsonl.gz'), lines('reference.jsonl.gz'), json('schema.json'), json('initial.json'));
fs.writeFileSync(root + 'node-parity.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
const gradient = gradientCheck(lines('encoded.jsonl.gz')[0], json('schema.json'), json('initial.json'), json('gradient.json'));
fs.writeFileSync(root + 'node-gradient.json', JSON.stringify(gradient, null, 2));

