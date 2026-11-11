// 一个共享插件同时提供工作线程纯计算和主线程HIP调度。
#include "common.hpp"
static napi_value init(napi_env e,napi_value exports){register_cpu(e,exports);register_hip(e,exports);register_monitor(e,exports);return exports;}
NAPI_MODULE(NODE_GYP_MODULE_NAME,init)
