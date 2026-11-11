/** 主线程验证并读取一次worker包，通过内存分发，减少各worker重复模块读盘。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {ROOT,fileSha} from '../hard_jobs';
export function loadSharedWorkerCode(){
    const base=path.join(ROOT,'ai_training/gpu/native/build'),manifest=JSON.parse(fs.readFileSync(path.join(base,'worker.manifest.json'),'utf8'));
    if(fileSha(path.join(ROOT,'ai_training/gpu/native/build_worker.mjs'))!==manifest.builderSha256)throw Error('worker包生成器改变，需要重新构建');
    const sources=manifest.sources as Record<string,string>;
    for(const [file,sha] of Object.entries(sources))if(fileSha(path.join(ROOT,file))!==sha)throw Error('worker包源码改变，需要重新构建：'+file);
    const raw=fs.readFileSync(path.join(base,'worker.cjs'));if(crypto.createHash('sha256').update(raw).digest('hex')!==manifest.bundleSha256)throw Error('worker包摘要不符');
    // OpenSSL提供器为进程级设置，Worker显式execArgv不接受该启动选项。
    const execArgv:string[]=[];for(let i=0;i<process.execArgv.length;i++){const arg=process.execArgv[i];if(arg==='--import'&&process.execArgv[i+1]==='tsx'){i++;continue;}if(arg==='--import=tsx'||arg==='--openssl-legacy-provider')continue;execArgv.push(arg);}
    return {code:raw.toString('utf8'),execArgv,sources,bytes:raw.length,sha256:manifest.bundleSha256};
}
