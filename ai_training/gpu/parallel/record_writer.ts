/** 有界合并JSONL后同步压缩；保留所有记录及正常停止／错误收尾。 */
import fs from 'node:fs';
import {gzipSync} from 'node:zlib';
export class DecisionRecordWriter {
    private pending:string[]=[];private pendingBytes=0;
    private descriptor:number|null=null;private closed=false;private failed=false;
    records=0;members=0;rawBytes=0;compressedBytes=0;peakPendingBytes=0;fileOpens=0;
    constructor(private file:string,private chunkBytes=0){if(!Number.isSafeInteger(chunkBytes)||chunkBytes<0)throw Error('记录压缩块大小无效');}
    append(line:string){if(this.closed||this.failed)throw Error('决策记录器已关闭或失败');const bytes=Buffer.byteLength(line);if(this.pendingBytes&&this.pendingBytes+bytes>this.chunkBytes)this.flush();this.pending.push(line);this.pendingBytes+=bytes;this.records++;this.rawBytes+=bytes;this.peakPendingBytes=Math.max(this.peakPendingBytes,this.pendingBytes);if(!this.chunkBytes||this.pendingBytes>=this.chunkBytes)this.flush();}
    flush(){if(!this.pending.length||this.failed)return;try{const compressed=gzipSync(this.pending.join(''),{level:1});if(this.descriptor===null){this.descriptor=fs.openSync(this.file,'a');this.fileOpens++;}fs.writeFileSync(this.descriptor,compressed);this.members++;this.compressedBytes+=compressed.length;this.pending=[];this.pendingBytes=0;}catch(e){this.failed=true;throw e;}}
    close(){if(this.closed)return;try{this.flush();}finally{if(this.descriptor!==null){fs.closeSync(this.descriptor);this.descriptor=null;}this.closed=true;}}
    summary(){return {records:this.records,members:this.members,rawBytes:this.rawBytes,compressedBytes:this.compressedBytes,peakPendingBytes:this.peakPendingBytes,chunkBytes:this.chunkBytes,fileOpens:this.fileOpens};}
}
