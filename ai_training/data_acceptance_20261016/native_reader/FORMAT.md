# 原生序列化读取格式及边界

本模块只读本地字节，不调用ADB、Frida、APK或任何规则执行。它保留原始序列化字段，不输出训练标签，也不声称完成TS规则映射或全量数据验收。

## 接口

从 `reader.ts` 导入：

```ts
readNativeSnapshot(bytes: Uint8Array): NativeSnapshot
readNativeConfig(bytes: Uint8Array): NativeGameConfig | null
readNativeDefinitions(bytes: Uint8Array): NativeDefinitions | null
readNativeBoard(bytes: Uint8Array): NativeBoard | null
readNativePlayers(bytes: Uint8Array): NativePlayers | null
readNativeRuntime(bytes: Uint8Array): NativeRuntime | null
readNativeStateFrames(bytes: Uint8Array): Generator<NativeFrame>
```

所有类型由 `types.ts` 定义并经reader重导出。根快照返回：

```text
header = {magic:365703, a:int32, b:int32}
components = {c:definitions|null, d:board|null, e:players|null, f:runtime|null}
raw = {c:Buffer|null, d:Buffer|null, e:Buffer|null, f:Buffer|null}
byteLength = 原始快照长度
```

`raw`保留四份完整子blob，含其各自magic和对象null标志。根snapshot为null时拒绝，因为不能当作有效状态；各独立组件和config的根null均原样返回。**snapshot.c不是完整开局config**：它是C0618a地形/兵种定义；`config.bin`另外是C0585e。

`readNativeStateFrames`接受已解压的states字节；每帧是BE int32长度加完整快照。生成器逐帧返回index、前缀offset、快照byteLength、原始bytes及解析snapshot。只有迭代到末尾才完成整个流的尾部校验；不能只取首个yield后声称全流通过。此接口不负责gzip解压和tar读取。

## 外壳与基础值

证据均为 `APK/_analysis/jadx_output/java/` 下的既有Java反编译源码，路径与SHA见source-identity.json。

- `p036c/p037a/p039b/p040a/C0601r.java:25–29、53–55`：每份序列化根前有int32 magic=365703，子blob也是独立序列化根。
- `p036c/p037a/p038a/C0573c.java`、`C0574d.java`：DataInput/OutputStream的大端int32/int64；nullable对象、数组和字符串前1字节boolean，**1=null，0=非null**。数组随后int32长度；二维数组外层和每行各有nullable/length。对象数组每个元素也有nullable标志。
- nullable String使用Java `readUTF/writeUTF`：BE uint16字节长度+modified UTF-8，U+0000写C0 80，非BMP字符按两个UTF-16代理代码单元各写3字节。
- C0635f的type4字符串另用nullable byte[]保存标准UTF-8，不是modified UTF-8。
- Java long全用bigint保存，不转换为JS number。JSON写出须使用调用方明确的bigint策略，禁止隐式舍入。
- 读取器比Java DataInputStream更严格：boolean仅接收0/1；拒绝非规范modified UTF-8、负计数、越界长度和尾随字节。这符合原生writeBoolean/writeUTF输出；异常流不会被容错“修复”。

现有 `tools/apk_game_get_report.ts` 的ApkObjectReader是模块私有类，无法直接导入；本目录依据同一Java基础格式独立实现严格读取器，未修改公共工具。

## 快照与组件字段

下列a/b等均为原始混淆字段名；括号内为证据支持的含义或明确标注的不确定项。

### C0617b快照

`p043u/C0617b.java:30–47`依次a、b两个int，然后c/d/e/f四个nullable byte[]。采集器 `tools/phone_training/worker.rhino.js:54` 的snapshot()分别从q.b、q.e、q.f、q.g序列化，a=100、b=400；引擎恢复 `C0577a.java:109–113` 明确解为C0618a、C0607b、C0606a、C0612e。本读取器保留a/b，不把100/400猜成版本号或棋盘配置。

### C0618a定义

`p044v/C0618a.java`依次a:C0619b[]、b:C0620c[]，数组与元素均可null。

