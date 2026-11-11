// 在首决策前投影并核对完整原生初态；结算与决策始终由APK执行。
var Curriculum = (function () {
 function assert(ok,message) { if(!ok)throw new Error('initial_state_mismatch: '+message); }
 function arr(value) { var out=[];for(var i=0;i<value.length;i++)out.push(Number(value[i]));return out; }
 function digest(bytes){var d=java.security.MessageDigest.getInstance('SHA-256').digest(bytes),s='';for(var i=0;i<d.length;i++)s+=('0'+((d[i]&255).toString(16))).slice(-2);return s;}
 function before(config,map,job,directory){
  var N=HardNative,setup=job.setup;
  assert(setup&&[20,30,50].indexOf(Number(setup.unitLimit))>=0,'缺人口合同');
  assert(digest(com.badlogic.gdx.Gdx.files.internal('maps/'+job.map).readBytes())===job.mapAssetSha256,'地图字节身份');
  var active=arr(N.get(map,'d'));
  assert(JSON.stringify(active)===JSON.stringify(job.activeNativePlayerIds),'实际地图人数');
  for(var i=0;i<6;i++){N.get(config,'h')[i]=setup.initialGold;N.get(config,'k')[i]=setup.unitLimit;}
  N.set(N.get(config,'d'),'h',setup.levelCap);
  if(job.state){
   var us=job.state.units,raw=java.lang.reflect.Array.newInstance(java.lang.Integer.TYPE,us.length*5);
   for(var i=0;i<us.length;i++){var u=us[i];raw[i*5]=u.type;raw[i*5+1]=u.ownerId;raw[i*5+2]=u.level;raw[i*5+3]=u.pos.x;raw[i*5+4]=u.pos.y;}
   N.set(map,'f',raw);
  }
  N.text(directory,'requested-initial-state.json',{job:job,initializationSettlementCalls:1,projectionAfterInitialization:Boolean(job.state),replay:'disabled_by_user'});
 }
 function projection(q){
  var N=HardNative,b=N.get(q,'e'),p=N.get(q,'f'),pending=N.get(q,'g');
  var value={width:Number(N.get(b,'a')),height:Number(N.get(b,'b')),turn:Number(N.get(p,'f')),round:Number(N.get(p,'g')),currentPlayer:Number(N.get(p,'e')),winner:Number(N.get(p,'h')),playerArrays:{},units:[],buildings:[],graves:[],pending:{}};
  for(var i=0;i<'ijklmnopqst'.length;i++){var key='ijklmnopqst'.charAt(i);value.playerArrays[key]=arr(N.get(p,key));}
  value.pending.recruit=N.get(p,'d')!==null;
  for(var i=0;i<4;i++){var key='abcd'.charAt(i),v=N.get(pending,key);value.pending[key]=i<2?Number(v):(v===null?null:String(v));}
  for(var x=0;x<value.width;x++)for(var y=0;y<value.height;y++){
   var u=b['i(int,int)'](x,y),terrain=Number(b['d(int,int)'](x,y)),owner=Number(b['e(int,int)'](x,y));
   if(terrain===36||terrain===37)value.buildings.push({x:x,y:y,owner:owner,terrainId:terrain});
   var grave=Number(b['g(int,int)'](x,y));if(grave>=0)value.graves.push({pos:{x:x,y:y},ownerId:grave,remainingTurns:Number(b['h(int,int)'](x,y))});
   if(u!==null){var unit={pos:{x:x,y:y},raw:{}};for(var i=0;i<14;i++){var key=String.fromCharCode(97+i);if(key==='c')continue;var v=N.get(u,key);unit.raw[key]='ijk l'.replace(/ /g,'').indexOf(key)>=0?Boolean(v):(key==='m'?(v===null?null:String(v)):Number(v));}unit.population=Number(q['s(c.a.b.a.t.f)'](u));unit.maxHp=Number(q['y(c.a.b.a.t.f)'](u));value.units.push(unit);}
  }
  return value;
 }
 function after(q,job,directory){
  var N=HardNative,b=N.get(q,'e'),p=N.get(q,'f'),s=job.state,initial=projection(q);
  if(s){
   assert(N.get(p,'d')===null,'存在待招募单位');
   for(var i=0;i<s.buildings.length;i++){var v=s.buildings[i];assert(Number(b['d(int,int)'](v.x,v.y))===v.terrainId,'建筑原生地形');b['c(int,int,int)'](v.x,v.y,v.owner);}
   for(var i=0;i<s.units.length;i++){
    var u=s.units[i],nu=b['i(int,int)'](u.pos.x,u.pos.y);assert(nu!==null&&Number(N.get(nu,'a'))===u.type&&Number(N.get(nu,'b'))===u.ownerId,'单位身份');
    N.set(nu,'d',u.exp);N.set(nu,'n',u.level);N.set(nu,'e',u.hp);N.set(nu,'f',u.movementRemaining);N.set(nu,'g',u.status);N.set(nu,'h',u.head);N.set(nu,'i',u.hasActed);N.set(nu,'j',u.supported);N.set(nu,'k',u.registeredCommander);N.set(nu,'l',u.targeted);N.set(nu,'m',u.code);
    assert(u.hp>0&&u.hp<=Number(q['y(c.a.b.a.t.f)'](nu)),'生命上限');
    assert(Number(q['a(c.a.b.a.t.f,c.a.b.a.v.b)'](nu,q['j(int,int)'](u.pos.x,u.pos.y)))<=Number(q['z(c.a.b.a.t.f)'](nu)),'原生落点通行');
   }
   for(var i=0;i<s.graves.length;i++){var g=s.graves[i];b['a(int,int,int,int)'](g.pos.x,g.pos.y,g.ownerId,g.remainingTurns);}
   N.set(p,'f',s.turn);N.set(p,'e',s.currentPlayer);
   for(var i=0;i<s.players.length;i++){var player=s.players[i];N.get(p,'l')[player.id]=player.gold;}
   var refresh=q.getClass().getDeclaredMethod('h',java.lang.reflect.Array.newInstance(java.lang.Class,0));refresh.setAccessible(true);refresh.invoke(q,java.lang.reflect.Array.newInstance(java.lang.Object,0));
  }
  var actual=projection(q),counts=[],populations=[],commanders=[],active=[];
  for(var i=0;i<6;i++){counts[i]=0;populations[i]=0;commanders[i]=0;if(actual.playerArrays.i[i]!==0&&actual.playerArrays.i[i]!==5)active.push(i);}
  for(var i=0;i<actual.units.length;i++){var u=actual.units[i],owner=u.raw.b;counts[owner]++;populations[owner]+=u.population;if(u.raw.k)commanders[owner]++;}
  assert(JSON.stringify(active)===JSON.stringify(job.activeNativePlayerIds),'首决策活跃阵营');assert(actual.winner<0,'初态已终局');
  for(var i=0;i<active.length;i++){var id=active[i];assert(counts[id]>0&&commanders[id]===1,'队长或兵力缺失');assert(actual.playerArrays.j[id]===id+1,'联盟');assert(actual.playerArrays.m[id]===job.setup.unitLimit&&populations[id]<=job.setup.unitLimit,'人口');}
  assert(actual.pending.recruit===false,'首决策存在待招募');
  if(s){
   assert(actual.currentPlayer===s.currentPlayer&&actual.turn===s.turn,'行动方或回合');assert(actual.units.length===s.units.length,'单位总数');
   for(var i=0;i<s.players.length;i++)assert(actual.playerArrays.l[s.players[i].id]===s.players[i].gold,'金币重复结算');
   for(var i=0;i<s.units.length;i++){
    var u=s.units[i],found=null;for(var j=0;j<actual.units.length;j++)if(actual.units[j].pos.x===u.pos.x&&actual.units[j].pos.y===u.pos.y)found=actual.units[j];
    var expected={a:u.type,b:u.ownerId,d:u.exp,e:u.hp,f:u.movementRemaining,g:u.status,h:u.head,i:u.hasActed,j:u.supported,k:u.registeredCommander,l:u.targeted,m:u.code,n:u.level};
    assert(found!==null&&JSON.stringify(found.raw)===JSON.stringify(expected),'完整单位字段回读');
   }
   assert(actual.graves.length===s.graves.length,'墓地数量');for(var i=0;i<s.graves.length;i++){var g=s.graves[i];assert(Number(b['g(int,int)'](g.pos.x,g.pos.y))===g.ownerId&&Number(b['h(int,int)'](g.pos.x,g.pos.y))===g.remainingTurns,'墓地字段');}
  }
  N.text(directory,'initial-state-receipt.json',{schema:'hard-curriculum-initial-receipt-v1',parentId:job.parentId,executionSequence:job.executionSequence,designSlotId:job.designSlotId,requestedInitialStateSha256:job.initialStateSha256,actual:actual,nativeBeforeProjection:initial,counts:counts,populations:populations,commanders:commanders,verified:true,initializationSettlementCalls:1,postProjectionSettlementCalls:0,replay:'disabled_by_user'});
  return actual;
 }
 return {before:before,after:after,projection:projection};
})();
