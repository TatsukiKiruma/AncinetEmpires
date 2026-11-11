import fs from 'node:fs';import path from 'node:path';
import {panel,STAGE,sha} from './supervisor.mjs';
const id=process.argv[2],model=process.argv[3];if(!id||!model)throw Error('需要实验身份和模型路径');
const parity=JSON.parse(fs.readFileSync(path.join(STAGE,'evidence',`parity_${sha(model)}.json`)));if(!parity.passed)throw Error('候选parity未通过');
const manifest=JSON.parse(fs.readFileSync(path.join(STAGE,'configs/dev_manifest.json')));
const p=path.join(STAGE,'configs',`dev_${id}.json`);const cfg={id:`dev_${id}`,candidate:{type:'model',model,expectedSha256:sha(model)},games:manifest.games};
if(fs.existsSync(p)){if(JSON.stringify(JSON.parse(fs.readFileSync(p)))!==JSON.stringify(cfg))throw Error('拒绝变更已冻结DEV身份');}else fs.writeFileSync(p,JSON.stringify(cfg,null,2),{flag:'wx'});
await panel(p);
