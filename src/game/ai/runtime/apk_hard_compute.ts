/** 困难脚本的可选批量数值后端；不包含游戏规则或神经网络。 */
export interface HardMovementBatch {
    positions: number[][];
    enemyPositions: number[][];
    allyPositions: number[][];
    landingPositions: number[][];
    landingCount: number;
    defenses: number[];
    unitValue: number;
    maxRange: number;
    situation: number | null;
}

export interface HardMovementResult {
    enemy: number[];
    ally: number[];
    landing: number[];
}

export interface ApkHardComputeOptions {
    /** 同视图足够多次查询后可请求精确整数距离场，再按原表达式取整。 */
    distanceField?: (input:{view:Float64Array;rows:number;cols:number;team:number;alliance:number})=>Float64Array;
    distanceFieldThreshold?: number;
    /** 原生纯计算适配器；输入为当前模拟视图，调用期间不改变游戏状态。 */
    nativeCompute?: {
        movementInput(view:Float64Array,costs:Float64Array,alliance:number,air:number,block:number,killed:number,killedAir:number):Float64Array;
        averageDistance(view:Float64Array,cols:number,row:number,col:number,team:number,alliance:number,enemy:number,origin:number,landing:number):number;
        threat(view:Float64Array,positions:Float64Array,team:number,capture:number,kind:number):boolean;
    };
    /** 原脚本提供移动代价与阻挡图，后端必须保留FIFO发现顺序及剩余移动力。 */
    movementRange?: (input: { rows:number; cols:number; row:number; col:number; move:number; costs:number[]|Float64Array; blocked:number[]|Float64Array }) => {row:number;col:number;remaining:number}[];
    /** 不传时使用原有CPU实现；后端必须保持候选顺序和JS双精度取整。 */
    movementBatch?: (input: HardMovementBatch) => HardMovementResult;
    /** 默认保持上游脚本常量；采集时显式匹配场景人口参数。 */
    populationLimit?: number;
    /** 工程验证时直接对照原脚本表达式；生产采集默认关闭重复计算。 */
    verifyMovementBatch?: boolean;
}
