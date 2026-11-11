"""从已落盘事实生成状态报告；未运行的阶段保留零计数，不写成通过。"""
import hashlib
import json
from pathlib import Path
EXECUTION_DIR=Path(__file__).resolve().parent
DIR=EXECUTION_DIR.parent
ROOT=DIR.parents[1]


def read(p,default=None):
    p=Path(p);return json.loads(p.read_text('utf-8-sig')) if p.exists() else default


def main():
    state=read(DIR/'PIPELINE_STATE.json',read(DIR/'RUN_STATE.json',{}));failure=read(DIR/'PIPELINE_FAILURE.json')
    model=read(DIR/'model-engineering.json',{});parity=read(DIR/'node-parity.json',{});concurrent=read(DIR/'concurrency-final.json',read(DIR/'concurrency.json',{}))
    sampled=max(state.get('formalParentsSampled',0),sum(bool(read(f,{}).get('passed')) and (f.parent/'result.json').exists() for f in (DIR/'generations').glob('gen_*/sampling/*/strict.json')))
    complete=state.get('overallComplete',False);experiment_complete=state.get('experimentComplete',complete); stage=state.get('stage',state.get('status','unknown'))
    lines=['# 约200万参数与4秒束搜索阶段记录','',f'整体完成：{complete}。当前阶段：`{stage}`。',
        f'已完成正式采样父局：{sampled} / 380；已完成代际：{state.get("generationsCompleted",len(state.get("generations",[])))} / 3；最终评测：{state.get("finalGames",0)} / 100。',
        '', '用户修订：第一代仍为100困难AI＋50自战＋50历史模型，共200局；第二、三代各50＋20＋20，共90局，三代合计380局。', '',f'新架构有效参数{model.get("parameters")}，权重{model.get("weightBytes")}字节；初始权重SHA `{model.get("modelSha256")}`。',
        f'跨语言核验{parity.get("samples",0)}个局面，最大误差：`{parity.get("errors")}`。工程前向Node时延毫秒：`{parity.get("nodeMs")}`。',
        '', '## 数据和结论边界','',
        '- 新困难APK原生数据仍为0/3000，签名冲突未解决；未操作手机、未替换安装包、未把项目移植轨迹称为原生数据。',
        '- 新真人只准入2077条Policy前缀，真人控制615条，无可靠自然终局Value。',
        '- 历史14份排重索引和父局/续段/API家族分区继承；未知真人开局谱系仍无法完整证明独立。',
        '- Policy与Value独立摘要抽样，普通原生Policy 1%、自然Value 8%、历史回放Policy 20%、新增前缀100%；无每局100/总2400上限。实际消费见stream-receipts。',
        '- Value覆盖自然终局的胜败双方与开中残局；漂移、截断及错误关闭Value。',
        '- 束搜索只在已比较根动作集合内构造目标，未探索动作不设负标签；不使用伪造访问次数。',
        '- 投降仍按继承的因子化Policy契约不输出；rootRuleLegal与rootPolicyExcluded单列，不能称为规则非法。其它策略禁用标记转为有限先验。',
        '- 扩容模型和更新数据的联合变化不单独归因于参数数目。105局面核验和短程loss不构成棋力验收。',
        '- 根规划最大配置4000ms，包含编码/推理/候选/反扑/整理；实际超时另记，墙钟停止不能保证硬实时。',
        '- 未展开己方行动会收口，有限回应并不等于完整最优反扑；complete仅按实际动作检查，不用静态覆盖冒充。',
        '- 旧v2运行时、旧模型和GUI入口均保留；没有部署。','', '## 并发工程遥测','']
    for r in concurrent.get('results',[]):lines.append(f'- {r["concurrency"]}进程：{r["nodesPerSecond"]:.2f}节点/秒，平均每根{r["meanNodesPerRoot"]:.2f}节点，超预算{r["overBudget"]}/8。')
    lines+=['','## 检查','', '- 公共lint通过；公共build首次独立输出遇EPERM，换新deliverables目录复测通过。',
        '- 公共初次测试506通过、1项既有实战断言失败、20跳过；中间重测508通过/20跳过；最后完整重测508通过、同一既有断言1失败、20跳过。独立六项新搜索/联盟标签合同通过，没有新增失败。',
        '- 训练工作区63失败/448通过，与前置记录相同；历史lint类型错误仍在。本轮独立tsc和Python目标梯度检查通过。',
        '- 初版跨语言核验发现坐标缩放被自动替换为1/96，已改回冻结输入合同1/64；修后105个局面全部误差0。',
        '- 早期old-new局面探针未加载旧Value校准，不作为正式匹配对照；冻结旧搜索和后续正式比较加载完整组合。',
        '- 初次保全脚本误读清理计划空字段，误报前置已授权删除的2176缓存；纠正后按实际执行账本核对，原失败回执保留。',
        '- 正式源文件身份变化、数据流错误、空间低于12GiB、strict失败或遗留未完成对局将停止流水线并保存失败，不伪造完成。','', '## 恢复入口','',
        '```powershell',
        "& 'C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe' -B -X utf8 ai_training/expert_iteration_2m_20261022/execution_v4/pipeline.py --run",'```',
        '', '该入口在已完成阶段后继续；未完成对局不会无声覆盖，必须保留旧尝试后由明确的新尝试处理。正式训练检查点含数据游标、缓冲样本、模型、优化器和随机状态。',
        '当前权威进程状态另见PROCESS.json与系统进程；保存的running不是活进程证明。']
    if failure:lines+=['','## 最近失败','',f'`{failure["error"]}`。详见PIPELINE_FAILURE.json。']
    if experiment_complete:
        lines+=['','## 代际开发结果','']
        for g in state['generations']:lines.append(f'- 第{g["generation"]}代：新增胜{g["newWins"]}、丢失胜{g["lostWins"]}，晋升={g["promoted"]}。')
        lines+=['',f'2M联赛冠军：`{state["champion"]}`。是否有联赛开发晋升：{state["qualityImprovedWithin2m"]}。最终结果见COMPARISONS.json；相对旧模型的推荐须结合对照，不承诺统治级。']
    (DIR/'REPORT.md').write_text('\n'.join(lines)+'\n','utf-8')
    marker=b'<!-- expert-iteration-2m-20261022 -->';end=b'<!-- end-expert-iteration-2m-20261022 -->'
    current=ROOT/'ai_training/status/CURRENT.md';raw=current.read_bytes()
    entry=(f'<!-- expert-iteration-2m-20261022 -->\n## 2026-10-22 约200万参数与4秒束搜索新阶段\n\n'
           f'当前阶段`{stage}`，整体完成={complete}；正式采样{sampled}/380、最终评测{state.get("finalGames",0)}/100。'
           '用户已改为第一代200局、第二和第三代各90局。新模型1966910参数，初始105局面PyTorch/TS误差0；正式训练模型误差见各模型parity回执。'
           '新困难原生0/3000未准入，未操作手机或GUI部署。'
           '本轮短程Policy/Value工程试验已完成；正式结果与实际活进程须读本轮状态，不能凭本条推断棋力提升。'
           '见[报告](../expert_iteration_2m_20261022/REPORT.md)、[流水线状态](../expert_iteration_2m_20261022/PIPELINE_STATE.json)。\n'
           '<!-- end-expert-iteration-2m-20261022 -->\n\n').encode('utf-8')
    if marker in raw:
        a=raw.index(marker);b=raw.index(end,a)+len(end)
        if raw[b:b+2]==b'\n\n':b+=2
        raw=raw[:a]+entry+raw[b:]
    else:
        at=raw.index(b'\n')+1;raw=raw[:at]+b'\n'+entry+raw[at:]
    current.write_bytes(raw)
    if experiment_complete:
        files=[p for p in DIR.rglob('*') if p.is_file() and p.name!='DELIVERY_MANIFEST.json']
        (DIR/'DELIVERY_MANIFEST.json').write_text(json.dumps(dict(experimentComplete=True,overallComplete=complete,files=[dict(path=str(p.relative_to(DIR)),bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in files]),ensure_ascii=False,indent=2),'utf-8')


if __name__=='__main__':main()
