import fs from 'node:fs';
import path from 'node:path';

/** 只连接会话记录中的本任务页面；不返回或读取其他页面的内容。 */
export async function connectSession(file){
    const sessionFile=path.resolve(file),session=JSON.parse(fs.readFileSync(sessionFile,'utf8'));
    const pages=await(await fetch('http://127.0.0.1:19224/json/list')).json(),page=pages.find(page=>page.url===session.url);
    if(!page)throw Error('未找到本任务手机页');
    const socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
    let sequence=0;const pending=new Map();
    socket.onmessage=event=>{const message=JSON.parse(event.data);if(pending.has(message.id)){pending.get(message.id)(message);pending.delete(message.id);}};
    const call=(method,params={})=>new Promise(resolve=>{const id=++sequence;pending.set(id,resolve);socket.send(JSON.stringify({id,method,params}));});
    const evaluate=async expression=>{
        const response=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
        if(response.error||response.result?.exceptionDetails)throw Error(JSON.stringify(response));
        return response.result.result.value;
    };
    return {call,evaluate,close:()=>socket.close(),session,folder:path.dirname(sessionFile)};
}
