"""记录用户已选择保持硬门禁继续同代优化，保留先前失败报告原件。"""
from run_league import DIR, ROOT, read, save

report = DIR / 'REPORT.md'
body = report.read_text('utf-8')
body = body.replace('# 阶段5.2第3代：训练及三端核验完成，开发前检未通过', '# 阶段5.2第3代：保持原门禁，继续同代联合优化', 1)
body = body.replace('下一步需要明确选择：保持原门禁继续同代优化，或允许当前模型先进行112槽诊断且保留门禁失败、不晋升。当前没有放宽任何门禁，也没有把未运行实战记作完成。', '用户已明确选择保持原门禁继续同代优化。第二次尝试106份文件完整保存在training-attempt02-wait-linear/，本报告的数值属于该已归档模型。第三次同代联合训练进行中，固定合同见generations/gen_03/joint-repair-protocol.json；新模型必须重新通过完整开发前检和三端核验后才能进入112槽。没有放宽门禁，没有启动第4代。')
report.write_text(body, encoding='utf-8')
summary = read(DIR / 'gate-summary.json')
summary.update(status='same_generation_joint_repair', complete=False, userDecision='保持原门禁，继续同代优化', reportedModelArchive='generations/gen_03/training-attempt02-wait-linear')
summary.pop('pendingDecision', None); save(DIR / 'gate-summary.json', summary)
for p in [DIR / 'LEAGUE_RESUME_GUIDE.md', ROOT / 'ai_training/status/CURRENT.md']:
    body = p.read_text('utf-8')
    if '用户已选择保持原门禁' not in body:
        body += '\n用户已选择保持原门禁继续第3代同代优化。第二次失败模型与收据保全于training-attempt02-wait-linear，正在执行joint-repair-protocol.json；原报告指标仍指第二次模型，112槽由前检守门，第4代禁止启动。\n'
    p.write_text(body, encoding='utf-8')
print('已记录继续同代优化的选择，旧报告原件已保全')
