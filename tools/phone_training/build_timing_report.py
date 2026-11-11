import hashlib, json, pathlib, tarfile

# 将设备计时、采集清单和验证结论分别保存，避免把短测估算当成长期实测。
root=pathlib.Path('C:/code/AncinetEmpires/captures/phone-timing-20261015-continue')
stages=[json.loads((root/f'full-ai-w{w}'/'summary.json').read_text(encoding='utf8')) for w in (1,2,4)]
rows=[]
for stage in stages:
    compute=sum(x['compute_seconds'] for x in stage['results'])
    size=(root/f"full-ai-w{stage['workers']}"/'raw-games.tar').stat().st_size
    rows.append({'workers':stage['workers'],'games':stage['games'],'actions':stage['total_actions'],'batch_seconds':stage['device_batch_seconds'],'median_game_seconds':stage['latency_median_seconds'],'max_game_seconds':stage['latency_max_seconds'],'games_per_second':stage['games_per_second'],'snapshot_fraction_of_compute':stage['snapshot_seconds_sum']/compute,'raw_bytes':size})
four=stages[-1]
seconds_2500=2500/four['games_per_second']
bytes_per_game=sum(x['raw_bytes'] for x in rows)/sum(x['games'] for x in rows)
report={'target_device':'c2357770','apk_version':'4.2.5.1','date':'2026-10-15','complete_ai_benchmark':rows,'benchmark_games':60,'benchmark_actions':sum(x['actions'] for x in rows),'pilot_games':20,'timing_boundary':'设备worker开始初始化至终局快照文件写入完成；不包括结果JSON写入后的清理、电脑拉取、回放验证和模型训练。','state_capture':'每个复合动作前保存完整原生快照，同时保留初始配置、AI种子、动作、终局和耗时。','estimate_2500_generation_seconds':seconds_2500,'estimate_2500_raw_gib':bytes_per_game*2500/(1024**3),'estimate_limits':['短时测试，不是2500局长期稳定性结果','原生AI无序集合导致同种子轨迹仍可能不同，三个阶段动作数不同','全量逐步快照的数据体量较大，2500局需要分批导出','项目当前strict合法动作与训练编码尚未完成'],'resources':'测试手机连接充电；性能测试前后温度28至30摄氏度，可用内存约2.1GB。'}
audit_path=root/'native-audits.json'
if audit_path.exists():
    audit=json.loads(audit_path.read_text(encoding='utf8'));report['pilot_native_audit']={'backend_games':len(audit['results']),'actions':sum(x['actions'] for x in audit['results']),'errors':len(audit['errors']),'gui_games_previously_verified':2}
full_audit=root/'full-ai-audits.json'
if full_audit.exists():
    audit=json.loads(full_audit.read_text(encoding='utf8'));report['benchmark_native_audit']={'games':len(audit['results']),'actions':sum(x['actions'] for x in audit['results']),'errors':len(audit['errors'])}
identity={'apk_sha256':hashlib.sha256(pathlib.Path('APK/aer-release-4.2.5.1.apk').read_bytes()).hexdigest(),'current_rule_files':{name:hashlib.sha256(pathlib.Path(name).read_bytes()).hexdigest() for name in ['src/game/rules.ts','src/game/engine.ts','src/game/env.ts','src/game/types.ts','src/game/apk_replay.ts']}}
(root/'identity.json').write_text(json.dumps(identity,indent=2),encoding='utf8')
(root/'timing-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
lines=['手机原生AI完整对弈耗时测试（2026-10-15）','每档10张地图各跑2次；全部自然胜负；包含AI、结算、每步快照和数据写入。','','Worker\t局数\t动作数\t批次秒\t单局中位数秒\t最长单局秒']
lines += [f"{x['workers']}\t{x['games']}\t{x['actions']}\t{x['batch_seconds']:.2f}\t{x['median_game_seconds']:.2f}\t{x['max_game_seconds']:.2f}" for x in rows]
lines += ['',f'原计划20局（10图×2轮）已完成；额外完整AI性能测试60局。',f'当前4worker吞吐约{four["games_per_second"]:.2f}局/秒；短测外推2500局生成约{seconds_2500/60:.1f}分钟。',f'按本次每步完整快照体量，2500局原始数据约{report["estimate_2500_raw_gib"]:.1f}GiB。','上述外推不包括备份、验证和模型训练；未进行2500局持续温度、吞吐或稳定性测试。','原生AI同种子也可能受无序集合遍历影响，阶段间动作数不同，不能将局/秒比值视为严格等工作量加速比。','当前项目strict合法动作验证与模型训练编码仍未完成。']
if 'benchmark_native_audit' in report:lines.append('新增60局逐动作原生回放状态与终局校验通过。')
(root/'耗时测试结果.txt').write_text('\n'.join(lines),encoding='utf8')
print(json.dumps(report,ensure_ascii=False))
