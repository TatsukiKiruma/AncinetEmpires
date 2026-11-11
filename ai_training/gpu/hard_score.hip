// 困难AI候选距离和落点评分：每个线程处理一个候选，保持JS双精度运算顺序。
#include <hip/hip_runtime.h>
#pragma clang fp contract(off)
__device__ double round_distance(double value) {
    return floor((value + 2.220446049250313e-16) * 100.0 + 0.5) / 100.0;
}
__device__ double mean_distance(double row, double col, const double* points, int size, int denominator) {
    if (!denominator) return 0.0;
    double sum = 0.0;
    for (int i = 0; i < size; ++i) sum += fabs(row - points[i * 2]) + fabs(col - points[i * 2 + 1]);
    return round_distance(sum / denominator);
}
extern "C" __global__ void hard_score(const double* data, double* output) {
    int k = blockIdx.x * blockDim.x + threadIdx.x;
    int n = (int)data[0], enemies = (int)data[1], allies = (int)data[2], landing = (int)data[3];
    if (k >= n) return;
    const double* positions = data + 8;
    const double* enemy_points = positions + 2 * n;
    const double* ally_points = enemy_points + 2 * enemies;
    const double* landing_points = ally_points + 2 * allies;
    const double* defenses = landing_points + 2 * landing;
    double row = positions[2 * k], col = positions[2 * k + 1];
    double enemy = mean_distance(row, col, enemy_points, enemies, enemies);
    double ally = mean_distance(row, col, ally_points, allies, allies);
    double moved_ally = mean_distance(row, col, landing_points, landing, (int)data[4]);
    double gap = round_distance(moved_ally - enemy), defense = defenses[k] - 10.0, score = 0.0;
    if (gap > 0) score = -(gap - data[7] + 1.0) * data[5] / 10.0 + defense * 2.0;
    else if (gap >= -1) score = gap * 10.0 + defense * 2.0;
    else if (gap >= -2) score = (gap + data[6] - 1.0) * 10.0 + defense;
    output[k * 3] = enemy; output[k * 3 + 1] = ally; output[k * 3 + 2] = score;
}