- C0619b：a bool；b/c/d/e/f int；g bool；h/i int；j int[]；k int。
- C0620c：a/b/c/d/e/f/g/h/i/j/k/l/m/**o/n** int；p int[]；q/r bool。必须注意o在n前写，不能按字母排序读。

不依索引猜测兵种或地形身份，保留完整数组及null槽。映射器可结合现有APK配置规则再解释。

### C0607b棋盘

`p042t/C0607b.java:188–220`：a宽、b高；c int[][]（主地形/归属打包值）、d int[][]（覆盖层/墓碑打包值）、e C0613f[][]（单位）。**矩阵索引[x][y]**，不可转置后称原始字节结构。

该类访问器说明：主层terrain=`c[x][y] >> 12`、owner=`c[x][y] & 4095`；覆盖层duration=`d[x][y] >> 12`、owner=`d[x][y] & 4095`，-1表示无覆盖层。读取器保留原打包int，不先丢弃高位/低位。

Java读入后才重建的f坐标缓存、g六队单位数、h单位位置Set、i覆盖层位置Set不在字节流中；本模块不将其当作原始字段，也不执行Java集合重建。可从保存的a/b/c/d/e派生，但应单列派生身份。

### C0613f单位

`p042t/C0613f.java:106–140`：a int（单位类别）、b int（队伍）、c={a:x,b:y}，d/e/f/g/h五int，i/j/k/l四bool，m nullable modified-UTF String。

已由上下文支持：d经验、eHP、f剩余移动力，i已行动，k指挥官标志。其余字段在本模块不再猜测映射。n**没有写入字节**；Java读完后由经验d计算等级，因此返回 `derived.n`，公式为0或满足`d >= (level+1)*100*level/2`的最大level（1…9）。不能把derived.n当作独立原始证据。

### C0606a玩家/全局状态

`p042t/C0606a.java:89–134`严格顺序：

```text
a C0634e|null（变量表）
b int64（C0610c内部随机状态）
c C0611d|null（规则）
d C0613f|null（待处理单位）
e/f/g/h int32
i/j/k/l/m int[]|null
n int[][]|null
o/p/q int[]|null
r (C0613f|null)[]|null
s int[]|null
```

`C0600q.java:337–344、687–704、1181–1192、1311–1322`支持e当前行动队、f逐玩家交接计数、g整轮数、h结束联盟标识/未结束负值，i当前队伍类型及淘汰状态、j原始可恢复队伍类型、k队伍联盟、l金币、m单位上限。这里纠正初稿中i/j解释颠倒；reader始终只按原字段名读写，代码和二进制夹具未改。**h不能按字段名winner_mask猜为位掩码或队伍ID**；本轮5012段端点与存活联盟核验支持当前数据的获胜联盟语义，详见`../phone/endpoints/README.md`，不据此推断尚未验收的脚本胜负。

n招募覆盖数组、o/p/q/s队伍参数、r指挥官保留体都原样保存；本读取器不自行生成value标签。Java实例的t=new int[6]并未序列化；它属于构造默认缓存，不是快照内证据。

C0610c源码直接保存long状态并按long算术推进；本模块只读b，**不执行或重写随机数**。

### C0611d规则

`p042t/C0611d.java:120–194`序列化a、c…z、A/B/C、E…J共34个int。**b和D不在字节流**；Java构造默认b=10、D=0.25，分别在`derivedDefaults`返回，避免和线字段混淆。维持大小写区分，不按属性枚举顺序解析。

### C0634e/C0635f变量表

C0634e写int32条目数，依次nullable modified-UTF key + nullable C0635f value。为保留原始顺序、重复键/null键和每项字节证据，返回 `a: [{key,value},...]`，不转换成会覆盖键的Map。Java装载HashMap时发生的重复键覆盖属于后续运行语义。

C0635f先写int32 tag a：0→bool，1→int32，2→float32，3→int64，4→nullable标准UTF-8 byte[]字符串，5→nullable opaque序列化byte[]。返回b为对应值；type2另有rawFloatBits保留NaN原始位；type4另有rawBytes保留原UTF-8（即便解码替换字符也不丢原字节）。type5不猜内部类型或凭magic硬拆。

未知tag按Java分支保留a及b=null，消耗0 payload，**没有跳字节容错**；所在对象仍必须完整消费。数据验收层应统计未知tag并阻断未确认语义。

### C0612e运行态

`p042t/C0612e.java`：a/b int32，c/d nullable C0632c坐标，e nullable C0631b路径缓存。C0631b依次a int[][]；b/c/d各为int32计数+逐个nullable坐标，原生b/d为Set，c为List；返回字节迭代顺序数组，保留null，不重排或去重。

## C0585e完整开局配置

`C0585e.java:71–103`顺序：a bool、b nullable C0618a、c nullable C0616a地图、d nullable C0611d、e int64 seed、f nullable String、g int32、h/i/j/k nullable int[]。

C0616a地图：a/b宽高、c nullable String、d/e/f int[]、g int32、h/i int[]。e通常为x-major主地形数组，f按5int记录单位初始类别/队伍/等级/x/y；读取器不替代地图语义校验，保留全部数组。

## 固定样本与验证范围

fixtures来自只读归档 `captures/phone-storage-1000-20261015/phone-storage-1000-20261015-batch-01.tar` 的s0001。提取脚本 `extract_fixtures.py`，SHA和原成员路径见 `fixtures/manifest.json`。四文件合计33,719 bytes，小于2MiB：initial 8786、final9852、config6291、首states帧8790。没有复制完整states流。

实际initial解析宽11高19、e=0/f=1/h=-1；final e=2/f=191/h=3；首states帧与initial逐字节相同。测试由解析后的**全部字段**按Java写入顺序独立重编码，四个组件、快照和config均与原字节完全一致。另测long极值、null/空数组、modified UTF-8、变量所有tag、重复/null键、NaN位模式、错误magic、截断、越界计数及嵌套尾随字节。

执行：

```text
node --import tsx --test ai_training/data_acceptance_20261016/native_reader/reader.test.ts
node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --esModuleInterop --skipLibCheck --types node ai_training/data_acceptance_20261016/native_reader/reader.ts ai_training/data_acceptance_20261016/native_reader/reader.test.ts
```

结果：4组测试通过，严格TypeScript检查通过；`test-results.tap`保存测试输出。这证明所测格式与样本无字段字节遗漏，**不等于3000局全部帧通过、不等于所有Java逻辑字段已解释、不等于TS strict转移或训练标签验收通过**。
