import { Ability, StatusType, UnitClass } from './types';

export const APK_UNIT_ID_TO_CLASS: Record<number, UnitClass> = {
    0: 'soldier',
    1: 'archer',
    2: 'water_elemental',
    3: 'witch',
    4: 'elf',
    5: 'wolf',
    6: 'golem',
    7: 'catapult',
    8: 'dragon',
    9: 'commander',
    10: 'skeleton',
    11: 'crystal',
    12: 'paladin',
    13: 'berserker',
    14: 'ghost',
    15: 'dark_mage',
    16: 'wolf_archer',
    17: 'ice_elemental',
    18: 'slime',
    19: 'mermaid',
    20: 'druid',
};

export const APK_UNIT_CLASS_TO_ID = Object.fromEntries(
    Object.entries(APK_UNIT_ID_TO_CLASS).map(([apkUnitId, unitClass]) => [unitClass, Number(apkUnitId)])
) as Record<UnitClass, number>;

export const APK_STATUS_ID_TO_TYPE: Record<number, StatusType> = {
    1: 'poisoned',
    2: 'inspired',
    3: 'blinded',
    4: 'weakened',
};

export const APK_STATUS_TYPE_TO_ID = Object.fromEntries(
    Object.entries(APK_STATUS_ID_TO_TYPE).map(([apkStatusId, statusType]) => [statusType, Number(apkStatusId)])
) as Record<StatusType, number>;

export const APK_ABILITY_ID_TO_TYPE: Record<number, Ability> = {
    0: 'village_capturer',
    1: 'castle_capturer',
    2: 'repairer',
    3: 'flying',
    4: 'sharpshooter',
    5: 'destroyer',
    6: 'summoner',
    7: 'healer',
    8: 'poisoner',
    9: 'undead',
    10: 'melee_master',
    11: 'ranged_defense',
    12: 'water_child',
    13: 'forest_child',
    14: 'mountain_child',
    15: 'fighting_spirit',
    16: 'counter_storm',
    17: 'self_repair',
    18: 'attack_aura',
    19: 'cleansing_aura',
    20: 'weakness_aura',
    21: 'assault_troop',
    22: 'earth_child',
    23: 'blinder',
    24: 'supporter',
    25: 'death_reaper',
};

export const APK_ABILITY_TYPE_TO_ID = Object.fromEntries(
    Object.entries(APK_ABILITY_ID_TO_TYPE).map(([apkAbilityId, ability]) => [ability, Number(apkAbilityId)])
) as Record<Ability, number>;
