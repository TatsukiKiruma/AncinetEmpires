# OPENCODE APK 回放/记录系统文档

**反编译来源**：jadx 1.4.7 对 `aer-release-4.2.5.1.apk` 完全反编译  
**分析日期**：2026-07-03  
**反编译输出目录**：`C:\code\AncinetEmpires\APK\_analysis\jadx_output\java`  
**DEX 文件**：`classes.dex` (4,052,988 字节)

---

## 目录

1. [概述](#1-概述)
2. [文件存储架构](#2-文件存储架构)
3. [序列化与加密格式](#3-序列化与加密格式)
4. [动作录制与回放流程](#4-动作录制与回放流程)
5. [存档数据模型](#5-存档数据模型)
6. [检查点/待机数据模型](#6-检查点待机数据模型)
7. [动作记录数据模型](#7-动作记录数据模型)
8. [回放监听器接口](#8-回放监听器接口)
9. [UI 语言字符串](#9-ui-语言字符串)
10. [完整文件索引](#10-完整文件索引)

---

## 1. 概述

APK 的 **Ancient Empires Reloaded** 游戏内置了一套完整的对战记录与回放系统，包含：

- **动作录制**：玩家每一步操作（移动/攻击/招募/待机等）被录制为 `C0578b` 动作记录对象
- **存档系统**：完整游戏状态可保存为 `.sav` 文件（DES 加密序列化）
- **回放系统**：录制好的动作序列可通过 `C0580c.m4578a(C0578b)` 回放到游戏引擎
- **检查点系统**：待机/支援等异步操作通过 `.wt` 文件保存续战数据
- **监听器接口**：`InterfaceC0594k` 提供回放事件回调

### 1.1 核心流程

```
玩家操作 → C0590i 事件 → C0586f 命令队列
                                ↓
                    C0580c.m4577a() → 录制 (C0592j)
                                ↓
                    C0595l 动作执行
                                ↓
                    执行结果 → C0583d 命令 → 动画/渲染
```

### 1.2 存储流程

```
保存存档:  C0664l.m4026g(name)  →  DES加密 → save/<name>.sav
加载存档:  C0664l.m4028e(name)  →  解密读取  → C0617b
保存动作:  C0664l.m4025h(name)  →  DES加密 → save/<name>.act
加载动作:  C0664l.m4027f(name)  →  解密读取  → C0578b[]
保存检查点: C0664l.m4040a(...)   →  DES加密 → save/C-<name>-<n>.wt
加载检查点: C0664l.m4033c(...)   →  解密读取  → C1272q
```

---

## 2. 文件存储架构

### 2.1 基础路径

**源码**：`AndroidLauncher.java:463`（`C:\code\AncinetEmpires\APK\_analysis\jadx_output\java\...\AndroidLauncher.java`）

```java
// 平台类型 + 路径配置
EnumC0670p enumC0670p = EnumC0670p.Android;
this.f5073b = new C0656i(new C0662j(enumC0670p, locale,
    "Ancient Empires Reloaded", ".aeii" + File.separator, ...));
```

- `f1521d` = `.aeii/`（配置目录前缀）

**路径解析**（`C0664l.m4034c()` / `C0664l.m4037b()`，`C0664l.java:159-216`）：

```java
// Android/iOS: 使用 Gdx.files.local
if (i == 1 || i == 2) {  // Android 或 iOS
    local = Gdx.files.local(this.f1565a.f1487c.f1521d + str);
} else {  // Desktop
    String property = System.getProperty("user.home");
    local = Gdx.files.absolute(property + this.f1565a.f1487c.f1521d + str);
}
```

**解析后路径**：

| 平台 | 基础路径 |
|------|----------|
| Android | `Gdx.files.local(".aeii/")` → 通常为 `/data/data/net.toyknight.aeii/files/.aeii/` |
| Desktop | `user.home + "/.aeii/"` |
| iOS | `Gdx.files.local(".aeii/")` |

### 2.2 子目录常量

**源码**：`C0645c.java:30-55`（`C:\code\AncinetEmpires\APK\_analysis\jadx_output\java\...\C0645c.java`）

| 字段 | 值 | 用途 |
|------|-----|------|
| `f1457g` | `"download/"` | 已下载地图 |
| `f1458h` | `"map/"` | **本地记录/本地地图** |
| `f1459i` | `"runtime/"` | 运行时 Mod 缓存 |
| `f1460j` | `"save/"` | **存档/重放/检查点** |
| `f1461k` | `"workspace/"` | 工作区 |
| `m4111a(str)` | `"cache/"` 或 `"cache-<lang>/"` | 缓存 |

### 2.3 文件类型过滤器

| 字段 | 值 | 用途 |
|------|-----|------|
| `f1462l` | `.act` | 动作记录过滤器 |
| `f1463m` | `.aem` | 地图文件过滤器 |
| `f1464n` | `.mod` | Mod 文件过滤器 |
| `f1465o` | `.sav` | 存档文件过滤器 |

### 2.4 完整路径表

**源码**：`C0664l.java` 全部方法

| 文件 | 完整路径 | 用途 | 对应方法 |
|------|----------|------|----------|
| `<name>.sav` | `<base>/save/<name>.sav` | **DES 加密完整游戏存档** | `m4026g()` 写 / `m4028e()` 读 |
| `<name>.act` | `<base>/save/<name>.act` | **DES 加密动作记录** | `m4025h()` 写 / `m4027f()` 读 |
| `C-<name>-<n>.wt` | `<base>/save/C-<name>-<n>.wt` | **DES 加密检查点/待机数据** | `m4040a()` 写 / `m4033c()` 读 |
| `<name>.aem` | `<base>/map/<name>.aem` | 本地地图 | `m4035c()` 列出 |
| `<name>.aem` | `<base>/download/<name>.aem` | 已下载地图 | `m4038b()` 列出 |
| `<code>/` | `<base>/runtime/<code>/` | Mod 文件 | `m4046a()` |

### 2.5 Android 实机路径

```
/data/data/net.toyknight.aeii/files/.aeii/
├── save/
│   ├── <name>.sav           ← 游戏存档 (DES加密)
│   ├── <name>.act           ← 动作录制/回放 (DES加密)
│   └── C-<name>-<n>.wt      ← 待机检查点 (DES加密)
├── map/
│   └── <name>.aem           ← 本地地图 (DES加密)
├── download/
│   └── <name>.aem           ← 下载地图
├── cache/
├── workspace/
└── runtime/
    └── <code>/              ← Mod 文件
```

---

## 3. 序列化与加密格式

### 3.1 序列化实现

**源码**：`C0601r.java:17-69`（`C:\code\AncinetEmpires\APK\_analysis\jadx_output\java\...\C0601r.java`）

```java
public class C0601r extends C0571a {
    public static final C0601r f1218b = new C0601r();

    // 反序列化：检查 magic 365703
    protected <T> T mo4251a(C0573c c0573c, Class<T> cls) {
        if (c0573c.readInt() == 365703) {  // Magic number
            return super.mo4251a(c0573c, cls);
        }
        throw new C0572b("LSS");
    }

    // 序列化：写入 magic 365703
    protected void mo4250a(C0574d c0574d, Object obj) {
        c0574d.writeInt(365703);  // Magic number
        super.mo4250a(c0574d, obj);
    }

    // DES 加密反序列化输入流
    public <T> T m4248a(byte[] bArr, InputStream inputStream, Class<T> cls) {
        return m4635a(C1243b.m2423a(bArr, inputStream), cls);
    }

    // DES 加密序列化输出流
    public byte[] m4247a(byte[] bArr, Object obj) {
        ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
        CipherOutputStream m2422a = C1243b.m2422a(bArr, byteArrayOutputStream);
        m4634a(m2422a, obj);
        m2422a.close();
        return byteArrayOutputStream.toByteArray();
    }
}
```

- **序列化框架**：自定义 `C0571a` 二进制序列化（类似 Java 序列化但为自实现）
- **Header**：4 字节 magic `365703`（0x00059487）
- **加密**：`DES/CBC/PKCS7`（由 `C1243b` 提供）
- **Key/IV**：`72 6b 00 00 00 00 46 46`（ASCII `rk\0\0\0\0FF`，来自 `C1242a.f2959a`）

### 3.2 序列化接口

所有可序列化数据类实现 `InterfaceC0575e`：

```java
public interface InterfaceC0575e {
    void mo2374a(C0573c c0573c);  // 反序列化（读取）
    void mo2373a(C0574d c0574d);  // 序列化（写入）
}
```

---

## 4. 动作录制与回放流程

### 4.1 事件 -> 动作记录的录制链路

#### 4.1.1 玩家操作入口

**源码**：`C0580c.java:176-298`（`C:\code\AncinetEmpires\APK\_analysis\jadx_output\java\...\C0580c.java`）

```java
// 选择单位 (x, y)
public void m4579a(int i, int i2, boolean z) {
    this.f1102a.f1086f.m4507a(C0590i.m4491a(i, i2, z));
}

// 移动 (x1, y1, x2, y2)
public void m4570b(int i, int i2) {
    this.f1102a.f1086f.m4507a(C0590i.m4486c(i, i2));
}

// 攻击/治疗/召唤/支援 (x, y)
public void m4581a(int i, int i2) {
    // 根据当前选择状态确定事件类型
    // → C0590i.m4493a(i, i2) ATTACK
    // → C0590i.m4488b(i, i2) HEAL
    // → C0590i.m4484d(i, i2) SUMMON
    // → C0590i.m4482e(i, i2) SUPPORT
}

// 招募 (unitIndex, x, y)
public void m4580a(int i, int i2, int i3) {
    this.f1102a.f1086f.m4507a(C0590i.m4492a(i, i2, i3));
}
```

#### 4.1.2 命令队列 + 录制

**源码**：`C0586f.java:485-488`

```java
public void m4507a(C0590i c0590i) {
    this.f1157b.addLast(c0590i);           // 加入事件队列
    m4499e().m4577a(c0590i);               // 触发录制
}
```

#### 4.1.3 核心录制方法

**源码**：`C0580c.java:302-311`

```java
void m4577a(C0590i c0590i) {
    int m4336c = m4585A().m4336c();        // 获取游戏状态
    if (!this.f1102a.m4592d() && m4336c != 3) {
        this.f1107f.m4478a(c0590i);        // C0592j 录制到 List<C0578b>
    }
    InterfaceC0594k interfaceC0594k = this.f1108g;
    if (interfaceC0594k != null) {
        interfaceC0594k.mo2952a(c0590i);   // 通知监听器
    }
}
```

- `f1107f` = `C0592j` — 动作录制器（AI 类，带动作缓冲）
- `f1108g` = `InterfaceC0594k` — 回放/网络同步监听器
- 条件 `!m4592d()` 确保回放模式不重复录制
- 条件 `m4336c != 3` 确保终局状态不录制

### 4.2 动作录制器 (C0592j)

**源码**：`C0592j.java:9-233`（`C:\code\AncinetEmpires\APK\_analysis\jadx_output\java\...\C0592j.java`）

```java
public final class C0592j {
    private final List<C0578b> f1190a = new ArrayList();  // 录制缓冲区
    public boolean f1196g = false;                         // 录制开关

    // 接收到事件时的录制逻辑
    void m4478a(C0590i c0590i) {
        if (this.f1196g) {
            switch (c0590i.f1171a) {
                case SELECT:  // 记录选中位置
                    m4479a();
                    this.f1191b = new C0632c(x, y);
                    return;
                case MOVE:    // 记录移动目标
                    this.f1192c = new C0632c(x, y);  // 或 f1194e（突击后移动）
                    return;
                case OCCUPY:
                case REPAIR:
                case STANDBY:
                    this.f1195f = c0590i.f1171a;  // 记录事件类型
                    return;
                case RECRUIT:  // 立即写入招募动作
                    m4479a();
                    this.f1190a.add(C0578b.m4588a(new C0632c(x, y), unitIndex));
                    return;
                case ATTACK:
                case SUMMON:
                case HEAL:
                case SUPPORT:
                    this.f1193d = new C0632c(x, y);  // 记录目标位置
                    this.f1195f = c0590i.f1171a;
                    return;
                case NEXT_TURN:  // 写入 NextTurn 动作
                    m4479a();
                    this.f1190a.add(C0578b.m4589a());
                    return;
                case SURRENDER:  // 写入投降动作
                    m4479a();
                    this.f1190a.add(C0578b.m4586b());
                    return;
            }
        }
    }

    // 刷新当前缓冲 -> 添加到列表
    public void m4479a() {
        if (this.f1196g && this.f1195f != C0590i.EnumC0591a.NONE) {
            C0578b record = C0578b.m4587a(f1191b, f1192c, f1193d, f1195f);
            // 如果有突击后移动，附加到动作记录
            if (this.f1194e != null) {
                record.f1094e = f1194e.f1436a;
                record.f1095f = f1194e.f1437b;
            }
            this.f1190a.add(record);
            m4473f();  // 重置缓冲
        }
    }

    // 提取累积的动作数组（保存到 .act 文件前调用）
    public C0578b[] m4477b() {
        m4479a();  // 刷新当前动作
        if (this.f1190a.size() == 0) return new C0578b[0];
        C0578b[] result = m4476c();   // 复制为数组
        this.f1190a.clear();          // 清空缓冲区
        return result;
    }
}
```

### 4.3 回放执行

**源码**：`C0580c.java:226-298`

```java
// 回放一个动作记录
public void m4578a(C0578b c0578b) {
    // 调试输出
    if (this.f1102a.f1082b) {
        System.err.println(c0578b);
    }
    if (c0578b.f1098i < 0) {  // 非招募动作
        switch (c0578b.f1099j) {
            case SURRENDER:
                queue.add(C0590i.m4480g());  // 投降事件
                break;
            case NEXT_TURN:
                queue.add(C0590i.m4489b());  // 结束回合事件
                break;
            case GAME_START:
                queue.add(C0590i.m4495a());  // 游戏开始事件
                break;
            default:
                // 1) 选中单位
                queue.add(C0590i.m4491a(srcX, srcY, false));
                // 2) 移动
                queue.add(C0590i.m4486c(dstX, dstY));
                // 3) 动作（攻击/治疗/召唤/支援/占领/修理/待机）
                queue.add(C0590i.m4490a(event, targetX, targetY));
                // 4) 突击后移动
                if (postMoveX >= 0) {
                    queue.add(C0590i.m4486c(postMoveX, postMoveY));
                }
                break;
        }
    } else {  // 招募动作
        queue.add(C0590i.m4492a(unitIndex, x, y));
    }
}
```

### 4.4 .act 文件的读写

**源码**：`C0664l.java:293-318`

```java
// 读取动作记录 .act 文件
public C0578b[] m4027f(String str) {
    FileHandle file = m4039a(str + ".act", false);
    if (!file.exists()) return null;
    CipherInputStream cis = C1243b.m2423a(key, file.read());
    C0578b[] actions = (C0578b[]) C0601r.f1218b.m4635a(cis, C0578b[].class);
    C1278b.m2323a(cis);
    return actions;
}

// 写入动作记录 .act 文件（DES 加密）
public void m4025h(String str) {
    CipherOutputStream cos = C1243b.m2422a(key,
        m4039a(str + ".act", false).write(false));
    C0601r.f1218b.m4634a(cos, this.f1565a.f1500p.f1084d.f1107f.m4476c());
    C1278b.m2322a(cos);
}
```

其中 `this.f1565a.f1500p.f1084d.f1107f.m4476c()` 从 GameController → C0580c → AI(Bot) 获取当前录制的动作数组。

---

## 5. 存档数据模型

### 5.1 C0617b — 存档文件结构

**源码**：`C0617b.java:8-49`（`C:\code\AncinetEmpires\APK\_analysis\jadx_output\java\...\C0617b.java`）

```java
public class C0617b implements InterfaceC0575e {
    public int f1360a;          // 存档版本号（当前为 100）
    public int f1361b;          // 最大版本（当前为 400）
    public byte[] f1362c;       // C0618a 序列化 → ConfigHolder（单位/地形配置）
    public byte[] f1363d;       // C0607b 序列化 → UnitMap（单位棋盘状态）
    public byte[] f1364e;       // C0606a 序列化 → GameState（游戏全局状态）
    public byte[] f1365f;       // C0612e 序列化 → SelectionState（选择状态）

    public void mo2374a(C0573c c0573c) {
        this.f1360a = c0573c.readInt();
        this.f1361b = c0573c.readInt();
        this.f1362c = c0573c.m4623l();  // 读取字节数组
        this.f1363d = c0573c.m4623l();
        this.f1364e = c0573c.m4623l();
        this.f1365f = c0573c.m4623l();
    }
}
```

### 5.2 存档序列化（GameController → C0617b）

**源码**：`C0577a.java:159-171`（`C:\code\AncinetEmpires\APK\_analysis\jadx_output\java\...\C0577a.java`）

```java
public C0617b m4594b() {  // 创建存档快照
    if (this.f1083c) throw new IllegalStateException();  // 回放中不可存档
    C0617b save = new C0617b();
    save.f1360a = 100;                                    // 版本号
    save.f1361b = 400;                                    // 最大版本
    save.f1362c = C0601r.f1218b.m4632a(this.f1085e.f1211b);  // ConfigHolder
    save.f1363d = C0601r.f1218b.m4632a(this.f1085e.f1214e);  // UnitMap
    save.f1364e = C0601r.f1218b.m4632a(this.f1085e.f1215f);  // GameState
    save.f1365f = C0601r.f1218b.m4632a(this.f1085e.f1216g);  // SelectionState
    return save;
}
```

### 5.3 存档反序列化（C0617b → GameController）

**源码**：`C0577a.java:103-126`

```java
public void m4596a(C0617b c0617b, InterfaceC0623c script, ScriptableObject scope) {
    // 版本校验
    if (100 != c0617b.f1360a || 400 < c0617b.f1361b)
        throw new C0589h(EnumC0588g.VERSION, "VER-ERROR");

    m4591e();  // 重置游戏控制器
    this.f1083c = false;

    // 反序列化各组件
    this.f1085e.f1211b.m4195a(                     // ConfigHolder 恢复
        C0601r.f1218b.m4631a(c0617b.f1362c, C0618a.class));
    this.f1089i.m4389a(script, scope);             // 脚本引擎恢复
    this.f1085e.f1214e =                            // UnitMap 恢复
        C0601r.f1218b.m4631a(c0617b.f1363d, C0607b.class);
    this.f1085e.f1215f =                            // GameState 恢复
        C0601r.f1218b.m4631a(c0617b.f1364e, C0606a.class);
    this.f1085e.f1216g =                            // SelectionState 恢复
        C0601r.f1218b.m4631a(c0617b.f1365f, C0612e.class);
}
```

### 5.4 存档读写方法

**源码**：`C0664l.java:254-265, 268-280`

```java
// 保存 .sav 存档
public void m4026g(String str) {
    CipherOutputStream cos = C1243b.m2422a(key,
        m4034c(C0645c.f1460j + str + ".sav").write(false));
    C0601r.f1218b.m4634a(cos, this.f1565a.f1500p.m4594b());  // GameController → C0617b
    C0601r.f1218b.m4634a(cos, this.f1566b.f2723a);           // 脚本文件名
    C0601r.f1218b.m4634a(cos, this.f1566b.f2724b);           // 脚本字节码
    C1278b.m2322a(cos);
}

// 加载 .sav 存档
public C0617b m4028e(String str) {
    CipherInputStream cis = C1243b.m2423a(key,
        m4034c(C0645c.f1460j + str + ".sav").read());
    C0617b save = C0601r.f1218b.m4635a(cis, C0617b.class);
    this.f1566b.f2723a = C0601r.f1218b.m4635a(cis, String.class);
    this.f1566b.f2724b = C0601r.f1218b.m4635a(cis, byte[].class);
    C1278b.m2323a(cis);
    return save;
}
```

---

## 6. 检查点/待机数据模型

### 6.1 C1272q — 检查点文件结构

**源码**：`C1272q.java:10-50`（`C:\code\AncinetEmpires\APK\_analysis\jadx_output\java\...\C1272q.java`）

```java
public class C1272q implements InterfaceC0575e {
    public String f3074a;         // 关卡名称/标识
    public int f3075b;            // 检查点索引
    public long f3076c;           // 时间戳（向后兼容，可能为 -1）
    public C0618a f3077d;         // ConfigHolder（单位/地形配置快照）
    public C0578b[] f3078e;       // 已完成的动作记录数组

    public void mo2374a(C0573c c0573c) {
        this.f3074a = c0573c.m4617r();        // 读取字符串
        this.f3075b = c0573c.readInt();
        this.f3077d = c0573c.m4626e(C0618a.class);   // 读取配置
        this.f3078e = c0573c.m4625f(C0578b.class);   // 读取动作数组
        try {
            this.f3076c = c0573c.readLong();  // 时间戳（向后兼容）
        } catch (Exception unused) {
            this.f3076c = -1L;
        }
    }
}
```

### 6.2 检查点写入

**源码**：`C0664l.java:145-156`

```java
public void m4040a(String str, int i, long j, int i2, int i3, C0578b[] c0578bArr) {
    // 写入游戏状态
    this.f1565a.f1492h.m4017a(str, i, i2, i3);
    // 写入检查点文件
    CipherOutputStream cos = C1243b.m2422a(key,
        m4039a("C-" + str + "-" + i + ".wt", false).write(false));
    C1272q checkpoint = new C1272q();
    checkpoint.f3074a = str;
    checkpoint.f3075b = i;
    checkpoint.f3076c = j;
    checkpoint.f3077d = this.f1565a.f1501q;    // 配置快照
    checkpoint.f3078e = c0578bArr;             // 已完成动作
    C0601r.f1218b.m4634a(cos, checkpoint);
    C1278b.m2322a(cos);
}
```

---

## 7. 动作记录数据模型

### 7.1 C0578b — 单步动作记录

**源码**：`C0578b.java:10-150`（`C:\code\AncinetEmpires\APK\_analysis\jadx_output\java\...\C0578b.java`）

```java
public class C0578b implements InterfaceC0575e {
    public int f1090a = -1;   // 源单位 x
    public int f1091b = -1;   // 源单位 y
    public int f1092c = -1;   // 移动目标 x
    public int f1093d = -1;   // 移动目标 y
    public int f1094e = -1;   // 突击后移动 x（Assault Force 后续移动）
    public int f1095f = -1;   // 突击后移动 y
    public int f1096g = -1;   // 动作目标 x（攻击/治疗/召唤/支援）
    public int f1097h = -1;   // 动作目标 y
    public int f1098i = -1;   // 招募单位 ID（>= 0 表示招募动作）
    public C0590i.EnumC0591a f1099j = NONE;  // 事件类型

    // 工厂方法：结束回合
    public static C0578b m4589a() { ... f1099j = NEXT_TURN; }

    // 工厂方法：招募
    public static C0578b m4588a(C0632c pos, int unitIndex) {
        ... f1090a = pos.x; f1091b = pos.y; f1098i = unitIndex;
    }

    // 工厂方法：移动+动作
    public static C0578b m4587a(C0632c src, C0632c dst, C0632c target, EventType event) { ... }

    // 工厂方法：投降
    public static C0578b m4586b() { ... f1099j = SURRENDER; }
}
```

### 7.2 C0590i — 事件（动作指令）

**源码**：`C0590i.java:4-136`（`C:\code\AncinetEmpires\APK\_analysis\jadx_output\java\...\C0590i.java`）

```java
public class C0590i {
    public final EnumC0591a f1171a;  // 事件类型
    private int[] f1172b;            // 参数数组

    public enum EnumC0591a {
        ATTACK, GAME_START, HEAL, MOVE, NEXT_TURN, NONE,
        OCCUPY, RECRUIT, REPAIR, REVERSE, SELECT, STANDBY,
        SUMMON, SUPPORT, SURRENDER
    }
}

```

### 7.3 C0632c — 坐标位置

**源码**：`C0632c.java:8-73`（`C:\code\AncinetEmpires\APK\_analysis\jadx_output\java\...\C0632c.java`）

```java
public class C0632c implements InterfaceC0575e {
    public int f1436a;  // x
    public int f1437b;  // y
}
```

### 7.4 C0583d — 命令（已展开的底层指令）

**源码**：`C0583d.java:12-266`（`C:\code\AncinetEmpires\APK\_analysis\jadx_output\java\...\C0583d.java`）

```java
public enum EnumC0584a {
    ATTACK, BANNER_MESSAGE, CARRY_FLAG, CARRY_UNIT,
    CHANGE_EXP, CHANGE_HP, CHANGE_TILE, CHANGE_UNIT_TEAM,
    COUNTER_ATTACK, CREATE_UNIT, DESTROY_UNITS, DIALOG_MESSAGE,
    DIVINE_JUDGEMENT, FOCUS, HEAL, MOVE, MOVE_OVER, NONE,
    OCCUPY, POST_ACTION, POST_MOVE, POST_STANDBY, POST_TURN_START,
    REINFORCE, REMOVE_UNIT, REPAIR, SHOW_OBJECTIVES, STANDBY,
    SUMMON, SUPPORT, TURN_END, TURN_START
}
```

### 7.5 事件/命令/动作的关系

```
玩家操作 → C0590i 事件 (高层面)
    → C0586f 队列
        → C0580c.m4577a() 录制到 C0592j (记录为 C0578b)
        → C0595l 动作执行器
            → C0583d 命令 (底层动画/逻辑指令)
```

---

## 8. 回放监听器接口

### 8.1 InterfaceC0594k

**源码**：`InterfaceC0594k.java:4-28`（`C:\code\AncinetEmpires\APK\_analysis\jadx_output\java\...\InterfaceC0594k.java`）

```java
public interface InterfaceC0594k {
    void mo2953a(int i, int i2, boolean z);  // 单位选中通知
    void mo2952a(C0590i c0590i);             // 动作事件通知
    void mo2946b();                           // 状态变更通知
    void mo2943b(String str);                 // 加载回放/存档
    void mo2940d();                           // 回合/选择结束通知
    void mo2938e();                           // 待机完成通知
    void mo2936f();                           // 回放恢复通知
    void mo2933g();                           // 回放暂停通知
}
```

该接口是回放/网络同步的观察者。具体实现类可能对应：
- **回放 GUI**：回放过程中驱动 UI 动画
- **网络同步**：多人游戏中同步对方操作
- **日志记录**：用于 debug 输出

---

## 9. UI 语言字符串

**源码**：`APK\_analysis\unpack\assets\languages`

| Key | 中文 | 英文 |
|------|------|------|
| `L_REPLAY` | 回放 | Replay |
| `L_LOCAL_RECORD` | 本地记录 | Local Record |
| `M_CONFIRM_SKIP_REPLAY` | 跳过回放？ | Skip replay? |
| `L_FINISHED_GAMES` | 已结束的游戏 | Finished Games |
| `L_SAVE_GAME` | 保存游戏 | Save Game |
| `L_LOAD_GAME` | 读取游戏 | Load Game |
| `L_SAVED_GAMES` | 存档列表 | Saved Games |
| `L_SKIRMISH_SUMMARY` | 遭遇战战斗小结 | Skirmish Battle Summary |
| `L_PLAY_AGAIN` | 再来一局 | Play Again |
| `L_SAVE` | 保存 | Save |
| `L_LOADING` | 读取中... | Loading... |

---

## 10. 完整文件索引

### 10.1 反编译 Java 文件

| 文件 | 路径 | 作用 |
|------|------|------|
| `C0664l.java` | `.../p049b/C0664l.java` | 文件 I/O 管理器：存档/回放/检查点文件的读写 |
| `C0645c.java` | `.../p049b/C0645c.java` | 路径常量与文件过滤器定义 |
| `C0577a.java` | `.../p040a/C0577a.java` | GameController：存档快照/加载入口 |
| `C0580c.java` | `.../p040a/C0580c.java` | 游戏状态控制器：录制触发、回放执行 |
| `C0592j.java` | `.../p040a/C0592j.java` | AI/动作录制器：`m4478a()` 录制事件→`C0578b` |
| `C0586f.java` | `.../p040a/C0586f.java` | 命令/事件队列：事件排队、录制触发 |
| `C0578b.java` | `.../p040a/C0578b.java` | 动作记录数据模型 |
| `C0590i.java` | `.../p040a/C0590i.java` | 事件模型（含 `EnumC0591a` 事件类型枚举） |
| `C0583d.java` | `.../p040a/C0583d.java` | 命令模型（含 `EnumC0584a` 命令类型枚举） |
| `C0601r.java` | `.../p040a/C0601r.java` | 序列化/反序列化 + DES 加密 |
| `C0617b.java` | `.../p043u/C0617b.java` | 存档数据模型 |
| `C1272q.java` | `.../p063i/C1272q.java` | 检查点数据模型 |
| `C0632c.java` | `.../p047y/C0632c.java` | 坐标数据模型 |
| `InterfaceC0594k.java` | `.../p040a/InterfaceC0594k.java` | 回放/同步监听器接口 |
| `C1243b.java` | `.../p061c/C1243b.java` | DES 加密/解密工具类 |
| `C1242a.java` | `.../p061c/C1242a.java` | 加密密钥持有者 |
| `AndroidLauncher.java` | `.../android/AndroidLauncher.java` | Android 入口，配置 `.aeii` 目录路径 |

所有文件均位于 `C:\code\AncinetEmpires\APK\_analysis\jadx_output\java\p036c\p037a\p039b\` 下。

### 10.2 资源文件

| 文件 | 路径 |
|------|------|
| 英文语言表 | `APK\_analysis\unpack\assets\languages\en.lang` |
| 中文语言表 | `APK\_analysis\unpack\assets\languages\zh.lang` |

### 10.3 流程总结图

```
┌─────────────────────────────────────────────────────────────────┐
│ 玩家操作 → C0580c.m4579a/m4581a/m4580a/m4570b                  │
│                 ↓                                               │
│           C0586f.m4507a(C0590i 事件)                            │
│                 ├──→ f1157b.addLast()  ← 事件队列               │
│                 └──→ C0580c.m4577a()  ← 录制触发               │
│                         ├──→ C0592j.m4478a()  ← 录制到缓冲     │
│                         └──→ InterfaceC0594k  ← 监听器通知      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 保存 .act 文件:  C0664l.m4025h(name)                           │
│   ← C0592j.m4476c()  → 获取录制数组                            │
│   ← DES加密 → 写入 save/<name>.act                             │
│                                                                │
│ 保存 .sav 存档:  C0664l.m4026g(name)                           │
│   ← C0577a.m4594b()  → 创建 C0617b 快照                        │
│   ← DES加密 → 写入 save/<name>.sav                             │
│                                                                │
│ 保存 .wt 检查点:  C0664l.m4040a(name, ...)                     │
│   ← C1272q 结构 → DES加密 → 写入 save/C-<name>-<n>.wt          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 回放 .act 文件:                                                │
│   C0664l.m4027f(name) → 读取 C0578b[]                          │
│   C0580c.m4574a(actions) → 逐个执行 m4578a()                   │
│     → C0586f.m4507a(合成事件) → 正常执行链路                    │
│     → f1083c=true (回放模式，禁止存档)                          │
└─────────────────────────────────────────────────────────────────┘
```
