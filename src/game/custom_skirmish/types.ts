export interface CustomSkirmishMap {
    id: string;
    label: string;
    description: string;
    startingGold: number;
    rows: readonly string[];
    // 坐标从 0 开始；指挥官元组为队伍、横坐标、纵坐标。
    commanders: readonly (readonly [0 | 1 | 2 | 3, number, number])[];
    objectives: readonly (readonly [number, number])[];
}
