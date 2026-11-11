import sqlite3
from epoch_data import EpochData
class Fixture:
    def __init__(self):
        self.db=sqlite3.connect(':memory:');self.records={}
        self.db.execute('CREATE TABLE chunks(id,players,samples,teachers)')
        self.db.execute('CREATE TABLE jobs(id,samples)')
        self.jobs=[]
        key=0
        for n in range(2,7):
            for parent in range(6):
                name=f'{n}-{parent}';self.jobs.append(dict(gameId=name,players=n,cut=None))
                self.db.execute('INSERT INTO jobs VALUES(?,?)',(name,13))
                for count in (12,1):
                    key+=1;self.db.execute('INSERT INTO chunks VALUES(?,?,?,?)',(key,n,count,count))
                    self.records[key]=[dict(source=dict(parentId=name,split='train'),id=(key,i)) for i in range(count)]
    def rows(self,key):return self.records[key]
d=Fixture();sampler=EpochData(d,d.jobs)
assert len(sampler.holdout_parents)==20
assert sampler.count==130
for epoch in range(3):
    rows=list(sampler.epoch(epoch));assert len(rows)==130
    assert len(set(r['id'] for r in rows))==130
    assert not any(r['source']['parentId'] in sampler.holdout_parents for r in rows)
    assert list(sampler.epoch(epoch,17))==rows[17:]
assert all(r['source']['parentId'] in sampler.holdout_parents for r in sampler.validation_panel())
print('父局隔离、3遍无放回覆盖及断点顺序通过')
