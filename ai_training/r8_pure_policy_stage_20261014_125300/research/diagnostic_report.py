"""从已复核的历史失败事件生成中文诊断，不推断不存在的胜利。"""
import pathlib,json,collections
S=pathlib.Path(__file__).resolve().parents[1]
def read(p):return json.loads((S/p).read_text(encoding='utf8'))
cases=read('evidence/r7_surrender_cases.json');timeline=read('evidence/r7_failure_timeline.json')
lines=['# R8 前置失败诊断','', 'R7 的20局失败轨迹已按冻结权威引擎重放；以下是历史诊断材料，不能用作 R8 的独立最终验收。','', '## 投降排序','', '|局|地图|座位|投降logit|次优logit|教师动作|','|---|---|---|---:|---:|---|']
for r in cases:
    lines.append(f"|{r['gameIndex']}|{r['mapName']}|{r['candidateSeat']}|{r['ranked'][0]['logit']:.3f}|{r['ranked'][1]['logit']:.3f}|{r['teacher']}|")
lines+=['','八例均有合法非投降动作。绝对logit压低不能保证相对排序；轮1使用相对margin及端回合重采样，且每个导出候选都须再做行为回归。','', '## 失败前的资源与兵力','', '|局|最后记录步|双方金币|双方单位数|双方总HP|双方建筑数|','|---|---:|---|---|---|---|']
by=collections.defaultdict(list)
for r in timeline:by[r['game']].append(r)
for g,rs in by.items():
    r=rs[-1];lines.append(f"|{g}|{r['step']}|{r['gold']}|{r['units']}|{r['hp']}|{r['buildings']}|")
lines+=['','完整400步末端事件保存在 `evidence/r7_failure_timeline.json`，可区分资源和兵力劣势出现的时点。表中双方按引擎玩家索引排列，不将金币多直接解释为经济占优；有钱未招募也可能是行动选择失败。','', '## 局部反事实与限制','', '从第2、13局的投降状态出发，诊断策略屏蔽投降后各运行600步，两者均步数截断，没有自然胜利。这使用新对手随机流，不能声称严格历史反事实，也不能计入纯模型成绩。它仅说明“去掉投降就能取胜”没有在这两例得到支持。','', '## 当前优先级','', '1. 先修复可测的投降相对排序和回合交接，用暖启动与同结构从零等预算检验。','2. 再用学生访问分布做DAgger，关注招募、占领及兵力交换，保留基础课程和固定验证集。','3. 相同输入的抽查发现经验值、治疗标记或单位身份差异；当前保守隔离。只有能证明其主导失败才优先改表示，不能凭碰撞数量直接推出应增加搜索。','', '以上是工作假设；后续轮次必须用实际DEV和行为切片结果决定分支。']
(S/'reports/前置失败诊断.md').write_text('\n'.join(lines)+'\n',encoding='utf8')
