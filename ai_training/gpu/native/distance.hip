// 整数曼哈顿距离场；只输出两类精确和与计数，不改变JS取整及假想落点修正。
#include <hip/hip_runtime.h>
__device__ void exact_distance_field(const double* data,double* output){
    int cells=(int)data[0],cols=(int)data[3],e=(int)data[4],a=(int)data[5],lane=threadIdx.x;
    const double* enemy=data+8;const double* ally=enemy+e*2;
    __shared__ int sums[2][64];
    // 限制距离场的网格宽度，避免混合批次为范围请求生成大量空块。
    for(int cell=blockIdx.x;cell<cells;cell+=gridDim.x){int row=cell/cols,col=cell%cols,es=0,as=0;
    for(int i=lane;i<e;i+=64)es+=abs(row-(int)enemy[i*2])+abs(col-(int)enemy[i*2+1]);
    for(int i=lane;i<a;i+=64)as+=abs(row-(int)ally[i*2])+abs(col-(int)ally[i*2+1]);
    sums[0][lane]=es;sums[1][lane]=as;__syncthreads();
    for(int stride=32;stride>0;stride/=2){if(lane<stride){sums[0][lane]+=sums[0][lane+stride];sums[1][lane]+=sums[1][lane+stride];}__syncthreads();}
    if(lane==0){output[cell*3]=sums[0][0];output[cell*3+1]=sums[1][0];output[cell*3+2]=e*2048+a;}
    __syncthreads();
    }
}
