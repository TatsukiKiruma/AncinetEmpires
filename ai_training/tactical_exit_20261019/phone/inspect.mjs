import fs from 'node:fs';
import path from 'node:path';
const sessionFile=path.resolve(process.argv[2]),session=JSON.parse(fs.readFileSync(sessionFile,'utf8'));
const pages=await(await fetch('http://127.0.0.1:19224/json/list')).json();
const page=pages.find(page=>page.url===session.url);if(!page)throw Error('未找到本任务手机页');
const socket=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
const expression=`(async()=>{const config=await(await fetch('/config.json'+location.search)).json();const fixture=config.fixtures[2];return {id:fixture.id,actual:Stage5Phone.decisionFixture(fixture.state,config.models[fixture.arm],config.old,fixture.arm),expected:fixture.expected};})()`;
const result=await new Promise((resolve,reject)=>{socket.onmessage=event=>{const response=JSON.parse(event.data);if(response.id===1)resolve(response);};socket.onerror=reject;socket.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));});
socket.close();
const target=path.join(path.dirname(sessionFile),'DECISION_DIAGNOSTIC.json');fs.writeFileSync(target,JSON.stringify(result,null,2),{flag:'wx'});
const value=result.result?.result?.value;if(!value)throw Error(JSON.stringify(result));
const differences=[];
function compare(actual,expected,key=''){
    if(typeof actual==='number'&&typeof expected==='number'){if(Math.abs(actual-expected)>=1e-8)differences.push({key,actual,expected});return;}
    if(actual&&expected&&typeof actual==='object'&&typeof expected==='object'){
        for(const name of new Set([...Object.keys(actual),...Object.keys(expected)]))compare(actual[name],expected[name],key+'.'+name);
    }else if(actual!==expected)differences.push({key,actual,expected});
}
compare(value.actual,value.expected);console.log(JSON.stringify({diagnostic:target,differences:differences.slice(0,20),count:differences.length}));
