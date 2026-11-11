/** 把现有权威引擎和编码器打成手机本地模块，仅替换数据寻址与独立身份入口。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const here=path.dirname(fileURLToPath(import.meta.url)),stage3=path.dirname(here);
const out='D:/AncientEmpiresData/continuation_stage3_20261030_v1/phone_samsung_v1/payload';
let source=fs.readFileSync(path.join(stage3,'encode_server.ts'),'utf8').replace(/\r\n/g,'\n');
source=source.replace("import { preflight, sealedAllowed } from './identity';\npreflight();\nconst sealed = process.argv.includes('--sealed');\nif (sealed) sealedAllowed();", "const sealed = false;");
source=source.replace("read(path.join(HERE, 'PARTITIONS.json'))", "read(process.env.OMNI_PARENTS ?? path.join(HERE, 'ENCODER_PARENTS.json'))");
source=source.replace("const store = 'D:/AncientEmpiresData/continuation_stage1_20261030_v1/raw-store';", "const store = process.env.OMNI_RAW_STORE ?? path.join(HERE, 'raw-store');");
source=source.replace('128 * 2 ** 20','64 * 2 ** 20');
source=source.replace("const index = read(path.join(store, p.parentId + '.json'));", "const indexFile = path.join(store,p.parentId+'.json'); if(p.storeIndexSha256 && sha(fs.readFileSync(indexFile))!==p.storeIndexSha256) throw Error('手机前态索引摘要不符'); const index=read(indexFile);");
if(source.includes('preflight()') || !source.includes('ENCODER_PARENTS.json')) throw Error('移动编码器适配未生效');
// 独立模块在输入EOF后排空输出并关闭，避免宿主平台保留空闲句柄。
source += '\nprocess.stdout.end(() => process.exit(0));\n';
await build({stdin:{contents:source,resolveDir:stage3,sourcefile:'phone-encoder-source.ts',loader:'ts'},bundle:true,platform:'node',format:'esm',target:'node22',outfile:path.join(out,'encoder.bundle.mjs'),logLevel:'info'});
fs.writeFileSync(path.join(here,'ENCODER_SOURCE.txt'),source);
