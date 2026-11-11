/** 生成资产内的有界缓存与紧凑范围编码，展示层不引入研究目录依赖。 */
export const hardNativeCacheHelpers=`
function createHardNativeCache(limit) {
    const entries=new Map();let bytes=0;
    return {
        get(key){const item=entries.get(key);return item?item.value:undefined;},
        set(key,value,payloadBytes){const size=payloadBytes+key.length*2+128,old=entries.get(key);if(old){bytes-=old.bytes;entries.delete(key);}if(size>limit)return;while(bytes+size>limit&&entries.size){const first=entries.keys().next().value;bytes-=entries.get(first).bytes;entries.delete(first);}entries.set(key,{value,bytes:size});bytes+=size;},
        clear(){entries.clear();bytes=0;},
        get size(){return entries.size;},get bytes(){return bytes;},limit
    };
}
function packHardNativeRange(positions) {
    const values=new Int16Array(positions.length*3);
    for(let i=0;i<positions.length;i++){const p=positions[i];values[i*3]=p.row;values[i*3+1]=p.col;values[i*3+2]=p.remaining;}
    return values;
}
function unpackHardNativeRange(values) {
    const result=[];for(let i=0;i<values.length;i+=3)result.push({row:values[i],col:values[i+1],remaining:values[i+2]});return result;
}
`;
