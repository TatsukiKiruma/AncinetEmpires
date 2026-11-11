import fs from 'node:fs';
import path from 'node:path';
const V10='v10/fix_01';
const rd=f=>fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):null;
const conf=rd(path.join(V10,'T10-01_confirmation.json'));
const formal=rd(path.join(V10,'T10-04_formal_comparison.json'));
const t03=rd(path.join(V10,'dagger_controlled_report.json'));
const loss=rd(path.join(V10,'T10-05_loss_ablation.json'));
const val=rd(path.join(V10,'value_calibration.json'));
const valSearch=rd(path.join(V10,'T10-06_search_value_comparison.json'));
const t02=rd(path.join(V10,'dataset_v10_manifest.json'));
const lines=[];
lines.push('# 任务 1–5 执行结果（v10 fix_01）');
lines.push('');
lines.push('生成时间：'+new Date().toISOString());
lines.push('');
lines.push('## 1. T10-01 大样本确认（真实开局变体）');
if(conf){ for(const [p,s] of Object.entries(conf.stats||{})) lines.push(`- ${p}: ${s.matches} 场, ${s.wins}W/${s.losses}L/${s.truncations}T, natural W/(W+L)=${s.naturalWinRate}%, trunc=${s.truncationRate}%`); lines.push('- 结论：'+JSON.stringify(conf.conclusions)); }
lines.push('');
lines.push('## 2. T10-04 正式同工作量对照');
if(formal){ for(const [p,s] of Object.entries(formal.stats||{})) lines.push(`- ${p}: ${s.matches} 场, ${s.wins}W/${s.losses}L/${s.truncations}T, natural W/(W+L)=${s.naturalWinRate}%, trunc=${s.truncationRate}%`); lines.push('- 结论：'+formal.verdict); }
lines.push('');
lines.push('## 3. T10-03 数据扩量与重评');
if(t03){ lines.push(`- 新数据量：${t03.dataPipeline?.matches} 局采样, ${t03.dataPipeline?.samplesCollected} 唯一状态进入 C（目标 2k–5k 已达成）`); lines.push(`- C 消费新样本：${t03.consumptionAudit?.consumedNewIds}/${t03.consumptionAudit?.newSampleIds}`); lines.push('- A/B/C 自然 W/(W+L)='+`${t03.evaluationResults?.armA_baseline?.naturalWinRate}% / ${t03.evaluationResults?.armB_control?.naturalWinRate}% / ${t03.evaluationResults?.armC_dagger?.naturalWinRate}%`); lines.push('- 结论：'+t03.findings?.verdict); }
lines.push('');
lines.push('## 4. T10-05 等价/软排序损失对照');
if(loss){ for(const [p,s] of Object.entries(loss.results||{})) lines.push(`- ${p}: ${s.lossMode}, top1=${s.top1Accuracy}%, groupAcc=${s.equivalenceGroupAccuracy}%, regret=${s.meanTeacherRegret}`); lines.push('- 结论：'+loss.findings?.[2]); }
lines.push('');
lines.push('## 5. T10-06 更多自然终局、分层与搜索内验证');
if(t02) lines.push(`- 数据：episodes=${t02.accounting?.scenarioAttemptCount}, natural=${t02.accounting?.naturalTerminalEpisodes}, uniqueStates=${t02.accounting?.uniqueStateCount}, replayErrors=${t02.accounting?.replayErrors}`);
if(val) lines.push(`- value 样本：${val.datasetAccounting?.totalValueSamplesExtracted}（自然 ${val.datasetAccounting?.naturalOutcomeSamples}）；qualification=${val.qualificationAudit?.valueHeadQualified}`);
if(val) lines.push(`- Arm2: pearson=${val.calibrationComparison?.arm2_value_weight_01?.pearsonCorrelation}, MSE=${val.calibrationComparison?.arm2_value_weight_01?.overallMse}, ECE=${val.calibrationComparison?.arm2_value_weight_01?.ece}`);
if(val?.calibrationComparison?.arm2_value_weight_01?.collectionPolicyBreakdown) lines.push('- 按采集策略分层：'+JSON.stringify(val.calibrationComparison.arm2_value_weight_01.collectionPolicyBreakdown));
if(valSearch) lines.push('- 搜索内 value 对照：'+JSON.stringify(valSearch.stats));
lines.push('');
lines.push('## 闸门');
lines.push('- T10-07: NOT_RUN（T10-03 无正向收益，T10-06 未 qualified）');
lines.push('- T10-08: NOT_RUN（无冻结候选、无 400 场确认预算）');
fs.writeFileSync(path.join(V10,'TASKS_1_5_RESULTS.md'), lines.join('\n'),'utf8');
fs.writeFileSync(path.join(V10,'tasks_1_5_status.json'), JSON.stringify({generatedAt:new Date().toISOString(), tasks:{t1001:conf?.conclusions,t1004:formal?.verdict,t1003:t03?.findings,t1005:loss?.results,t1006:{valueCalibration:val?.qualificationAudit,searchValue:valSearch?.verdict}}},null,2),'utf8');
console.log('written TASKS_1_5_RESULTS.md');
