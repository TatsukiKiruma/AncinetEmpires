import fs from 'node:fs';

/** 直接运行旧TS入口也不能绕过用户的真机要求。 */
export function rejectPcGames(){
    const file=new URL('./ACTIVE_DEVICE_PROTOCOL.json',import.meta.url);
    if(fs.existsSync(file)&&JSON.parse(fs.readFileSync(file,'utf8')).allowPcBattleExecution===false)
        throw Error('用户已要求所有后续对局在小米真机执行，旧PC对局/专家入口已停用；请使用真机入口。');
}
