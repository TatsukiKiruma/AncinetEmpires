"""保存中文阶段说明；原始手机进度、状态摘要和检查结果不改写。"""
import json
from device import HERE,write

safe=json.loads((HERE/'SAFE_TO_DISCONNECT.json').read_text(encoding='utf-8'))
safe['testType']='本任务启动ADB客户端会话结束后重新连接核验；没有物理拔USB或重启ADB，也未中断其他会话'
write(HERE/'SAFE_TO_DISCONNECT.json',safe)
report=json.loads((HERE/'EXECUTION_REPORT.json').read_text(encoding='utf-8'))
report['timingConclusion']='尚在早期运行，未给出热稳定或全量时长结论；完成后依据手机分项日志汇总。'
report['runtimeAdaptationNote']='首次chroot的PATH已修复；挂载sysfs后完整模型前反向通过。启动ADB会话60秒超时结束后，手机本地独立会话和进度继续已核实。'
report['stopPolicy']='100父局一遍完成后保存完整检查点并停止；错误不无限重启；只在第10次更新执行一次已授权的受控保存退出恢复。'
report['userNotice']='手机完整2M随机初始化模型已开始训练；可以拔掉电脑连接并接充电器，100局完成后自动保存停止。'
report['resultRetrieval']='离线期间结果保存在手机；重连后取回完整计时、学习曲线和最终检查点。'
write(HERE/'EXECUTION_REPORT.json',report)
print(json.dumps({'safeToDisconnect':safe['ready'],'progress':safe['progressAfter'],'automaticFullTraining':False,'hostOptimizerUpdates':0}))
