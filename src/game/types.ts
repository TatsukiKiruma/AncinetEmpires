import { Tile } from './terrain';

export interface Position {
    x: number;
    y: number;
}

export type UnitClass = 'soldier' | 'ghost' | 'mermaid' | 'archer' | 'slime' | 'water_elemental' | 'dark_mage' | 'witch' | 'paladin' | 'elf' | 'berserker' | 'wolf' | 'golem' | 'ice_elemental' | 'druid' | 'catapult' | 'wolf_archer' | 'dragon' | 'commander' | 'skeleton' | 'crystal';
export type Ability = 'village_capturer' | 'castle_capturer' | 'repairer' | 'flying' | 'undead' | 'death_reaper' | 'water_child' | 'sharpshooter' | 'self_repair' | 'blinder' | 'summoner' | 'healer' | 'cleansing_aura' | 'fighting_spirit' | 'counter_storm' | 'earth_child' | 'poisoner' | 'ranged_defense' | 'mountain_child' | 'weakness_aura' | 'attack_aura' | 'supporter' | 'destroyer' | 'forest_child' | 'assault_troop' | 'melee_master';

export type StatusType = "poisoned" | "inspired" | "blinded" | "weakened";

export interface UnitStatus {
  type: StatusType;
  remainingTicks?: number;
  remainingTurns?: number;
}

export interface Grave {
    id: string;
    pos: Position;
    remainingTurns: number;
    ownerId?: number; // APK 墓碑覆盖层低 12 位记录所属队伍；只在该队 TURN_START 时递减
}

export interface Unit {
    id: string;      // 单位唯一ID
    ownerId: number; // 归属玩家ID
    unitClass: UnitClass; // 兵种
    pos: Position;   // 当前位置
    hp: number;      // 当前血量
    maxHp: number;   // 最大血量
    hasMoved: boolean; // 本回合是否已移动
    hasActed: boolean; // 本回合是否已行动
    status?: UnitStatus; // 单位状态
    level?: UnitLevel; // 经验等级
    exp?: number;          // 经验值
    movementRemaining?: number; // 突击部队剩余移动力
    hasPostAttackMoved?: boolean; // 突击部队是否执行了攻击后移动
    hasBeenHealedThisTurn?: boolean; // 本回合是否被治疗过
    hasBeenSupportedThisTurn?: boolean; // 本回合是否被支援过
    apkPendingRecruitSource?: 'empty_castle' | 'commander_castle'; // APK 招募待处理来源；空城堡 pending 与指挥官堆叠招募 pending 的菜单限制不同
    apkUnitId?: number; // APK .aem 原始单位 ID，仅导入 APK 地图时存在
    apkUnitExtra?: number; // APK .aem 单位记录 extra 字段；语义未确认，仅保留证据
    apkUnitCode?: string; // APK 脚本层单位 code，用于 Stage.GetUnit/SyncSetUnitCode 查询
    apkStatic?: boolean; // APK 脚本层静态单位标记，静态单位不生成行动
    apkTargeted?: boolean; // APK 脚本层目标单位标记，用于训练侧观察目标状态
    apkUnitHead?: number; // APK 脚本层单位 head/头像 ID，仅作为元数据透传
    apkMoveOverrides?: Record<number, number>; // APK SyncOverrideMov：按 tile type 覆盖该单位进入地形的移动消耗
}

export interface PlayerState {
    id: number;
    gold: number;
    isAlive: boolean; // 如果指挥官死亡或大本营被占领，变为false
    commanderDeathCount: number; // 指挥官死亡次数
    commanderReserveLevel?: UnitLevel; // 指挥官阵亡后保留的等级，用于 APK skirmish 重招募
    commanderReserveExp?: number; // 指挥官阵亡后保留的经验，用于 APK skirmish 重招募
}

export type UnitLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type LevelCap = UnitLevel;

export type ApkSkirmishMode = 'SD' | 'SO';

export interface ApkSkirmishNumericSetupOption {
    default: number;
    min: number;
    max: number;
    step: number;
}

export interface ApkSkirmishSetupOptions {
    initialGold: ApkSkirmishNumericSetupOption;
    unitLimit: ApkSkirmishNumericSetupOption;
    levelCap: ApkSkirmishNumericSetupOption;
    modes: {
        default: ApkSkirmishMode;
        options: readonly ApkSkirmishMode[];
        labels: Record<ApkSkirmishMode, string>;
    };
}

