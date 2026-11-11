// 验证C++宿主直接调用HIP与HIPRTC，不依赖Python或PyTorch。
#include <hip/hip_runtime_api.h>
#include <hip/hiprtc.h>
#include <iostream>
#include <stdexcept>
#include <vector>
#include <string>
#include <fstream>
void check(hipError_t code){if(code!=hipSuccess)throw std::runtime_error(hipGetErrorString(code));}
int main(int argc,char** argv){
    try{
        if(argc<2||argc>3)throw std::runtime_error("需要ROCm头文件路径，可选输出GPU代码文件");
        check(hipInit(0));check(hipSetDevice(0));char name[256];check(hipDeviceGetName(name,256,0));
        double* device=nullptr;check(hipMalloc(reinterpret_cast<void**>(&device),256*sizeof(double)));
        const char* source="extern \"C\" __global__ void probe(double* p){int i=blockIdx.x*blockDim.x+threadIdx.x;if(i<256)p[i]=(double)i*2.0+1.0;}";
        hiprtcProgram program;auto status=hiprtcCreateProgram(&program,source,"probe.hip",0,nullptr,nullptr);
        if(status!=HIPRTC_SUCCESS)throw std::runtime_error("HIPRTC创建失败");
        std::string include=std::string("-I")+argv[1];
        const char* options[]={"--gpu-architecture=gfx1201","-ffp-contract=off",include.c_str()};
        status=hiprtcCompileProgram(program,3,options);
        if(status!=HIPRTC_SUCCESS){size_t n=0;hiprtcGetProgramLogSize(program,&n);std::vector<char> log(n+1);hiprtcGetProgramLog(program,log.data());throw std::runtime_error(log.data());}
        size_t size=0;hiprtcGetCodeSize(program,&size);std::vector<char> binary(size);hiprtcGetCode(program,binary.data());hiprtcDestroyProgram(&program);
        if(argc==3){std::ofstream output(argv[2],std::ios::binary);output.write(binary.data(),binary.size());if(!output)throw std::runtime_error("保存GPU代码失败");}
        hipModule_t module;hipFunction_t kernel;check(hipModuleLoadData(&module,binary.data()));check(hipModuleGetFunction(&kernel,module,"probe"));
        void* args[]={&device};check(hipModuleLaunchKernel(kernel,4,1,1,64,1,1,0,nullptr,args,nullptr));
        std::vector<double> output(256);check(hipMemcpy(output.data(),device,output.size()*sizeof(double),hipMemcpyDeviceToHost));
        for(int i=0;i<256;i++)if(output[i]!=i*2.0+1.0)throw std::runtime_error("GPU数值检查失败");
        std::cout<<"{\"device\":\""<<name<<"\",\"backend\":\"C++ HIP HIPRTC\",\"verifiedElements\":256,\"pythonUsed\":false}"<<std::endl;
        check(hipFree(device));check(hipModuleUnload(module));
        // 此环境正常同步完毕后直接结束，避开已知驱动卸载等待。
        return 0;
    }catch(const std::exception& error){std::cerr<<error.what()<<std::endl;return 1;}
}
