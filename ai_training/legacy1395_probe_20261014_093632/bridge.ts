import {AncientEmpiresEnv as HistoricalObservationEnv} from './env';
import {makeEnv,clone,sha} from '../legacy2500_recovery_20261014_090431/recovery_core';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function verifyCodec(){const out=path.dirname(fileURLToPath(import.meta.url)),identity=JSON.parse(fs.readFileSync(path.join(out,'codec_identity.json'),'utf8'));for(const entry of identity.entries)if(sha(fs.readFileSync(path.join(out,entry.name+'.ts')))!==entry.localSha256)throw Error('冻结历史观测源码已变化');}
/** 只为旧记录提供精确的历史观测序列化；合法动作、mask、执行及结果来自R7冻结环境。 */
export function bridge(e:any){const env=makeEnv(e,true),reset=env.reset.bind(env);env.reset=((seed?:number)=>{const r=reset(seed),before=sha(r.state),view=new HistoricalObservationEnv({initialState:clone(r.state),seed:e.seed,maxPlies:e.maxPlies});const observation=view.getObservation();if(sha(r.state)!==before)throw Error('历史观测编码修改了状态');return {...r,observation};}) as any;return env;}
