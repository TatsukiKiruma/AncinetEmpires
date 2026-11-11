import pathlib,sys,json,threading,frida
sys.stdout.reconfigure(encoding='utf-8')
folder=pathlib.Path(__file__).parent
bridge=pathlib.Path('C:/Users/SHIINA/anaconda3/Lib/site-packages/frida_tools/bridges/java.js').read_text(encoding='utf8')
session=frida.get_device_manager().add_remote_device('127.0.0.1:27042').attach(int(sys.argv[1]))
script=session.create_script(bridge+'\nglobalThis.Java=bridge;\n'+folder.joinpath(sys.argv[2]).read_text(encoding='utf8'))
done=threading.Event()
log=folder.joinpath(sys.argv[2]+'.jsonl').open('a',encoding='utf8')
def message(msg,data):
    value=msg.get('payload',msg);text=json.dumps(value,ensure_ascii=False);print(text,flush=True);log.write(text+'\n');log.flush()
    if value.get('kind') in ('done','error','mismatch'):done.set()
script.on('message',message);script.load();done.wait(int(sys.argv[3]) if len(sys.argv)>3 else 120);session.detach();log.close()
