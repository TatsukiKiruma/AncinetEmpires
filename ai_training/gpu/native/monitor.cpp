// 与旧服务使用相同PDH最大引擎口径，未知采样明确标记。
#include "common.hpp"
#include <windows.h>
#include <pdh.h>
#include <map>
#include <set>
#include <algorithm>
#include <chrono>
static PDH_HQUERY query=nullptr;static PDH_HCOUNTER counter=nullptr;
static napi_value sample(napi_env e,napi_callback_info){try{
    napi_value result;ok(napi_create_object(e,&result));double epoch=std::chrono::duration<double>(std::chrono::system_clock::now().time_since_epoch()).count();property(e,result,"epoch",number(e,epoch));
    bool available=false;double ownMax=0,systemMax=0;std::string reason;
    if(!query){auto status=PdhOpenQueryW(nullptr,0,&query);if(!status)status=PdhAddEnglishCounterW(query,L"\\GPU Engine(*)\\Utilization Percentage",0,&counter);if(!status)status=PdhCollectQueryData(query);reason=status?"PDH初始化失败":"等待两次PDH采样";}
    else if(PdhCollectQueryData(query)!=ERROR_SUCCESS)reason="PDH采样失败";
    else{DWORD bytes=0,count=0;PdhGetFormattedCounterArrayW(counter,PDH_FMT_DOUBLE|PDH_FMT_NOCAP100,&bytes,&count,nullptr);std::vector<char> buffer(bytes);auto values=reinterpret_cast<PDH_FMT_COUNTERVALUE_ITEM_W*>(buffer.data());
        if(bytes&&PdhGetFormattedCounterArrayW(counter,PDH_FMT_DOUBLE|PDH_FMT_NOCAP100,&bytes,&count,values)==ERROR_SUCCESS){std::map<std::wstring,double> own,all;std::set<std::wstring> adapters;auto prefix=L"pid_"+std::to_wstring(GetCurrentProcessId())+L"_";
            for(DWORD i=0;i<count;i++){auto& item=values[i];if(item.FmtValue.CStatus!=0&&item.FmtValue.CStatus!=1)continue;std::wstring name=item.szName;auto pos=name.find(L'_',4);if(pos==std::wstring::npos)continue;auto key=name.substr(pos+1);double value=std::max(0.,item.FmtValue.doubleValue);all[key]+=value;if(name.rfind(prefix,0)==0){own[key]+=value;adapters.insert(key.substr(0,key.find(L"_eng_")));}}
            for(auto& p:own)ownMax=std::max(ownMax,p.second);for(auto& p:all)if(adapters.count(p.first.substr(0,p.first.find(L"_eng_"))))systemMax=std::max(systemMax,p.second);available=!own.empty();if(!available)reason="尚无当前GPU进程的引擎实例";
        }else reason="PDH样本不可用";
    }
    napi_value flag;ok(napi_get_boolean(e,available,&flag));property(e,result,"available",flag);property(e,result,"processMaxEnginePercent",number(e,std::min(100.,ownMax)));property(e,result,"adapterMaxEnginePercent",number(e,std::min(100.,systemMax)));napi_value msg;ok(napi_create_string_utf8(e,reason.c_str(),NAPI_AUTO_LENGTH,&msg));property(e,result,"reason",msg);return result;
}catch(const std::exception&x){return failure(e,x);}}
static napi_value close_monitor(napi_env e,napi_callback_info){if(query)PdhCloseQuery(query);query=nullptr;counter=nullptr;napi_value r;napi_get_undefined(e,&r);return r;}
void register_monitor(napi_env e,napi_value o){method(e,o,"sampleGpu",sample);method(e,o,"closeMonitor",close_monitor);}
