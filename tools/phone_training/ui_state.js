// 读取原生界面状态和文案，复用坐标时无需重新截图寻找按钮。
Java.perform(()=>{try{
 const U=n=>Java.use(n),app=Java.cast(U('com.badlogic.gdx.Gdx').app.value.getApplicationListener(),U('c.a.b.b.i'));
 const screen=app.getScreen(),view=Java.cast(screen,U('c.a.b.b.s.b'));
 const stackField=U('c.a.b.b.s.b').class.getDeclaredField('b');stackField.setAccessible(true);
 const stack=Java.cast(stackField.get(view),U('java.util.ArrayList'));
 const panel=stack.size()>0?stack.get(stack.size()-1):null;
 const labels=[];const Group=U('com.badlogic.gdx.scenes.scene2d.Group'),Label=U('com.badlogic.gdx.scenes.scene2d.ui.Label');
 function walk(actor,parentVisible){const visible=parentVisible&&actor.isVisible();if(!visible)return;
  if(Label.class.isAssignableFrom(actor.getClass()))labels.push(String(Java.cast(actor,Label).getText()));
  if(Group.class.isAssignableFrom(actor.getClass())){const children=Java.cast(actor,Group).getChildren();for(let i=0;i<children.size.value;i++)walk(Java.cast(children.get(i),U('com.badlogic.gdx.scenes.scene2d.Actor')),visible);}
 }
 walk(Java.cast(screen,U('com.badlogic.gdx.scenes.scene2d.Stage')).getRoot(),true);
 send({kind:'ui_state',screen:String(Java.cast(screen,U('java.lang.Object')).getClass().getName()),panel:panel?String(Java.cast(panel,U('java.lang.Object')).getClass().getName()):null,labels,panels:stack.size()});send({kind:'done'});
}catch(e){send({kind:'error',error:String(e),stack:e.stack});}});
