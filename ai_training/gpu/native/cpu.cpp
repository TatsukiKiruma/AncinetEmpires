// 只处理原脚本编码后的当前视图，不维护引擎步号缓存或另写游戏规则。
#include "common.hpp"
#include <limits>
static int integer(double n,int low,int high){if(!std::isfinite(n)||n!=std::floor(n)||n<low||n>high)throw std::runtime_error("整数参数越界");return static_cast<int>(n);}
static int view_size(Array v){if(v.n%8||v.n==0||v.n>768*8)throw std::runtime_error("地图视图布局无效");return static_cast<int>(v.n/8);}
// 每格：地形索引、建筑种类、建筑队伍、建筑联盟、单位队伍、单位联盟、空军、待命。
static napi_value movement(napi_env e,napi_callback_info info){try{
    auto a=arguments(e,info,7);auto v=array(e,a[0]),costs=array(e,a[1]);int cells=view_size(v);
    double alliance=scalar(e,a[2]);bool air=scalar(e,a[3])!=0,block=scalar(e,a[4])!=0;int killed=integer(scalar(e,a[5]),-1,cells-1);bool killedAir=scalar(e,a[6])!=0;
    std::vector<double> out(cells*2);
    for(int i=0;i<cells;i++){auto p=v.p+i*8;int terrain=integer(p[0],0,static_cast<int>(costs.n)-1);out[i]=costs.p[terrain];integer(out[i],1,1000000);out[cells+i]=block&&(i==killed?(!air||killedAir):(p[4]!=0&&alliance!=0&&p[5]!=0&&p[5]!=alliance&&(!air||(static_cast<int>(p[6])&1))));}
    return vector(e,out);
}catch(const std::exception&x){return failure(e,x);}}
static double rounded(double n){return std::floor((n+std::numeric_limits<double>::epsilon())*100.+.5)/100.;}
static napi_value average(napi_env e,napi_callback_info info){try{
    auto a=arguments(e,info,9);auto v=array(e,a[0]);int cells=view_size(v),cols=integer(scalar(e,a[1]),1,768);if(cells%cols)throw std::runtime_error("地图列数无效");
    double row=scalar(e,a[2]),col=scalar(e,a[3]),team=scalar(e,a[4]),alliance=scalar(e,a[5]);bool enemy=scalar(e,a[6])!=0;int origin=integer(scalar(e,a[7]),-1,cells-1),landing=integer(scalar(e,a[8]),-1,cells-1);
    if(!team)return number(e,999);double total=0;int count=0;
    for(int i=0;i<cells;i++){auto p=v.p+i*8;double d=std::abs(row-i/cols)+std::abs(col-i%cols);
        if(p[4]!=0&&((p[5]!=alliance)==enemy)&&!(!enemy&&origin>=0&&landing>=0&&(i==origin||i==landing))){total+=d;count++;}
        if((static_cast<int>(p[1])&4)&&p[2]!=0&&(enemy?p[3]!=alliance:p[2]==team)){total+=d;count++;}
    }
    if(!enemy&&landing>=0){total+=std::abs(row-landing/cols)+std::abs(col-landing%cols);count++;}
    return number(e,count?rounded(total/count):999);
}catch(const std::exception&x){return failure(e,x);}}
static napi_value threat(napi_env e,napi_callback_info info){try{
    auto a=arguments(e,info,5);auto v=array(e,a[0]),positions=array(e,a[1]);int cells=view_size(v);double team=scalar(e,a[2]);bool capture=scalar(e,a[3])!=0;int kind=integer(scalar(e,a[4]),0,3);bool result=false;
    for(size_t j=0;j<positions.n;j++){int i=integer(positions.p[j],0,cells-1);auto p=v.p+i*8;int building=static_cast<int>(p[1])&3;if(!team||p[2]!=team||building==0||(kind&&building!=kind))continue;if((building==1&&capture)||(building==2&&!((static_cast<int>(p[6])&2)&&p[7]!=0))){result=true;break;}}
    napi_value r;ok(napi_get_boolean(e,result,&r));return r;
}catch(const std::exception&x){return failure(e,x);}}
static napi_value pack_fields(napi_env e,napi_callback_info info){try{
    auto a=arguments(e,info,4);auto v=array(e,a[0]);int cells=view_size(v),cols=integer(scalar(e,a[1]),1,768);if(cells%cols)throw std::runtime_error("距离场列数无效");double team=scalar(e,a[2]),alliance=scalar(e,a[3]);if(!team||!alliance)throw std::runtime_error("距离场队伍无效");std::vector<double> enemies,allies;
    for(int i=0;i<cells;i++){auto p=v.p+i*8;auto append=[&](std::vector<double>& points){points.push_back(i/cols);points.push_back(i%cols);};if(p[4])append(p[5]!=alliance?enemies:allies);if((static_cast<int>(p[1])&4)&&p[2]){if(p[3]!=alliance)append(enemies);else if(p[2]==team)append(allies);}}
    std::vector<double> out={static_cast<double>(cells),-2,static_cast<double>(cells/cols),static_cast<double>(cols),enemies.size()/2.,allies.size()/2.,0,0};out.insert(out.end(),enemies.begin(),enemies.end());out.insert(out.end(),allies.begin(),allies.end());return vector(e,out);
}catch(const std::exception&x){return failure(e,x);}}
void register_cpu(napi_env e,napi_value o){method(e,o,"movementInput",movement);method(e,o,"averageDistance",average);method(e,o,"threat",threat);method(e,o,"packDistanceField",pack_fields);}
