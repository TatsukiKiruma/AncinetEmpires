# C/C++、Rust、Godot与AMD原生计算路线评估

2026-10-29。用户在要求继续迁移CPU热点并进行32并发完整单批对照的基础上，补充要求评估更高效实现路线。本文件是架构评估与原生可用性验证，不是新一轮完整采集性能报告。

## 结论

优先选择：**现有权威引擎与困难AI控制流 + C++原生数据/调度模块 + AMD HIP计算内核**。先迁移纯计算与数据准备，保留原CPU实现作为参考，逐项验证后再扩大范围。

Rust可作为原生宿主替代，技术上已验证可调用同一HIP内核；没有依据声称相同设计的Rust天然比C++更快。Godot适合需要引擎功能的产品，对当前无渲染的采集加速缺少直接收益，不建议为此迁移整个项目。

## 本机实际验证

- 找到Visual Studio 18 Build Tools及MSVC编译环境。
- ROCm SDK中实际存在HIPRTC、HIP运行库、头文件、导入库及clang++/hipcc；这些程序没有全部加入PATH，不代表缺少工具链。
- Rust 1.91.0、Cargo 1.91.0可用。
- 当前PATH未发现Godot命令，没有据此断言机器其他位置不存在Godot。
- `probe.cpp`经MSVC编译，直接调用HIP/HIPRTC在RX9070XT（gfx1201）上编译、运行FP64内核，256项输出正确；不导入Python或PyTorch。
- `probe.rs`使用HIP的C ABI，加载C++探针产生的同一份GPU代码并执行，256项输出正确；不依赖第三方Rust crate、Python或PyTorch。

[C++结果](CPP_RESULT.json)、[Rust结果](RUST_RESULT.json)。这只是原生编译、链接、GPU调度和数值可用性验证；未测完整困难对局，不提供语言加速倍数，也没有完成原请求的优化后32局对照。

## 当前已经使用AMD原生计算

现有`hard_score.hip`和`parallel/range.hip`已经是HIP C++ GPU内核，通过HIPRTC编译为gfx1201代码，由`hipModuleLaunchKernel`启动；固定页内存、异步传输和HIP事件也已直接使用。Python主要负责服务协议、输入检查、缓冲管理和这些API调用，Node承担对局与请求调度。

因此“换成AMD原生接口”不是从零引入GPU能力。真正需要比较的是：原生模块是否能减少JS对象和字符串处理、Node/Python之间的管道复制、频繁的小请求，以及地图与模拟状态的重复准备。[HIPRTC官方说明](https://rocm.docs.amd.com/projects/HIP/en/docs-7.2.3/how-to/hip_rtc.html)。

## 方案对比

| 路线 | 对本项目的价值 | 代价与限制 | 判断 |
|---|---|---|---|
| C原生CPU模块 | 连续数组、地图索引、数据打包和简单数值循环 | 不会自动在GPU运行；仍需绑定HIP接口或C++内核 | 可用，但不必单独建立C技术栈 |
| C++模块 + HIP | 复用已有内核，原生批处理与缓冲管理，减少跨进程通信；适合迁移输入准备、距离与威胁纯计算 | 需要管理线程、缓冲生命周期和错误传播，必须实测墙钟及CPU负载 | 优先 |
| Rust宿主 + HIP C ABI | 类型与所有权管理有利于维护原生队列；可复用同一HIP GPU代码 | FFI涉及unsafe边界；当前GPU内核仍来自HIP C++，性能主要取决于算法和边界设计 | 可靠备选，不同时维护两套生产后端 |
| Godot + 计算着色器 | 若需要引擎、场景或渲染集成，可使用RenderingDevice | 现有TS规则和AI不会自动上GPU，需要迁移、适配及重新验证；FP64与舍入也需重新核对 | 当前不建议 |
| Vulkan/OpenCL等其他GPU API | 可建立其他GPU计算后端，偏向跨厂商需求 | 重新实现内核与调度，无法自动消除CPU准备和频繁同步；本机HIP已有实测依据 | 暂无迁移理由 |
| 整套规则/AI改为C++或Rust | 有潜力大幅减少JS解释、对象和GC成本 | 移植面最大，候选顺序、RNG、模拟状态和特殊规则最容易漂移；不能因速度目标另写一套未经验证的规则 | 不作为第一步 |

Godot官方计算着色器通过RenderingDevice及GLSL显式编写，需要相应渲染后端；Godot本身不会把普通脚本控制流自动变成GPU计算。[官方教程](https://docs.godotengine.org/en/stable/tutorials/shaders/compute_shaders.html)。Rust可以通过C ABI绑定外部库，但需正确维护调用约定与内存有效性。[Rust FFI说明](https://doc.rust-lang.org/nomicon/ffi.html)。

## 推荐实施顺序与边界

1. **先减少重复准备。** 地形属性、单位定义、队伍索引改为连续数值表；地图视图完整编码后复用，变更时更新。不能只跟踪真实游戏步数：困难AI会临时移动单位、评估假想动作再恢复，这些模拟视图也必须参与版本或完整缓存键，否则会改变决策。
2. **按较大的计算块迁移。** 地图过滤/阻挡输入、全图距离场、威胁候选过滤和归约优先合批；避免每个格子发一次GPU请求。原先“计算所有起点并回传稠密表”已经实测过慢，不能重复采用大回传量方案来追求GPU占用。
3. **引入一个共享原生GPU调度器。** 优先评估Node-API C++模块，让多个对局线程提交数值请求，由一个原生线程管理HIP上下文和持久缓冲。Node-API跨线程必须遵守环境/对象的线程约束，不能跨线程任意访问JS对象。[官方接口说明](https://nodejs.org/api/n-api.html)。可以先用独立C++服务降低集成风险，但它仍保留管道与复制开销。
4. **测等待方式。** 对比主动同步和阻塞同步的CPU消耗及延迟；不能将降低CPU占用直接等同于采集提速。
5. **最后做32并发完整单批A/B。** 同32个冻结初态、seed、规则、记录格式，启用相同GPU工作范围，关闭重复CPU参考计算；基线与候选顺序运行，保存源码身份、总墙钟、自然结束/截断、CPU进程时间、GPU逐秒样本及峰值RSS。此前219.70秒只能作为历史参考，缺少同期整批CPU基线，不能用一次现场CPU快照冒充平均CPU占用。

CPU/GPU和新旧原生实现必须核对候选顺序、剩余移动力、数值舍入、最终动作、回退行为、随机流及逐步状态哈希。GPU核心使用FP64并禁止不受控FMA/fast-math；整数、溢出和JS特殊值语义不得因为换语言而悄悄变化。保留权威引擎及原有地图可信度，不用重写规则来制造性能优势。

## 可复现原生探针

运行`build.cmd`编译C++宿主。将独立ROCm环境的`_rocm_sdk_core/bin`加入当前子进程PATH后运行：

```powershell
ai_training/gpu/native_probe/build/probe.exe C:/code/AncinetEmpires/ai_training/.venv-rocm/Lib/site-packages/_rocm_sdk_core/include ai_training/gpu/native_probe/build/probe.hsaco
rustc --edition 2024 -O ai_training/gpu/native_probe/probe.rs -L native=C:/code/AncinetEmpires/ai_training/.venv-rocm/Lib/site-packages/_rocm_sdk_core/lib -o ai_training/gpu/native_probe/build/rust_probe.exe
ai_training/gpu/native_probe/build/rust_probe.exe
```

路径与gfx1201面向本机，不是通用安装器。二进制位于忽略的build目录，源码与校验结果保留。没有安装Godot、切换引擎或启动正式采集。
