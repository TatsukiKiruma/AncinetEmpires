import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { OUT, walk, fileSha, sourceIdentity, immutable } from './io';

const summary = JSON.parse(await readFile(path.join(OUT, 'summary.json'), 'utf8'));
const final = JSON.parse(await readFile(path.join(OUT, 'final-summary.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(OUT, 'manifest.json'), 'utf8'));
const integrity = JSON.parse(await readFile(path.join(OUT, 'integrity-report.json'), 'utf8'));
const release = JSON.parse(await readFile(path.join(OUT, 'policy-release-index.json'), 'utf8'));
if (summary.status !== 'COMPLETE' || summary.completed !== manifest.uniqueResponses || final.completeReceipts !== manifest.uniqueResponses || integrity.uniqueResponsesVerified !== manifest.uniqueResponses) throw Error('尚未满足全量封存条件');
if (release.modelSchemaAccepted !== false || release.trainingAuthorized !== false || release.candidateSources.reduce((n: number, r: any) => n + r.policyRows, 0) !== final.policyLabelEligibleRows) throw Error('policy用途索引未按模型门槛与投降合同封闭');
try { await stat(path.join(OUT, 'worker.lock.json')); throw Error('转换worker仍持有锁，暂不封存'); } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
if ((await sourceIdentity()).hash !== manifest.source.hash) throw Error('封存时源码身份变化');
const files = await walk(OUT, n => n !== 'EVIDENCE_MANIFEST.json' && !n.endsWith('.tmp'));
await immutable(path.join(OUT, 'EVIDENCE_MANIFEST.json'), { sealedAt: new Date().toISOString(), schema: manifest.schema,
  sourceHash: manifest.source.hash, converterIdentity: manifest.converterIdentity,
  qualifiedScope: 'policyLabelEligible来源层候选；具体modelSchemaAccepted=false，未开始训练或新评测对局',
  artifacts: await Promise.all(files.map(async f => ({ path: path.relative(OUT, f).replaceAll('\\', '/'), bytes: (await stat(f)).size, sha256: await fileSha(f) }))) });
console.log(JSON.stringify({ sealed: true, files: files.length, accepted: final.acceptedGames, rejected: final.rejectedGames }));
