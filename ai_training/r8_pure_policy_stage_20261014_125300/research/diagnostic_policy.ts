// 专用于因果诊断：禁投降策略不属于纯模型候选，不参与任何DEV/FINAL计分。
import {policy as base} from './policy';
export function policy(cfg:any,seed:number,seat:number){const p=base(cfg,seed,seat);if(!cfg.diagnosticNoSurrender)return p;return {...p,act:(state:any,legal:any[])=>p.act(state,legal.filter(a=>a.type!=='surrender'))};}
