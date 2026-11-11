import assert from 'node:assert/strict';

/** 地块来自已验证写时复制的只读网格，复用整块观察仍保留归属映射和绝对引用偏移。 */
export function optimizeTilePackets(source:string,helper:string){
    source=source.replace(/\r\n/g,'\n');
    const start=source.indexOf('  const tiles: number[][] = [];'),end=source.indexOf('  const unitRefs =',start);
    assert.ok(start>0&&end>start);
    const original=source.slice(start,end),loop=original.replace('  const tiles: number[][] = [];','    tiles=[];');
    const replacement=`  let tiles:number[][];
  const phoneTileKey=JSON.stringify([ids,state.map.width,state.map.height,tokens.length]);
  const phoneTileReadonly=isReadonlyTiles(state.map.tiles);
  const phoneTileRecords=phoneTileReadonly?phoneTilePacketCache.get(state.map.tiles):undefined;
  const phoneTilePrior=phoneTileRecords?.get(phoneTileKey);
  if(phoneTilePrior){
    tiles=phoneTilePrior.tiles;
    for(const token of phoneTilePrior.tokens){tokens.push(token);groups.push(1);}
  }else{
    const offset=tokens.length;
${loop}
    if(phoneTileReadonly){
      let records=phoneTileRecords;if(!records){records=new Map();phoneTilePacketCache.set(state.map.tiles,records);}
      if(records.size>=64)records.clear();records.set(phoneTileKey,{tokens:tokens.slice(offset),tiles});
    }
  }
`;
    return `import {isReadonlyTiles} from ${JSON.stringify(helper)};\n`+source.slice(0,start)+replacement+source.slice(end)+'\nconst phoneTilePacketCache=new WeakMap<object,Map<string,any>>();\n';
}
