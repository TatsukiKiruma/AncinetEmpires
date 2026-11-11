import math, struct, hashlib
import numpy as np


def augment(base,s):
    keys=s['token']['keys']
    entities=[]
    for i,row in enumerate(base['tokens']):
        fields={keys[k]:v for k,v in row}
        value=lambda k: fields.get(k,0)
        unit=base['groups'][i] in [2,3]
        terrain=round(value('terrainId:number')*128)
        if value('apkTerrainId:present'):
            terrain=s['terrainMap'].get(str(round(value('apkTerrainId:number')*128)),terrain)
        entities.append(dict(index=i,x=round(value('pos.x:number' if unit else 'x:number')*32),y=round(value('pos.y:number' if unit else 'y:number')*32),owner=None if value('ownerId:null') else round(value('ownerId:number')*128),hp=value('hp:number')*128,maxHp=value('maxHp:number')*128,level=value('level:number')*128,castle=terrain in s['castleTerrain'],town=terrain in s['townTerrain'],move=value('apkMoveCost:number')*128))
    units=[e for i,e in enumerate(entities) if base['groups'][i]==2]
    tiles=[e for i,e in enumerate(entities) if base['groups'][i]==1]
    own=[e for e in units if e['owner']==0]; other=[e for e in units if e['owner']!=0]
    nc=[e for e in tiles if e['castle'] and e['owner']!=0]; nt=[e for e in tiles if e['town'] and e['owner']!=0]; oc=[e for e in tiles if e['castle'] and e['owner']==0]
    distance=lambda a,b: abs(a['x']-b['x'])+abs(a['y']-b['y'])
    def nearest(p,items): return min(distance(p,q) for q in items)/64 if p is not None and items else 1
    def near(p,items,r): return [q for q in items if distance(p,q)<=r] if p is not None else []
    rows=[]
    for candidate,refs in zip(base['candidates'],base['refs'],strict=True):
        a,b,d=[entities[i] if i>=0 else None for i in refs]
        others=[e for e in own if a is None or e['index']!=a['index']]
        e2=near(d,other,2); a2=near(d,others,2)
        hp=lambda e: e['hp']/128 if e else 0
        frac=lambda e: e['hp']/e['maxHp'] if e and e['maxHp'] else 0
        level=lambda e: e['level']/8 if e else 0
        v=[int(a is not None),int(d is not None),int(b is not None),hp(a),frac(a),hp(b),frac(b),level(a),level(b),nearest(a,other),nearest(d,other),nearest(d,others),nearest(a,other)-nearest(d,other) if a and d else 0,len(e2)/32,len(a2)/32,len(near(d,other,4))/32,len(near(d,others,4))/32,sum(e['hp'] for e in e2)/4096,sum(e['hp'] for e in a2)/4096,nearest(a,nc),nearest(d,nc),nearest(a,nt),nearest(d,nt),nearest(d,oc),int(d is not None and d['owner']==0),int(d is not None and d['owner'] is not None and d['owner']!=0),int(d is not None and d['owner'] is None),int(d is not None and d['castle']),int(d is not None and d['town']),d['move']/16 if d else 0,int(b is not None and b['owner'] is not None and b['owner']!=0),distance(a,d)/64 if a and d else 0]
        assert len(v)==32 and all(math.isfinite(x) for x in v)
        rows.append(candidate+[[s['baseCandidateCount']+i,float(np.float32(x))] for i,x in enumerate(v)])
    rows=[row+[[s['baseCandidateCount']+32+j,float(np.float32(v))] for j,v in enumerate(base['tactics'][i])] for i,row in enumerate(rows)]
    return dict(base,candidates=rows)


def rel_sha(x):
    return hashlib.sha256(b''.join(struct.pack('>f',v) for row in x['candidates'] for _,v in row[-42:])).hexdigest()
