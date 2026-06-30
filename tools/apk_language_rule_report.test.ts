import { describe, expect, it } from 'vitest';
import { buildApkLanguageRuleReport, parseLanguageEntries } from './apk_language_rule_report';

describe('APK 语言表能力规则复核工具', () => {
    it('解析 key=value 语言表条目', () => {
        expect(parseLanguageEntries([
            '',
            '# comment',
            'P_ABILITY3_DESCRIPTION_7=Healers can heal allies.',
            'P_STATUS3_DESCRIPTION_4=Weakened units lose defence.'
        ].join('\n'))).toEqual({
            P_ABILITY3_DESCRIPTION_7: 'Healers can heal allies.',
            P_STATUS3_DESCRIPTION_4: 'Weakened units lose defence.'
        });
    });

    it('复核 APK 文案支撑的能力/状态行为没有回退', async () => {
        const report = await buildApkLanguageRuleReport();

        expect(report.apkVersion).toBe('aer-release-4.2.5.1');
        expect(report.checkCount).toBe(16);
        expect(report.failedCheckCount).toBe(0);
        expect(report.checks.every(check => check.status === 'pass')).toBe(true);

        const byId = Object.fromEntries(report.checks.map(check => [check.id, check]));
        expect(byId['support-restrictions'].actual).toEqual({
            actedSoldier: true,
            castleCapturer: false,
            assaultTroop: false,
            sameSupporterAbility: false,
            higherLevelTarget: false
        });
        expect(byId['flying-movement-and-defense'].actual).toEqual({
            canMoveThroughGroundEnemy: true,
            canStopOnOccupiedEnemy: false,
            damageToFlyingOnRoad: 30,
            damageToFlyingOnCastle: 30
        });
        expect(byId['combat-modifiers'].actual).toEqual({
            meleeMasterDamage: 97,
            rangedDefenseDamage: 7,
            fightingSpiritDamageAtLowHp: 65,
            normalLowHpDamage: 14,
            deathReaperDamageNormal: 45,
            deathReaperDamageAgainstNegativeStatus: 65,
            sharpshooterDamageToFlying: 15,
            destroyerDamageToVillageTarget: 50
        });
        expect(byId['aura-abilities'].actual).toEqual({
            attackAuraAllyStatus: 'inspired',
            cleansingAuraAllyHp: 60,
            cleansingAuraAllyStatus: null,
            weaknessAuraEnemyStatus: 'weakened'
        });
        expect(byId['summon-and-undead-graves'].actual).toEqual({
            summonerHpAfterUsingGrave: 100,
            skeletonSummoned: true,
            undeadHpAfterConsumingGrave: 60,
            graveRemovedAfterUndeadConsumes: true,
            undeadDeathCreatedGrave: false
        });
    });
});
