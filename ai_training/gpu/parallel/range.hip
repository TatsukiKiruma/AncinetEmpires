// 一个线程计算一个起点，原FIFO队列及左下右上发现顺序保持不变。
__device__ void exact_movement_range(const double* data, double* output, int origin) {
    int rows=(int)data[2], cols=(int)data[3], move=(int)data[4], cells=rows*cols;
    const double* costs=data+8; const double* blocked=costs+cells;
    int best[768], order[768], queuePos[4096], queueRemaining[4096];
    for(int i=0;i<cells;i++){best[i]=-1;order[i]=-1;}
    best[origin]=move;order[origin]=0;int discovered=1,head=0,tail=1;
    queuePos[0]=origin;queueRemaining[0]=move;
    bool overflow=false;
    while(head<tail && !overflow){
        int p=queuePos[head],remaining=queueRemaining[head];head++;
        int row=p/cols,col=p%cols;
        for(int direction=0;direction<4;direction++){
            int r=row+(direction==1?1:direction==3?-1:0);
            int c=col+(direction==0?-1:direction==2?1:0);
            if(r<0||r>=rows||c<0||c>=cols)continue;
            int next=r*cols+c;if(blocked[next]!=0)continue;
            int left=remaining-(int)costs[next];
            // 原JS使用existing || -1，零剩余节点也可能再次入队。
            int existing=best[next]==0?-1:best[next];
            if(left>=0 && left>existing){
                best[next]=left;
                if(tail>=4096){overflow=true;break;}
                queuePos[tail]=next;queueRemaining[tail]=left;tail++;
                if(order[next]<0)order[next]=discovered++;
            }
        }
    }
    int capacity=(int)data[0];
    for(int i=0;i<capacity;i++){output[i*3]=-1;output[i*3+1]=0;output[i*3+2]=0;}
    if(overflow||discovered>capacity){output[0]=-2;return;}
    for(int i=0;i<cells;i++)if(order[i]>=0){int k=order[i]*3;output[k]=i;output[k+1]=best[i];}
}
