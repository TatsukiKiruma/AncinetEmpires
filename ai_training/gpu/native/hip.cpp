// HIP上下文由主线程创建，异步工作只访问原生内存；不跨线程触碰JS对象。
#include "common.hpp"
#include <hip/hip_runtime_api.h>
#include <hip/hiprtc.h>
#include <windows.h>
#include <atomic>
#include <chrono>
#include <memory>
#include <algorithm>
static void check(hipError_t s){if(s!=hipSuccess)throw std::runtime_error(std::string("HIP错误：")+hipGetErrorString(s));}
static double thread_cpu(){FILETIME a,b,k,u;GetThreadTimes(GetCurrentThread(),&a,&b,&k,&u);ULARGE_INTEGER x,y;x.LowPart=k.dwLowDateTime;x.HighPart=k.dwHighDateTime;y.LowPart=u.dwLowDateTime;y.HighPart=u.dwHighDateTime;return (x.QuadPart+y.QuadPart)/1e7;}
struct Buffer {
    double* host=nullptr;double* device=nullptr;size_t capacity=0;
    void reserve(size_t n){if(n<=capacity)return;size_t cap=65536;while(cap<n)cap*=2;double* h=nullptr;double* d=nullptr;check(hipHostMalloc(reinterpret_cast<void**>(&h),cap*8,0));try{check(hipMalloc(reinterpret_cast<void**>(&d),cap*8));}catch(...){hipHostFree(h);throw;}if(host)hipHostFree(host);if(device)hipFree(device);host=h;device=d;capacity=cap;}
    ~Buffer(){if(host)hipHostFree(host);if(device)hipFree(device);}
};
struct Context {
    hipModule_t module=nullptr;hipFunction_t kernel=nullptr;hipStream_t stream=nullptr;hipEvent_t begin=nullptr,end=nullptr;Buffer input,output;std::string name,architecture;double cpu=0;
    Context(const std::string& source,const std::string& include){double started=thread_cpu();check(hipInit(0));check(hipSetDevice(0));hipDeviceProp_t props;check(hipGetDeviceProperties(&props,0));name=props.name;architecture=props.gcnArchName;architecture=architecture.substr(0,architecture.find(':'));
        hiprtcProgram p=nullptr;if(hiprtcCreateProgram(&p,source.c_str(),"hard_score_batch.hip",0,nullptr,nullptr)!=HIPRTC_SUCCESS)throw std::runtime_error("HIPRTC创建失败");
        try{std::string arch="--gpu-architecture="+architecture,inc="-I"+include;const char* options[]={arch.c_str(),"-ffp-contract=off","-O2",inc.c_str()};auto s=hiprtcCompileProgram(p,4,options);if(s!=HIPRTC_SUCCESS){size_t n=0;hiprtcGetProgramLogSize(p,&n);std::vector<char> log(n+1);hiprtcGetProgramLog(p,log.data());throw std::runtime_error(log.data());}size_t n=0;if(hiprtcGetCodeSize(p,&n)!=HIPRTC_SUCCESS)throw std::runtime_error("HIPRTC代码长度失败");std::vector<char> code(n);if(hiprtcGetCode(p,code.data())!=HIPRTC_SUCCESS)throw std::runtime_error("HIPRTC代码读取失败");check(hipModuleLoadData(&module,code.data()));check(hipModuleGetFunction(&kernel,module,"hard_score_batch"));}catch(...){hiprtcDestroyProgram(&p);throw;}hiprtcDestroyProgram(&p);
        check(hipStreamCreate(&stream));check(hipEventCreate(&begin));check(hipEventCreate(&end));cpu+=thread_cpu()-started;
    }
    ~Context(){if(begin)hipEventDestroy(begin);if(end)hipEventDestroy(end);if(stream)hipStreamDestroy(stream);if(module)hipModuleUnload(module);}
};
static Context* context=nullptr;
static std::atomic<bool> busy=false;
static int int_value(double n,int low,int high){if(!std::isfinite(n)||n!=std::floor(n)||n<low||n>high)throw std::runtime_error("HIP整数输入越界");return static_cast<int>(n);}
static int validate(const std::vector<double>& d){
    if(d.size()<8||d.size()>524288)throw std::runtime_error("HIP输入尺寸无效");for(double x:d)if(!std::isfinite(x))throw std::runtime_error("HIP输入非有限");
    if(d[1]==-2){int rows=int_value(d[2],1,768),cols=int_value(d[3],1,768),cells=rows*cols,e=int_value(d[4],0,1536),a=int_value(d[5],0,1536);if(cells>768||d[0]!=cells||e>cells*2||a>cells*2||d.size()!=8+(e+a)*2)throw std::runtime_error("HIP距离场布局无效");for(int i=0;i<e+a;i++){int_value(d[8+i*2],0,rows-1);int_value(d[9+i*2],0,cols-1);}return cells;}
    if(d[1]==-1){int rows=int_value(d[2],1,768),cols=int_value(d[3],1,768),cells=rows*cols,move=int_value(d[4],0,32);if(cells>768||d.size()!=8+cells*2)throw std::runtime_error("HIP地图布局越界");int count=std::min(cells,1+2*move*(move+1));if(d[0]!=count)throw std::runtime_error("HIP范围容量不符");int_value(d[5],0,cells-1);for(int i=0;i<cells;i++){int_value(d[8+i],1,1000000);int_value(d[8+cells+i],0,1);}return count;}
    int n=int_value(d[0],1,10000),enemy=int_value(d[1],0,10000),ally=int_value(d[2],0,10000),landing=int_value(d[3],0,10000),denom=int_value(d[4],1,10001);
    if(denom!=landing+1||d.size()!=8+n*3+(enemy+ally+landing)*2)throw std::runtime_error("HIP评分布局不符");for(int i=8;i<8+(n+enemy+ally+landing)*2;i++)int_value(d[i],-10000,10000);return n;
}
struct Work {napi_env env;napi_async_work work=nullptr;napi_deferred deferred;std::vector<std::vector<double>> requests;std::vector<double> output,counts;std::string error;double seconds=0,cpu=0;float ms=0;};
static void execute(napi_env,void* data){auto w=static_cast<Work*>(data);auto start=std::chrono::steady_clock::now();double cpu=thread_cpu();try{
    check(hipSetDevice(0));size_t size=1+w->requests.size()*2,total=0;unsigned grid=1;
    for(auto& d:w->requests){int n=validate(d);w->counts.push_back(n);total+=n;size+=d.size();if(d[1]!=-1)grid=std::max(grid,static_cast<unsigned>(d[1]==-2?std::min(n,64):n));}
    if(total*24>32*1024*1024)throw std::runtime_error("HIP输出批次过大");context->input.reserve(size);context->output.reserve(total*3);auto& input=context->input;auto& output=context->output;
    input.host[0]=static_cast<double>(w->requests.size());size_t offset=1+w->requests.size()*2,out=0;
    for(size_t i=0;i<w->requests.size();i++){auto& d=w->requests[i];input.host[1+i*2]=static_cast<double>(offset);input.host[2+i*2]=static_cast<double>(out);std::memcpy(input.host+offset,d.data(),d.size()*8);offset+=d.size();out+=static_cast<size_t>(w->counts[i])*3;}
    check(hipEventRecord(context->begin,context->stream));check(hipMemcpyAsync(input.device,input.host,size*8,hipMemcpyHostToDevice,context->stream));void* args[]={&input.device,&output.device};
    check(hipModuleLaunchKernel(context->kernel,grid,static_cast<unsigned>(w->requests.size()),1,64,1,1,0,context->stream,args,nullptr));check(hipMemcpyAsync(output.host,output.device,total*24,hipMemcpyDeviceToHost,context->stream));check(hipEventRecord(context->end,context->stream));check(hipEventSynchronize(context->end));check(hipEventElapsedTime(&w->ms,context->begin,context->end));
    w->output.assign(output.host,output.host+total*3);for(double x:w->output)if(!std::isfinite(x))throw std::runtime_error("HIP输出非有限");offset=0;for(size_t i=0;i<w->requests.size();i++){size_t count=static_cast<size_t>(w->counts[i]);if(w->requests[i][1]==-1)for(size_t j=0;j<count;j++)if(w->output[offset+j*3]<-1)throw std::runtime_error("HIP搜索队列溢出");offset+=count*3;}
}catch(const std::exception& x){w->error=x.what();}w->seconds=std::chrono::duration<double>(std::chrono::steady_clock::now()-start).count();w->cpu=thread_cpu()-cpu;context->cpu+=w->cpu;}
static void complete(napi_env e,napi_status status,void* data){std::unique_ptr<Work>w(static_cast<Work*>(data));busy=false;try{if(status!=napi_ok||!w->error.empty()){napi_value msg,err;ok(napi_create_string_utf8(e,w->error.empty()?"HIP异步取消":w->error.c_str(),NAPI_AUTO_LENGTH,&msg));ok(napi_create_error(e,nullptr,msg,&err));ok(napi_reject_deferred(e,w->deferred,err));}else{napi_value result,counts;ok(napi_create_object(e,&result));ok(napi_create_array_with_length(e,w->counts.size(),&counts));for(size_t i=0;i<w->counts.size();i++)ok(napi_set_element(e,counts,static_cast<uint32_t>(i),number(e,w->counts[i])));property(e,result,"counts",counts);property(e,result,"output",vector(e,w->output));property(e,result,"gpuMs",number(e,w->ms));property(e,result,"serviceSeconds",number(e,w->seconds));property(e,result,"gpuCpuSeconds",number(e,w->cpu));ok(napi_resolve_deferred(e,w->deferred,result));}}catch(const std::exception&x){napi_throw_error(e,nullptr,x.what());}napi_delete_async_work(e,w->work);}
static napi_value initialize(napi_env e,napi_callback_info info){try{auto a=arguments(e,info,2);if(context||busy)throw std::runtime_error("HIP上下文已存在");auto candidate=std::make_unique<Context>(string(e,a[0]),string(e,a[1]));napi_value r,v;ok(napi_create_object(e,&r));ok(napi_create_string_utf8(e,candidate->name.c_str(),NAPI_AUTO_LENGTH,&v));property(e,r,"name",v);ok(napi_create_string_utf8(e,candidate->architecture.c_str(),NAPI_AUTO_LENGTH,&v));property(e,r,"architecture",v);property(e,r,"initializationCpuSeconds",number(e,candidate->cpu));context=candidate.release();return r;}catch(const std::exception&x){return failure(e,x);}}
static napi_value calculate(napi_env e,napi_callback_info info){bool acquired=false;try{auto a=arguments(e,info,1);if(!context||busy.exchange(true))throw std::runtime_error("HIP未就绪或存在并行调用");acquired=true;uint32_t n;ok(napi_get_array_length(e,a[0],&n));if(n<1||n>128)throw std::runtime_error("HIP批次数量越界");auto w=std::make_unique<Work>();w->env=e;for(uint32_t i=0;i<n;i++){napi_value item;ok(napi_get_element(e,a[0],i,&item));auto d=array(e,item);if(d.n>524288)throw std::runtime_error("HIP请求过大");w->requests.emplace_back(d.p,d.p+d.n);}napi_value promise,name;ok(napi_create_promise(e,&w->deferred,&promise));ok(napi_create_string_utf8(e,"困难HIP批次",NAPI_AUTO_LENGTH,&name));ok(napi_create_async_work(e,nullptr,name,execute,complete,w.get(),&w->work));ok(napi_queue_async_work(e,w->work));w.release();return promise;}catch(const std::exception&x){if(acquired)busy=false;return failure(e,x);}}
static napi_value close(napi_env e,napi_callback_info){try{if(busy)throw std::runtime_error("HIP批次尚未结束");double cpu=context?context->cpu:0;delete context;context=nullptr;return number(e,cpu);}catch(const std::exception&x){return failure(e,x);}}
void register_hip(napi_env e,napi_value o){method(e,o,"initializeHip",initialize);method(e,o,"calculateBatch",calculate);method(e,o,"closeHip",close);}
