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

export const FEATURE_SCHEMA_V1: FeatureSchema = {
    schemaVersion: 'ae-features-v1',
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
        maxEntities: 48,
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
            'type_one_hot_summon',
            'type_one_hot_recruit_castle',
            'type_one_hot_recruit_deploy',
            'type_one_hot_capture',
            'type_one_hot_repair',
            'type_one_hot_destroy_town',
            'type_one_hot_wait',
            'type_one_hot_end_turn',
            'type_one_hot_surrender',
            'actor_entity_index_norm',
            'target_entity_index_norm',
            'target_pos_x_norm',
            'target_pos_y_norm',
            'recruited_class_norm',
            'has_target'
        ],
        actionTypeVocabulary: [
            'move',
            'post_attack_move',
            'attack',
            'heal',
            'support',
            'summon',
            'recruit_to_castle',
            'recruit_and_deploy',
            'capture',
            'repair',
            'destroy_town',
            'wait',
            'end_turn',
            'surrender'
        ]
    },
    constants: {
        maxCoord: 20.0,
        maxHpScale: 200.0, // 支持超上限 190 HP 等不被截断
        maxGoldScale: 1000.0,
        maxTurnsScale: 100.0
    }
};

export function computeSchemaHash(schema: FeatureSchema = FEATURE_SCHEMA_V1): string {
    const jsonStr = JSON.stringify(schema);
    return crypto.createHash('sha256').update(jsonStr).digest('hex');
}
