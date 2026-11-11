"""重算固定20分母的历史策略统一对照；不将截断去掉。"""
import json,pathlib,hashlib
S=pathlib.Path(__file__).resolve().parents[1];rows=[]
names={'old_p1':'旧P1','old_theta1':'旧θ1','r6_a':'R6 Arm A','r6_b':'R6 Arm B','r7':'R7候选','b100_q':'B100-Q','b100_r':'B100-R'}
lines=['# 统一历史 DEV20 对照','', '所有策略使用同一冻结runner、对手与DEV面板：7张独特地图，10组换边配对，3000步/300秒/原子步骤1000ms。B100是规则搜索代码，模型策略均完整合法集网络argmax。','', '|策略|自然胜|自然负|截断|错误/平局|自然胜率|','|---|---:|---:|---:|---:|---:|']
for key,label in names.items():
    p=S/f'runs/dev_{key}/summary.json';r=json.loads(p.read_text(encoding='utf8'));assert r['games']==20
    c=r['counts'];win=c.get('natural_win',0);loss=c.get('natural_loss',0);trunc=sum(v for k,v in c.items() if 'truncated' in k);other=20-win-loss-trunc
    row={'strategy':key,'wins':win,'losses':loss,'truncated':trunc,'other':other,'rate':win/20,'counts':c,'summarySha256':hashlib.sha256(p.read_bytes()).hexdigest()};rows.append(row)
    lines.append(f'|{label}|{win}|{loss}|{trunc}|{other}|{win/20:.0%}|')
lines+=['','B100的内部配置、随机状态和异常计数随每个step保存在逐局JSONL的diagnostics字段。1000ms监管覆盖整个原子步骤，包含策略、编码与裁判转移；不等同于搜索自身报告的耗时。对超时未调整预算重赛。','', '此表支持比较当前固定预算下的实战表现，不能证明B100标签在任意局面都是最优，也不能把搜索成绩当作纯模型成绩。旧模型未达目标不证明纯模型路线无效。']
(S/'reports/历史策略统一对照.md').write_text('\n'.join(lines)+'\n',encoding='utf8');(S/'evidence/baseline_summary.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8');print('七个策略140局全部完成')
