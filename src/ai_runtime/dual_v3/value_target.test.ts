import {it,expect} from 'vitest';
import {createDefaultAppGameState} from '../../game/default_state';
import type {PlayerOrder} from '../dual_v2/contract';
import {computeScalarValue} from '../dual_v2/value_model';
import {trainingValueTarget} from './value_target';
it('不等人数联盟平局在双方根视角均为零，淘汰槽不承载胜率',()=>{
    const state=createDefaultAppGameState();state.rules={...state.rules,alliances:{0:0,1:0,2:1,3:1,4:1,5:1}};
    const order:PlayerOrder={playerIds:[0,1,2,3,4,5],slotByPlayer:new Map([0,1,2,3,4,5].map((id,i)=>[id,i])),features:new Float32Array(66),active:Uint8Array.of(1,1,1,1,1,1)};
    const draw=trainingValueTarget(state,order,true,-1);expect(computeScalarValue(draw.target,state,order,0)).toBe(0);expect(computeScalarValue(draw.target,state,order,3)).toBe(0);
    order.active[5]=0;const win=trainingValueTarget(state,order,true,1);expect(win.target[5]).toBe(0);expect(computeScalarValue(win.target,state,order,0)).toBeCloseTo(-1);
    expect(trainingValueTarget(state,order,false,null).valueMask).toBe(false);
});