export interface GameMetadata {
    source?: 'demo' | 'apk_aem'; // 状态来源，用于训练样本追踪
    apkVersion?: string;         // APK 版本号，例如 aer-release-4.2.5.1
    apkSha256?: string;          // APK 文件 SHA256，用于锁定规则证据来源
    apkResourcePath?: string;    // APK 内资源路径，例如 assets/maps/(2) Duel.aem
    apkMapName?: string;         // APK .aem 地图资源名
    apkSkirmishMode?: ApkSkirmishMode; // APK 对战模式
    apkSkirmishTrainingScenarioId?: string; // APK skirmish 训练场景稳定 ID，例如 SO:(2) Duel.aem
    apkSkirmishSetupOptions?: ApkSkirmishSetupOptions; // APK 遭遇战开局设置范围，供训练端复现实验配置
    recommendedGold?: number | null; // AEM 推荐金币，null 表示 APK 未设置
    apkTailTemplate?: string;    // AEM 推荐金币后的尾部模板名
    apkApproximateTerrainIds?: number[]; // 当前 AEM 地图中低可信近似映射的 APK tile ID
    apkApproximateTileCount?: number; // 当前 AEM 地图中低可信近似映射 tile 总数
    apkUnmappedTerrainIds?: number[]; // 当前 AEM 地图中未映射的 APK tile ID
    apkUnmappedTileCount?: number; // 当前 AEM 地图中未映射 tile 总数
    apkRuleScriptResourcePath?: string; // 生成当前规则配置的 APK 脚本资源路径
    apkRuleScriptIgnoredRestoreTeamIds?: number[]; // 静态规则生成时忽略的 SyncRestoreTeam 调用
    apkRuleScriptIgnoredGameOverAllianceIds?: number[]; // 静态规则生成时忽略的 SyncGameOver 调用
    apkRuleScriptWarnings?: string[]; // APK 脚本字面量规则转换警告
    apkStageStateScriptResourcePath?: string; // 应用单位/坐标状态配置的 APK 脚本资源路径
    apkStageStateAppliedSyncOverrideMovCount?: number; // 已应用的 SyncOverrideMov 调用数
    apkStageStateAppliedSyncSetUnitStatusCount?: number; // 已应用的 SyncSetUnitStatus 调用数
    apkStageStateScriptWarnings?: string[]; // APK 单位/坐标状态配置应用警告
}

export interface ApkScriptState {
    booleans?: Record<string, boolean>; // APK Stage.PutBoolean/GetBoolean 脚本变量
    integers?: Record<string, number>;  // APK Stage.PutInteger/GetInteger 脚本变量
}

export interface TeamRuleConfig {
    initialGold?: number;        // 队伍初始金币
    unitLimit?: number;          // 队伍单位数量上限
    populationLimit?: number;    // 队伍人口上限
    recruitableUnits?: UnitClass[]; // 队伍允许招募的单位列表
}

