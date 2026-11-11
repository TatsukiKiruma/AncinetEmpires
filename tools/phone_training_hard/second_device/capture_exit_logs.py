"""只读保存最近一例本任务宿主退出日志，避免把计数当作根因结论。"""
import json
from pathlib import Path
import re
import sys
from device import shell


def main():
    out=Path(sys.argv[1]).resolve()/'diagnostics'
    source=(out/'process-events.txt').read_text(encoding='utf-8')
    values=re.findall(r'am_proc_died: \[0,(\d+),(net\.toyknight\.aeii\.worker1[123]),',source)
    if not values:
        print('近期事件缓冲区没有本任务宿主退出记录')
        return
    pid,package=values[-1]
    mainlog=shell('logcat -b main -d --pid='+pid+' -t 20000',check=False).replace('\r','')
    system=shell('logcat -b system -d -t 16000 | grep -E "'+pid+'|excessive cpu|Render process|renderer process"',check=False).replace('\r','')
    (out/('exited-'+pid+'-main.txt')).write_text(mainlog,encoding='utf-8',newline='\n')
    (out/('exited-'+pid+'-system.txt')).write_text(system,encoding='utf-8',newline='\n')
    record={'pid':int(pid),'package':package,'source':'am_proc_died事件','mainLogLines':len(mainlog.splitlines()),'systemLogLines':len(system.splitlines()),
            'limits':'只有退出事实与缓冲区日志，不自动推断系统杀进程、崩溃或原APK生命周期行为。'}
    (out/'RECENT_EXIT.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(record,ensure_ascii=False))
    print('\n'.join(mainlog.splitlines()[-20:]))
    print(system[-4500:])


if __name__=='__main__':
    main()
