"""从实测CSV绘制曲线，不插值或伪造未完成更新。"""
import csv
import sys
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
p=Path(sys.argv[1])
rows=list(csv.DictReader(p.open(encoding='utf-8')))
fig,axes=plt.subplots(2,2,figsize=(10,6))
for ax,key in zip(axes.flat,('policy_loss','value_loss','teacher_kl','kl_to_k1')):
    ax.plot([int(r['update']) for r in rows],[float(r[key]) for r in rows],marker='.')
    ax.set_title(key);ax.set_xlabel('update');ax.grid(alpha=.3)
fig.tight_layout();fig.savefig(p.with_suffix('.svg'));plt.close(fig)
