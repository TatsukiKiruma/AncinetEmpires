// 只读取已知状态字段的类型，不操作界面或运行中的引擎。
Java.perform(()=>{try{
 const engine=Java.use('c.a.b.a.a').class;
 const state=engine.getDeclaredField('e').getType();
 const players=state.getDeclaredField('f').getType();
 send({kind:'state-types',state:String(state.getName()),players:String(players.getName()),fields:players.getDeclaredFields().map(f=>({name:String(f.getName()),type:String(f.getType().getName())}))});send({kind:'done'});
}catch(e){send({kind:'error',error:String(e)});}});
