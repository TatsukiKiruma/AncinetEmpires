import crypto from 'crypto';

export interface FeatureSchema {
    schemaVersion: string;
    rulesRevision: string;
    spatial: {
        height: number;
        width: number;
        channels: number;
        channelNames: string[];
    };
    entities: {
        maxEntities: number;
        featuresPerEntity: number;
        entityFeatureNames: string[];
    };
    global: {
        featureDim: number;
        globalFeatureNames: string[];
    };
    action: {
        actionFeatureDim: number;
        actionFeatureNames: string[];
        actionTypeVocabulary: string[];
    };
    constants: {
        maxCoord: number;
        maxHpScale: number;
        maxGoldScale: number;
        maxTurnsScale: number;
    };
}

/**
 * R6 修复版特征契约：
 * 实体容量提升至 64（覆盖双人 60 单位上限 + pending + 冗余）
 * 严格禁止静默截断！
 */
export const FEATURE_SCHEMA_R6: FeatureSchema = {
    schemaVersion: 'ae-features-r6',
    rulesRevision: 'apk-4.2.5.1-rules-20261013-r4',
    spatial: {
        height: 20,
        width: 20,
        channels: 10,
        channelNames: [
            'valid_tile_mask',
            'defense_bonus_norm',
            'heal_rate_norm',
            'move_cost_base_norm',
            'owner_friendly',
            'owner_enemy',
            'owner_neutral',
            'is_castle',
            'is_town',
            'hp_or_durability_norm'
        ]
    },
    entities: {
        maxEntities: 64, // 扩充至 64
        featuresPerEntity: 16,
        entityFeatureNames: [
            'valid_entity',
            'norm_pos_x',
            'norm_pos_y',
            'is_friendly',
            'is_enemy',
            'hp_norm',
            'max_hp_norm',
            'level_norm',
            'exp_norm',
            'has_acted',
            'has_moved',
            'is_commander',
            'is_pending_recruit',
            'status_blinded',
            'status_poisoned',
            'unit_class_index_norm'
        ]
    },
    global: {
        featureDim: 12,
        globalFeatureNames: [
            'friendly_gold_norm',
            'enemy_gold_norm',
            'friendly_unit_count_norm',
            'enemy_unit_count_norm',
            'friendly_town_count_norm',
            'enemy_town_count_norm',
            'friendly_castle_count_norm',
            'enemy_castle_count_norm',
            'turn_norm',
            'current_player_is_seat0',
            'has_pending_unit',
            'unit_limit_ratio'
        ]
    },
    action: {
        actionFeatureDim: 20,
        actionFeatureNames: [
            'type_one_hot_move',
            'type_one_hot_post_move',
            'type_one_hot_attack',
            'type_one_hot_heal',
            'type_one_hot_support',
            'type_one_hot_occupy',
            'type_one_hot_recruit',
            'type_one_hot_summon',
            'type_one_hot_repair',
            'type_one_hot_end_turn',
            'norm_actor_x',
            'norm_actor_y',
            'norm_target_x',
            'norm_target_y',
            'estimated_damage_norm',
            'is_fatal',
            'estimated_counter_damage_norm',
            'actor_survives',
            'is_commander_action',
            'tactical_priority_weight'
        ],
        actionTypeVocabulary: [
            'move',
            'post_move_action',
            'attack',
            'heal',
            'support',
            'occupy',
            'recruit_to_castle',
            'summon',
            'repair',
            'end_turn'
        ]
    },
    constants: {
        maxCoord: 20.0,
        maxHpScale: 200.0,
        maxGoldScale: 2000.0,
        maxTurnsScale: 100.0
    }
};

export function computeFeatureSchemaHash(schema: FeatureSchema): string {
    const jsonStr = JSON.stringify(schema);
    return crypto.createHash('sha256').update(jsonStr).digest('hex');
}
