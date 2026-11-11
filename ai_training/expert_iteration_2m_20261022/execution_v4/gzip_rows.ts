/** 逐块解压并按行消费，避免把整局见证转成超过V8长度上限的字符串。 */
import fs from 'node:fs';
import { createGunzip } from 'node:zlib';
import { StringDecoder } from 'node:string_decoder';

export async function* gzipLines(file:string):AsyncGenerator<string> {
    if(!fs.existsSync(file))return;
    const input=fs.createReadStream(file),unzip=createGunzip(),decoder=new StringDecoder('utf8');
    input.on('error',error=>unzip.destroy(error));
    input.pipe(unzip);
    let pending='';
    try{
        for await(const chunk of unzip){
            pending+=decoder.write(chunk as Buffer);
            let end:number;
            while((end=pending.indexOf('\n'))>=0){
                const line=pending.slice(0,end).trim();pending=pending.slice(end+1);
                if(line)yield line;
            }
        }
        pending+=decoder.end();
        if(pending.trim())yield pending.trim();
    }finally{input.destroy();unzip.destroy();}
}

export async function* gzipJsonRows(file:string):AsyncGenerator<any> {
    for await(const line of gzipLines(file))yield JSON.parse(line);
}
