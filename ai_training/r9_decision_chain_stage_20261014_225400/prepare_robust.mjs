import fs from 'node:fs';import path from 'node:path';
const o=path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/,'$1');
let source=fs.readFileSync(path.join(o,'chain_probe.ts'),'utf8').split('for(let g=0;g<20;g++){')[0].replace('maxSteps:240,maxHandoffs:4,maxBranchMs:5000','maxSteps:500,maxHandoffs:8,maxBranchMs:10000');
source+=`
for(const g of [4,5,18,19]){
 const stem=S+'/runs/final_r8/game_'+g,r=JSON.parse(fs.readFileSync(stem+'.json','utf8'));assert(r.mapName.includes('Swamplands'));
 const events=fs.readFileSync(stem+'.jsonl','utf8').trim().split('\\n').map(JSON.parse);const e=new GameEngine(createState(r.mapName));
 let saved:any=null;
 for(const tr of events.filter((x:any)=>x.type==='step')){assert.equal(hash(e.getState()),tr.beforeHash);const s=e.getState(),legal=e.getLegalActions(s.currentPlayer);if(s.currentPlayer===r.candidateSeat){const a=policy({},91341+g*1000+tr.step,s.currentPlayer).act(structuredClone(s),structuredClone(legal));saved={game:g,seat:r.candidateSeat,state:structuredClone(s),legal,actual:tr.action,alternative:a,step:tr.step,rng:events.filter((x:any)=>x.type==='step'&&x.player!==r.candidateSeat&&x.step<tr.step).at(-1)?.rngAfter??{state:r.seeds[1-r.candidateSeat]>>>0,calls:0}};break;}strictStep(e,legal,tr.action);}
 for(let variant=0;variant<3;variant++){const rng=variant===0?saved.rng:{state:(saved.rng.state+variant*191177)>>>0,calls:0};const original=branch(saved.state,saved.seat,saved.actual,rng),alternative=branch(saved.state,saved.seat,saved.alternative,rng);const row={game:g,seat:saved.seat,variant,modelCode:encodeAction(saved.actual),alternativeCode:encodeAction(saved.alternative),sameFirstAction:encodeAction(saved.actual)===encodeAction(saved.alternative),original:{...original,trace:undefined,finalState:undefined},alternative:{...alternative,trace:undefined,finalState:undefined}};summary.push(row);cases.push({...saved,rng,variant,original,alternative});console.log(JSON.stringify(row));}
}
fs.writeFileSync(path.join(O,'cases.json.gz'),gzipSync(JSON.stringify(cases)),{flag:'wx'});fs.writeFileSync(path.join(O,'results.json'),JSON.stringify({diagnosticOnly:true,scope:'First candidate decision of all four consumed Swamplands slots; conditional RNG variants; eight handoffs',summary},null,2),{flag:'wx'});for(const x of protectedFiles)assert.equal(fileHash(x.path),x.sha256,x.path);fs.writeFileSync(path.join(O,'protection_after.json'),JSON.stringify({passed:true,files:protectedFiles.length}),{flag:'wx'});
`;
fs.writeFileSync(path.join(o,'robust_probe.ts'),source,{flag:'wx'});

