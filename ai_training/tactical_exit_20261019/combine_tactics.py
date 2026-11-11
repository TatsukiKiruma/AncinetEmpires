"""合并相同权威候选的模拟，保留151列的原值和语义。"""
from pathlib import Path
HERE=Path(__file__).resolve().parent
text=(HERE.parent/'tactical_scale_20261018/tactics.ts').read_text(encoding='utf-8')
text=text.replace("from './path_cache'","from '../tactical_scale_20261018/path_cache'").replace("from './threat'","from '../tactical_scale_20261018/threat'")
text=text.replace("export const FEATURE_NAMES", "import { beginFocusScope,focusThreat } from './focus_threat';\nimport { calculateDamage } from '../../src/game/rules';\nexport const FEATURE_NAMES")
text=text.replace("beginThreatScope();","beginThreatScope();beginFocusScope();")
text=text.replace("const old: number[][] = [], extra: number[][] = [];", "const old: number[][] = [], extra: number[][] = [],focus:number[][]=[];\n    const global=engine.getLegalActions(player,{skipMovement:true}),canRecruit=global.some(a=>a.type.startsWith('recruit_'));\n    const freeAttack=global.some(a=>{if(a.type!=='attack'||calculateDamage(before,a.attackerId,a.targetId)<=0)return false;const b=engine.clone(),u=before.units.find(u=>u.id===a.attackerId)!;b.step(a);return (b.getState().units.find(v=>v.id===u.id)?.hp??0)>=u.hp;});")
text=text.replace("const actorRisk = id ? risks.get(id) : undefined;", "const actorRisk = id ? risks.get(id) : undefined;\n        const focusActor=reply.known&&id&&replyState.units.some(u=>u.id===id)?focusThreat(reply.branch,id):null;\n        const focusCommanders=reply.known?ownCommanders.filter(id=>replyState.units.some(u=>u.id===id)).map(id=>id===actor?.id&&focusActor?focusActor:focusThreat(reply.branch,id)):[];\n        focus.push([focusActor?.damage??0,focusActor?.lethal??0,focusActor?.relaxed??0,focusActor?.attackers??0,Math.max(0,...focusCommanders.map(r=>r.damage)),Math.max(0,...focusCommanders.map(r=>r.lethal)),Math.max(0,...focusCommanders.map(r=>r.relaxed)),Number(reply.known),Number(canRecruit),Number(freeAttack)].map((v,i)=>Math.fround([0,2,4,6].includes(i)?v/128:i===3?v/3:v)));")
text=text.replace("return { old, extra, stats };","return { old, extra, focus,stats };")
target=HERE/'combined_tactics.ts'
assert not target.exists()
target.write_text(text,encoding='utf-8')
