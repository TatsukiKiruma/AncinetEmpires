"""完整基准结束后复核有效教师数量；至少两个已估值且未否决动作才计有效策略标签。"""
import json
from pathlib import Path
import sqlite3
import sys

HERE = Path(__file__).resolve().parent
label = sys.argv[1]
assert all(c.isalnum() or c in '-_' for c in label)
report_file = HERE / f'B_{label}.json'
report = json.loads(report_file.read_text(encoding='utf-8'))
assert report['complete'], '未完成的固定局数组不作最终样本吞吐复核'
rows = []
for game in report['games']:
    file = Path(game['database'])
    db = sqlite3.connect(file.as_uri() + '?mode=ro', uri=True)
    try:
        valid = db.execute("""SELECT count(*) FROM steps s
            WHERE json_extract(s.value,'$.teacher.available')=1
            AND (SELECT count(*) FROM json_each(s.value,'$.teacher.evaluatedMask') e
                 WHERE e.value=1 AND json_extract(s.value,'$.teacher.vetoMask[' || e.key || ']')=0)>=2""").fetchone()[0]
        available = db.execute("SELECT count(*) FROM steps WHERE json_extract(value,'$.teacher.available')=1").fetchone()[0]
        rows.append({'index': game['index'], 'players': game['players'], 'available': available, 'validTeachers': valid})
    finally:
        db.close()
hours = report['metrics']['elapsedMs'] / 3600000
out = {'rows': rows, 'validTeachers': sum(r['validTeachers'] for r in rows),
    'teacherSamplesPerHour': sum(r['validTeachers'] for r in rows) / hours,
    'byPlayers': {n: sum(r['validTeachers'] for r in rows if r['players'] == n) / hours for n in (2, 3, 4)},
    'criterion': 'teacher.available且至少2个evaluatedMask为true、vetoMask为false的动作；与speed_bench及Stage6口径一致',
    'note': '原运行计数teachers统计available（含单候选）；有效教师吞吐以本复核文件为准', 'sealedAccess': 0}
(HERE / f'B_{label}_VALID_TEACHERS.json').write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(out, ensure_ascii=False))