export interface CampaignArea {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

export interface CampaignUnitSelector {
    teamId?: number;
    unitId?: string;
    unitCode?: string;
    unitClass?: UnitClass;
    commanderOfTeam?: number;
    pos?: Position;
    area?: CampaignArea;
}

export type CampaignEventTrigger =
    | {
        type: 'turn_start';
        playerId?: number;
        turn?: number;
        minTurn?: number;
        maxTurn?: number;
        everyTurns?: number;
    }
    | {
        type: 'unit_standby';
        selector?: CampaignUnitSelector;
    }
    | {
        type: 'unit_destroyed';
        selector?: CampaignUnitSelector;
    }
    | {
        type: 'tile_occupied';
        pos?: Position;
        ownerId?: number;
        previousOwnerId?: number | null;
    };

export interface CampaignReinforcement {
    unitClass: UnitClass;
    teamId: number;
    pos: Position;
    level?: UnitLevel;
    hp?: number;
    head?: number;
    code?: string;
    static?: boolean;
    targeted?: boolean;
    hasActed?: boolean;
}

export type CampaignEventEffect =
    | { type: 'create_unit'; unit: CampaignReinforcement }
    | { type: 'reinforce'; units: CampaignReinforcement[] }
    | { type: 'damage_units'; selector?: CampaignUnitSelector; amount: number }
    | { type: 'change_unit_hp'; selector?: CampaignUnitSelector; delta: number }
    | { type: 'change_unit_team'; selector?: CampaignUnitSelector; teamId: number; resetStatus?: boolean }
    | { type: 'destroy_units'; selector?: CampaignUnitSelector }
    | { type: 'remove_units'; selector?: CampaignUnitSelector }
    | { type: 'move_unit'; selector?: CampaignUnitSelector; to: Position; endAction?: boolean }
    | { type: 'set_tile'; pos: Position; terrainId?: number; ownerId?: number | null }
    | { type: 'restore_team'; teamId: number }
    | { type: 'disable_team'; teamId: number }
    | { type: 'destroy_team'; teamId: number }
    | { type: 'set_alliance'; teamId: number; allianceId: number }
    | { type: 'game_over'; allianceId: number }
    | { type: 'set_boolean'; key: string; value: boolean }
    | { type: 'set_integer'; key: string; value: number }
    | { type: 'change_gold'; teamId: number; delta: number }
    | { type: 'set_current_team'; teamId: number };

export interface CampaignEventConfig {
    id: string;
    trigger: CampaignEventTrigger;
    effects: CampaignEventEffect[];
    once?: boolean;
    enabled?: boolean;
}

export interface RuleConfig {
    initialGold?: number;             // 全局初始金币，队伍配置可覆盖
    incomeVillage?: number;          // 村庄每回合收入
    incomeCastle?: number;           // 城堡每回合收入
    incomeCommanderBase?: number;    // 指挥官存活基础收入
    incomeCommanderGrowth?: number;  // 指挥官每级收入成长
    levelCap?: LevelCap;             // 等级上限
    destroyerAttackBonus?: number;   // APK C0611d.f1272a：破坏者攻击可摧毁地形单位加攻
    flyingWaterAttackBonus?: number; // APK C0611d.f1273b：飞行单位攻击水上非飞行单位加攻
    deathReaperAttackBonus?: number; // APK C0611d.f1274c：死神攻击负面状态单位加攻
    inspiredAttackBonus?: number;    // APK C0611d.f1275d：鼓舞攻击加成，远程时减半
    sharpshooterAttackBonus?: number; // APK C0611d.f1276e：神射手攻击飞行单位加攻
    terrainChildCombatBonus?: number; // APK C0611d.f1277f：地形之子攻防加成
    weakenedDefensePenalty?: number; // APK C0611d.f1266E：虚弱防御惩罚，远程时减半
    unitLimit?: number;              // 全局单位数量上限，队伍配置可覆盖
    populationLimit?: number;        // 全局人口上限，队伍配置可覆盖
    recruitableUnits?: UnitClass[];  // 全局允许招募单位列表，队伍配置可覆盖
    prices?: Partial<Record<UnitClass, number | null>>; // 单位价格覆盖，null 表示不可招募
    commanderRecruitBaseCost?: number | null; // 指挥官重招募基础价格，null 表示禁用
    commanderRecruitCostGrowth?: number;      // 每次指挥官死亡后的价格增量
    allowSurrender?: boolean;       // 是否允许玩家主动投降；APK skirmish 菜单存在投降入口
    allowPendingRecruitEndTurn?: boolean; // APK skirmish：空城堡招募 pending 时仍允许结束回合
    allowPendingRecruitSurrender?: boolean; // APK skirmish：空城堡招募 pending 时仍允许投降
    commanderCastleRecruitUsesPending?: boolean; // APK 多人：指挥官站城堡招募时先生成堆叠 pending 单位，再由下一条动作移出
    defeatOnNoUnitsAndNoCastles?: boolean; // APK skirmish：同时无单位且无城堡时淘汰
    defeatOnNoUnits?: boolean;        // 无存活单位时淘汰
    defeatOnCommanderDeath?: boolean; // 无存活指挥官时淘汰
    defeatOnNoCastles?: boolean;      // 无己方城堡时淘汰
    alliances?: Record<number, number>; // 队伍到联盟 ID 的映射；未配置时每队自成联盟
    disabledTeams?: number[];         // 被脚本/配置禁用的队伍；禁用队伍不参与回合和胜负判定
    commanderUnitIds?: Record<number, string>; // 脚本指定的队伍指挥官单位 ID；未配置时按 commander 兵种判断
    campaignEvents?: CampaignEventConfig[]; // APK 战役脚本事件的静态化表达；用于训练复现刷兵、胜负、改队伍等中途变化
    teams?: Record<number, TeamRuleConfig>;
}

export interface GameState {
    turn: number;            // 游戏总回合数
    currentPlayer: number;   // 当前行动的玩家ID (例如 0, 1)
    map: {
        width: number;
        height: number;
        tiles: Tile[][]; // 二维数组, tiles[y][x]
    };
    units: Unit[];           // 场上所有单位
    players: PlayerState[];  // 玩家状态
    winner: number | null;   // 获胜联盟ID，未结束则为null，-1 表示平局
    graves?: Grave[];        // 墓碑中立列表
    nextUnitId?: number;     // 确定性单位ID计数
    nextGraveId?: number;    // 确定性墓碑ID计数
    pendingUnitId?: string;  // 当前待处理单位ID (例如刚从城堡招募出来，必须优先行动)
    rules?: RuleConfig;      // APK/关卡层可覆盖的规则配置
    metadata?: GameMetadata;  // 地图/来源元数据，不参与规则判定
    apkScriptState?: ApkScriptState; // APK 脚本变量状态，仅供 Stage 查询/目标判断适配使用
}

/** 动作必须是结构化对象 */
export type Action =
    | { type: 'move'; unitId: string; to: Position }
    | { type: 'attack'; attackerId: string; targetId: string }
    | { type: 'capture'; unitId: string }
    | { type: 'repair'; unitId: string }
    | { type: 'wait'; unitId: string }
    | { type: 'recruit_to_castle'; unitClass: UnitClass; castlePos: Position } 
    | { type: 'recruit_and_deploy'; unitClass: UnitClass; castlePos: Position; to: Position } 
    | { type: 'heal'; healerId: string; targetId: string }
    | { type: 'summon'; summonerId: string; graveId: string; spawnPos: Position }
    | { type: 'support'; supporterId: string; targetId: string }
    | { type: 'destroy_town'; unitId: string; target?: Position }
    | { type: 'post_attack_move'; unitId: string; to: Position }
    | { type: 'surrender' }
    | { type: 'end_turn' };

export interface StepResult {
    state: GameState;
    reward: number;
    done: boolean;
    info: string;
}
