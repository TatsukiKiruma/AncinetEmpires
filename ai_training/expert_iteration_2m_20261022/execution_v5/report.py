"""按实际落盘数据报告小规模循环，不把开发历史20局称为最终盲测。"""
import json
from pathlib import Path
HERE=Path(__file__).resolve().parent
PARENT=HERE.parent
ROOT=PARENT.parents[1]


def read(path,default=None):return json.loads(Path(path).read_text('utf-8-sig')) if Path(path).exists() else default


def main():
    state=read(HERE/'RUN_STATE.json',{});stage=state.get('stage','prepared');seed=read(HERE/'seed-manifest-131.json',{});qualified=len(seed.get('games',[]));lines=[]
    lines+=['# 131局起步的小规模专家迭代','',f'当前阶段：`{stage}`；第一代从131局开始训练，不补跑旧200局配额。第二、三代各20局困难AI＋10局历史模型，停止新增自战，父局总上限191。','', '已有131局中的自战与截断证据保留；8局未完成现场不准入。训练使用困难AI示范、自然胜方示范及真实搜索比较；截断关闭终局Value。','', '历史验证由固定10个新派生开局换边组成20局，仅用于开发选择，不作为训练数据或最终盲测。已审计5309份已知原生/回放/新前缀初态配置；验证采用未出现的合法起始金币配置，训练流逐样本禁止这些配置。未知历史谱系仍无法绝对证明独立。','', '## 采样与训练进度','']
    for generation in [1,2,3]:
        folder=HERE/'generations'/f'gen_{generation:02}'/'sampling';results=list(folder.glob('*/result.json'));started=list(folder.glob('*/started.json'));passed=sum(bool(read(f,{}).get('passed')) for f in folder.glob('*/strict.json'));qualified+=passed
        training=PARENT/'training'/f'v5_gen_{generation:02}';progress=read(training/'progress.json',{});done=read(training/'complete.json',{})
        lines.append(f'- 第{generation}代：新增结果{len(results)}/{0 if generation==1 else 30}，strict通过{passed}，在途{len(started)-len(results)}；训练完成={done.get("complete",False)}，进度`{progress}`。')
    lines+=['',f'已准入父局合计：{qualified}/191（包含已有131局）。','', '## 验证与阶段晋升','', '- 固定历史面板配对自然胜净增加；困难AI面板自然胜不回退，不再要求困难AI必须先产生新增胜场。','- 无运行错误、独立strict通过，候选根搜索没有实测超过4000ms，才晋升。截断计非胜，不当平局，历史胜率分母固定20。','- 历史至少10/20自然胜才达到50%讨论扩采门槛；不得据采样10局判定，不自动加局、不追加第4代。']
    for record in state.get('generations',[]):lines.append(f'- 第{record["generation"]}代：晋升={record["promoted"]}，历史胜率={record["candidateHistorical"]["wins"]}/20，配对净增={record["historicalPair"]["netWins"]}，工程及棋力门禁={record["gates"]}，扩采讨论条件={record["expansionEligible"]}。')
    lines+=['','## 固定验证面板实际结果','']
    for summary in sorted((HERE/'validation-cache').glob('*/*/summary.json')):
        value=read(summary);lines.append(f'- {summary.parent.parent.name}/{summary.parent.name[:12]}：{value["games"]}局，{value["wins"]}胜{value["losses"]}负{value["draws"]}平，截断{value["truncated"]}，错误{value["errors"]}。')
    failure=read(HERE/'PIPELINE_FAILURE.json')
    if failure:lines+=['','## 失败记录','',failure['error']]
    lines+=['','## 边界和恢复','', '旧计划、模型、失败日志与暂停现场保留。新困难手机原生数据没有自动加入本轮。GUI和权威规则保持。实测4秒超限仍是工程风险，单独记录并参与晋升门禁。','', '新进程见根PROCESS.json，不能仅凭running字段判断存活。恢复入口为execution_v5/pipeline.py --run；必须有用户恢复授权，来源身份一致，存在未完成对局时禁止覆盖。','', '原冻结对照和最终100局在小规模三代之后独立执行，最终结果不参与选模型。']
    text='\n'.join(lines)+'\n';(HERE/'REPORT.md').write_text(text,'utf-8');(PARENT/'REPORT.md').write_text(text,'utf-8')
    current=ROOT/'ai_training/status/CURRENT.md';raw=current.read_text('utf-8');marker='<!-- expert-iteration-2m-20261022 -->';end='<!-- end-expert-iteration-2m-20261022 -->'
    entry=f'{marker}\n## 2026-10-23 131局起步的小规模专家迭代\n\n用户已明确恢复任务。当前阶段`{stage}`；已有131局合格数据进入第一代训练，8局未完成现场排除，不补跑旧采样配额。第二、三代各20困难AI＋10历史模型，不新增自战，合计父局上限191。固定独立于训练的历史开发验证20局换边，不训练、不冒充最终盲测；晋升按历史配对胜局净增、困难AI不回退及规则/无错误/4秒工程门禁，达到10/20自然胜仅具备讨论扩采条件，不自动扩大。已准入父局{qualified}/191。新困难手机原生未自动加入。见[报告](../expert_iteration_2m_20261022/execution_v5/REPORT.md)、[状态](../expert_iteration_2m_20261022/execution_v5/RUN_STATE.json)。\n{end}'
    a=raw.index(marker);b=raw.index(end,a)+len(end);current.write_text(raw[:a]+entry+raw[b:],'utf-8')


if __name__=='__main__':main()
