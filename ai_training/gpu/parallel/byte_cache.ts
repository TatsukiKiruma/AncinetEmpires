/** 按估算字节限制缓存；只淘汰可重新计算的结果，命中时不重排热路径。 */
export class ByteCache<T> {
    private entries=new Map<string,{value:T;bytes:number}>();
    bytes=0;peakBytes=0;evictions=0;hits=0;misses=0;
    constructor(readonly limitBytes:number){if(!Number.isSafeInteger(limitBytes)||limitBytes<0)throw Error('缓存字节上限无效');}
    get size(){return this.entries.size;}
    get(key:string):T|undefined{const entry=this.entries.get(key);if(entry){this.hits++;return entry.value;}this.misses++;return undefined;}
    set(key:string,value:T,payloadBytes:number){
        const bytes=payloadBytes+key.length*2+128;if(!Number.isSafeInteger(bytes)||bytes<0)throw Error('缓存大小无效');
        const previous=this.entries.get(key);if(previous){this.bytes-=previous.bytes;this.entries.delete(key);}
        if(bytes>this.limitBytes)return;
        while(this.bytes+bytes>this.limitBytes&&this.entries.size){const first=this.entries.keys().next().value!;this.bytes-=this.entries.get(first)!.bytes;this.entries.delete(first);this.evictions++;}
        this.entries.set(key,{value,bytes});this.bytes+=bytes;this.peakBytes=Math.max(this.peakBytes,this.bytes);
    }
    clear(){this.entries.clear();this.bytes=0;}
    summary(){return {limitBytes:this.limitBytes,bytes:this.bytes,peakBytes:this.peakBytes,entries:this.size,evictions:this.evictions,hits:this.hits,misses:this.misses};}
}
