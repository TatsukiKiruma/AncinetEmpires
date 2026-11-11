import {describe,it,expect} from 'vitest';
import {deploymentSearchOptions} from '../../../src/ai_runtime/dual_v3/deployment_config';
import {evaluationJobs,screeningJobs,screenComparison} from './evaluate';
describe('部署评测与筛查',()=>{
 it('共享应用750ms/400节点配置且不保留动作队列',()=>{
  const c=deploymentSearchOptions('测试模型');expect(c.budgetMs).toBe(750);expect(c.maxNodes).toBe(400);expect(c.disableActionQueue).toBe(true);expect(c.responseUnits).toBe(24);
 });
 it('60局每人数12局，每金币档3局，无重复且属于原完整面板',()=>{
  const all=evaluationJobs().jobs,subset=screeningJobs(all);expect(subset).toHaveLength(60);expect(new Set(subset.map(j=>j.match.id)).size).toBe(60);
  for(const n of [2,3,4,5,6])for(const gold of [null,300,500,1000])expect(subset.filter(j=>j.players===n&&j.gold===gold)).toHaveLength(3);
  expect(subset.every(j=>all.some(a=>a.match.id===j.match.id))).toBe(true);
 });
 it('无优势跳过全量，但非自然和错误不能伪装为失败模型',()=>{
  const base={healthy:true,results:[{id:'a',won:true},{id:'b',won:false}]};
  expect(screenComparison(base,base).continueFull).toBe(false);
  expect(screenComparison(base,{healthy:true,results:[{id:'a',won:true},{id:'b',won:true}]}).continueFull).toBe(true);
  expect(screenComparison(base,{...base,healthy:false})).toMatchObject({continueFull:false,inconclusive:true});
 });
});
