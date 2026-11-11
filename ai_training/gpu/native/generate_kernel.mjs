/** 与既有Python生成器使用同一权威评分与范围内核；输出必须逐字节一致。 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
let source=fs.readFileSync(path.join(dir,'../hard_score.hip'),'utf8');
const replace=(a,b)=>{if(source.split(a).length!==2)throw Error('HIP生成锚点无效');source=source.replace(a,b);};
replace('void hard_score(const double* data, double* output) {',`void hard_score_batch(const double* batch, double* output) {
    const double* data = batch + (int)batch[1 + blockIdx.y * 2];
    output += (int)batch[2 + blockIdx.y * 2];`);
replace('int k = blockIdx.x * blockDim.x + threadIdx.x;', 'int k = blockIdx.x;');
replace(`double enemy = mean_distance(row, col, enemy_points, enemies, enemies);
    double ally = mean_distance(row, col, ally_points, allies, allies);
    double moved_ally = mean_distance(row, col, landing_points, landing, (int)data[4]);`, `
    // 输入坐标为有界整数，距离之和小于2^53，并行相加不会改变结果。
    __shared__ double sums[3][64];
    int lane = threadIdx.x;
    double e = 0.0, a = 0.0, l = 0.0;
    for (int i = lane; i < enemies; i += 64) e += fabs(row-enemy_points[2*i])+fabs(col-enemy_points[2*i+1]);
    for (int i = lane; i < allies; i += 64) a += fabs(row-ally_points[2*i])+fabs(col-ally_points[2*i+1]);
    for (int i = lane; i < landing; i += 64) l += fabs(row-landing_points[2*i])+fabs(col-landing_points[2*i+1]);
    sums[0][lane]=e; sums[1][lane]=a; sums[2][lane]=l;
    __syncthreads();
    for (int stride=32; stride>0; stride/=2) {
        if (lane<stride) { sums[0][lane]+=sums[0][lane+stride]; sums[1][lane]+=sums[1][lane+stride]; sums[2][lane]+=sums[2][lane+stride]; }
        __syncthreads();
    }
    if (lane != 0) return;
    double enemy = enemies ? round_distance(sums[0][0]/enemies) : 0.0;
    double ally = allies ? round_distance(sums[1][0]/allies) : 0.0;
    double moved_ally = round_distance(sums[2][0]/data[4]);`);
source=fs.readFileSync(path.join(dir,'distance.hip'),'utf8')+'\n'+fs.readFileSync(path.join(dir,'../parallel/range.hip'),'utf8')+'\n'+source;
replace('    int k = blockIdx.x;',`    if (data[1] == -2) { exact_distance_field(data,output); return; }
    if (data[1] == -1) {
        if (blockIdx.x == 0 && threadIdx.x == 0) exact_movement_range(data, output, (int)data[5]);
        return;
    }
    int k = blockIdx.x;`);
fs.mkdirSync(path.join(dir,'build'),{recursive:true});
fs.writeFileSync(path.join(dir,'build/kernel.hip'),source);
