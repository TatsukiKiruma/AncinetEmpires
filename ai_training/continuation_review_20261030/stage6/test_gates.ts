import {strict as assert} from 'node:assert';
import {strength, healthy} from './gates';

// 人数分层门槛独立于总胜数，不能用双人局超额胜场掩盖四人退步。
function games(wins: number[]) {
    return [20,18,16].flatMap((n,k)=>Array.from({length:n},(_,i)=>({id:`${k}-${i}`,players:k+2,natural:true,firstPlace:Number(i<wins[k]),classification:i<wins[k]?'natural_win':'natural_loss',normalizedRank:i<wins[k]?1:.2})));
}
assert.equal(strength(games([16,11,9])),true);
assert.equal(strength(games([19,11,8])),false);
assert.equal(strength(games([15,11,9])),false);
const telemetry={completeCoverage:true,timeForfeits:0,waitOverCaptureCount:0,allSavedWitnessesLegal:true,invalidTeacher:0};
assert.equal(healthy({games:games([16,11,9]),telemetry},54),true);
assert.equal(healthy({games:games([16,11,9]),telemetry:{...telemetry,waitOverCaptureCount:1}},54),false);
console.log('开发门控边界测试通过');
