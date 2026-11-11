// 仅在本地读取APK与既有反编译证据，保存结果语义的身份凭据。
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=path.dirname(fileURLToPath(import.meta.url));
const sources=[
 'APK/aer-release-4.2.5.1.apk',
 'APK/_analysis/unpack/assets/mods/SD/controller.js',
 'APK/_analysis/jadx_output/java/p036c/p037a/p039b/p040a/C0598o.java',
 'APK/_analysis/jadx_output/java/p036c/p037a/p039b/p040a/C0600q.java',
 'APK/_analysis/jadx_output/java/p036c/p037a/p039b/p040a/p042t/C0606a.java',
 'tools/phone_training/worker.rhino.js','tools/phone_training/continuation.rhino.js',
 'tools/phone_training/cycle_metadata.js.jsonl'
];
const identity=sources.map(p=>{const b=fs.readFileSync(path.join(root,p));return {path:p,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')};});
if(identity[0].sha256!=='51b00185f300dd8899284aa91986aee9a1cc73fa012262a0d9eebc97fad1aa7b')throw Error('APK身份不符');
const stage=fs.readFileSync(path.join(root,sources[2]),'utf8');
if(!stage.includes('Invalid alliance: ') || !stage.includes('m4398c().f1236h = i;'))throw Error('获胜联盟静态证据不符');
const decoded=fs.readFileSync(path.join(out,'sd_controller_decoded.txt'),'utf8');
const lines=decoded.split(/\r?\n/);
const sourceQuotes=lines.map((text,i)=>({line:i+1,text})).filter(r=>r.line>=52&&r.line<=59);
const receipt={observedAt:new Date().toISOString(),identity,sourceQuotes,
 observed:'原生c.a.b.a.t.a.h经SyncGameOver(int)保存联盟编号；-1为尚未终局。不是位掩码。SD唯一存活联盟触发结束。',
 producer:'worker将cfg.j设为[1,2,3,4,5,6]；读取h并错误命名为winner_mask。该名字不改变原生语义。',
 limitation:'这是既有JADX静态代码和资源的本地核对，不是REA成功反编译；REA缺JADX提供器。尚未完成3000局完整快照的解码、联盟数组逐局验证、原生到TS结果映射验收。0以及其他mod结束码不得据此泛化为自然和局。'};
fs.writeFileSync(path.join(out,'native_semantics_receipt.json'),JSON.stringify(receipt,null,2),{flag:'wx'});
console.log(JSON.stringify({apkSha256:identity[0].sha256,result:receipt.observed}));
