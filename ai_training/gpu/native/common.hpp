// Node-API边界集中校验；数值计算与HIP调度分别实现。
#pragma once
#include <node_api.h>
#include <cmath>
#include <cstring>
#include <stdexcept>
#include <string>
#include <vector>
inline void ok(napi_status s){if(s!=napi_ok)throw std::runtime_error("Node-API调用失败");}
inline napi_value number(napi_env e,double n){napi_value v;ok(napi_create_double(e,n,&v));return v;}
inline double scalar(napi_env e,napi_value v){double n;ok(napi_get_value_double(e,v,&n));if(!std::isfinite(n))throw std::runtime_error("参数必须有限");return n;}
inline std::string string(napi_env e,napi_value v){size_t n;ok(napi_get_value_string_utf8(e,v,nullptr,0,&n));std::string s(n,'\0');ok(napi_get_value_string_utf8(e,v,s.data(),n+1,&n));return s;}
struct Array {double* p;size_t n;};
inline Array array(napi_env e,napi_value v){napi_typedarray_type type;size_t n,offset;void* p;napi_value buffer;ok(napi_get_typedarray_info(e,v,&type,&n,&p,&buffer,&offset));if(type!=napi_float64_array)throw std::runtime_error("需要Float64Array");return {static_cast<double*>(p),n};}
inline napi_value vector(napi_env e,const std::vector<double>& data){void* p;napi_value buffer,result;ok(napi_create_arraybuffer(e,data.size()*8,&p,&buffer));if(!data.empty())std::memcpy(p,data.data(),data.size()*8);ok(napi_create_typedarray(e,napi_float64_array,data.size(),buffer,0,&result));return result;}
inline void property(napi_env e,napi_value o,const char* key,napi_value v){ok(napi_set_named_property(e,o,key,v));}
inline void method(napi_env e,napi_value o,const char* key,napi_callback fn){napi_value v;ok(napi_create_function(e,key,NAPI_AUTO_LENGTH,fn,nullptr,&v));property(e,o,key,v);}
inline napi_value failure(napi_env e,const std::exception& error){napi_throw_error(e,nullptr,error.what());return nullptr;}
inline std::vector<napi_value> arguments(napi_env e,napi_callback_info info,size_t n){std::vector<napi_value>a(n);size_t count=n;ok(napi_get_cb_info(e,info,&count,a.data(),nullptr,nullptr));if(count!=n)throw std::runtime_error("参数数量无效");return a;}
void register_cpu(napi_env,napi_value);
void register_hip(napi_env,napi_value);
void register_monitor(napi_env,napi_value);
