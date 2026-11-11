/** 浏览器与PC共用的动作组身份，不携带任何文件读取依赖。 */
export function groupKey(a:any):string{
    const actor=a.unitId??a.attackerId??a.healerId??a.summonerId??a.supporterId;
    return (actor!==undefined?`unit:${actor}`:a.castlePos?`castle:${a.castlePos.x},${a.castlePos.y}`:'global')+'|'+a.type;
}
