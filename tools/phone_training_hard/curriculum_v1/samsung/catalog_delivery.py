"""生成1000局中文总账和待补清单，不启动补采。"""
from pathlib import Path
from collections import defaultdict
import csv
import json
import sys

def main():
    audit=Path(sys.argv[1]).resolve();out=audit.parent;task=out.parent
    dest=out/'delivery-20261029';dest.mkdir(exist_ok=False)
    jobs=json.loads((task/'JOBS.json').read_text(encoding='utf-8'))['jobs'][1000:2000]
    completed={r['executionSequence']:r for r in json.loads((audit/'VERIFIED_PARENTS.json').read_text(encoding='utf-8'))}
    gaps={r['sequence']:r for r in json.loads((audit/'GAPS_321.json').read_text(encoding='utf-8'))}
    groups=defaultdict(list)
    for r in completed.values():groups[r['trajectorySha256']].append(r['executionSequence'])
    categories={'normal':'正常开局','parameter_variant':'参数变体','advantage_endgame':'优势残局','preset_units':'多单位','high_tier':'高阶单位','skill':'技能','building_finish':'建筑收尾'}
    reasons={'failed':'执行报错','app_disappeared':'应用进程消失','no_state_90s':'启动90秒无状态','observation_cell_without_natural_end':'观察门禁未通过，未启动'}
    records=[];pending=[]
    for job in jobs:
        seq=job['executionSequence'];wid='w00' if seq%2 else 'w01';r=completed.get(seq);g=gaps.get(seq)
        starts=list((audit/wid/'STARTED_ATTEMPTS'/str(seq)).glob('*'))
        item={'执行局号':seq,'父局ID':job['parentId'],'设计槽ID':job['designSlotId'],'种子':job['seed'],'类别':categories[job['category']],'场景配置':job['profile'],'人数':job['actualPlayerCount'],'地图':job['map'],'人口上限':job['setup']['unitLimit'],'初态SHA256':job['initialStateSha256'],'采集状态':'已采集并核验' if r else ('未启动' if g['actualStarts']==0 else '尝试后未采集成功'),'是否缺少完整对局':'否' if r else '是','实际启动次数':len(starts),'失败原因':'' if r else reasons[g['terminalReason']],'失败链':'' if r else ' → '.join(reasons.get(a['reason'],a['reason']) for a in g['attempts']),'成功尝试ID':r['attemptId'] if r else '', '动作数':r['actions'] if r else '', '回合数':'','获胜联盟':'','有效用时秒':r['effectiveSeconds'] if r else '', '轨迹SHA256':r['trajectorySha256'] if r else '', '相同轨迹局号':','.join(map(str,groups[r['trajectorySha256']])) if r and len(groups[r['trajectorySha256']])>1 else '', '电脑原件目录':'','后续处理':'保留，不重复补采' if r else ('先排查该场景的观察失败，再决定新批次补采' if g['actualStarts']==0 else '先诊断失败；原3次预算已耗尽，另行授权新批次，不重置旧账本')}
        if r:
            base=audit/(wid+'-success')/r['attemptId'];result=json.loads((base/'result.json').read_text(encoding='utf-8'))
            item.update({'回合数':result['turn'],'获胜联盟':result['winnerAlliance'],'电脑原件目录':str(base)})
        else:
            item['电脑原件目录']=str(audit/(wid+'-attempts')) if g['actualStarts'] else str(audit/wid/'FINAL_SEQS'/str(seq))
            pending.append({'executionSequence':seq,'parentId':job['parentId'],'status':item['采集状态'],'reason':g['terminalReason'],'previousActualStarts':g['actualStarts'],'previousAttempts':g['attempts'],'originalJob':job,'collectionAuthorized':False,'oldBudgetMustNotBeReset':True})
        records.append(item)
    assert len(records)==1000 and len(pending)==321 and sum(r['实际启动次数'] for r in records)==1367
    for name,values in [('全部1000局.csv',records),('待补321局.csv',[r for r in records if r['是否缺少完整对局']=='是'])]:
        with (dest/name).open('w',encoding='utf-8-sig',newline='') as stream:
            writer=csv.DictWriter(stream,fieldnames=list(records[0]));writer.writeheader();writer.writerows(values)
    (dest/'全部1000局.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
    (dest/'待补321局完整输入.json').write_text(json.dumps({'collectionAuthorized':False,'replay':False,'jobs':pending},ensure_ascii=False,indent=2),encoding='utf-8')
    (dest/'README.md').write_text('# 三星采集交付与后续补采索引\n\n1000局：679已采集并核验，190未启动，131尝试3次后未成功。全部1000局.csv可用Excel打开，含局号、父局、种子、地图、人数、状态、回合、动作、胜者、轨迹和电脑原件位置。待补321局.csv只列缺口。待补321局完整输入.json保留每局完整冻结输入及旧失败链，当前无执行授权。\n\n补采应保持原父局、种子和初态身份，另建批次与预算并关联原证据，不覆盖旧记录、不再次采集679个成功父局。190局需先解决对应门禁，131局旧预算已用完。本次没有补采、训练或回放。\n\n完整核验报告：'+str(audit/'REPORT.md')+'\n\n手机清理证据将记录在本目录的cleanup/中；删除手机文件不影响电脑原件与完整输入。\n',encoding='utf-8')
    print(str(dest))

if __name__=='__main__':main()
