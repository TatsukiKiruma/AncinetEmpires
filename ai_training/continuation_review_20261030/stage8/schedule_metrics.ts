import fs from 'node:fs';
import path from 'node:path';
import type {ScheduledJob} from './dispatch_queue';
import {save} from './io';

/** 本次执行窗口的轻量账本，不把历史动作/教师计入新的吞吐分子。 */
export class ScheduleMetrics {
    readonly started=Date.now();
    private last=this.started;
    private active=0;
    private errors=0;
    private busyMs=0;
    private rows=new Map<string,any>();
    constructor(private dir:string,readonly runId:string) {fs.mkdirSync(dir,{recursive:true});}
    event(kind:string,item:ScheduledJob|undefined,details:any={}) {
        if(kind==='error')this.errors++;
        const now=Date.now();this.busyMs+=(now-this.last)*this.active;this.last=now;
        if(details.active!==undefined)this.active=details.active;
        const event={kind,at:new Date(now).toISOString(),runId:this.runId,gameId:item?.job.gameId,block:item?.block,
            players:item?.job.players,transportJobId:item?.transportJobId,...details};
        fs.appendFileSync(path.join(this.dir,`${this.runId}.jsonl`),JSON.stringify(event)+'\n');
        if(item){
            const row=this.rows.get(item.job.gameId)??{players:item.job.players,beforeSteps:details.beforeSteps??0,beforeTeachers:details.beforeTeachers??0};
            if(kind==='start')Object.assign(row,{beforeSteps:details.beforeSteps??0,beforeTeachers:details.beforeTeachers??0});
            if(details.step!==undefined)row.steps=details.step;
            if(details.validTeachers!==undefined)row.teachers=details.validTeachers;
            if(details.quality)row.quality=details.quality;
            if(kind==='result')row.finished=true;
            this.rows.set(item.job.gameId,row);
        }
        const hours=Math.max(1,now-this.started)/3600000;
        const stats=(rows:any[])=>{
            const steps=rows.reduce((n,r)=>n+Math.max(0,(r.steps??r.beforeSteps)-r.beforeSteps),0);
            const teachers=rows.reduce((n,r)=>n+Math.max(0,(r.teachers??r.beforeTeachers)-r.beforeTeachers),0);
            const completed=rows.filter(r=>r.finished).length;
            const quality=rows.reduce((s,r)=>{for(const k of Object.keys(s))s[k]+=r.quality?.[k]??0;return s;},{searches:0,candidateSearches:0,overBudget:0,budgetExpirations:0,incomplete:0,valid:0});
            return {completed,gamesPerHour:completed/hours,steps,actionsPerHour:steps/hours,teachers,teachersPerHour:teachers/hours,quality,
                validTeacherFraction:quality.candidateSearches?quality.valid/quality.candidateSearches:null};
        };
        const all=[...this.rows.values()];
        save(path.join(this.dir,`${this.runId}.metrics.json`),{runId:this.runId,at:event.at,hours,active:this.active,errors:this.errors,
            utilization:this.busyMs/Math.max(1,(now-this.started)*8),overall:stats(all),byPlayers:Object.fromEntries([2,3,4,5,6].map(n=>[n,stats(all.filter(r=>r.players===n))])),
            note:'同一墙钟窗口，动作计数含在途增量；历史断点不计入分子。短期结果不能外推全课程。旧版本未记录的超时和残缺率不回填。'});
    }
}
