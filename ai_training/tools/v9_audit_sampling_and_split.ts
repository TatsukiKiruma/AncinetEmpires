import * as fs from 'node:fs';
import * as path from 'node:path';
import { GameEngine } from '../src/game/engine';
import { createDemoState } from '../src/game/demo_map';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { GameState } from '../src/game/types';
import {
    getBehavioralStateHash,
    splitMix32,
    V7_MAPS,
    GOLD_OFFSETS,
    SPLITMIX_CONSTANTS
} from './v7_training_pipeline';

const RUN_ID = process.env.RUN_ID || 'agent_upgrade_20260922_v9_identity_02';
const REPORT_DIR = path.resolve(`docs/training/reports/${RUN_ID}`);
const RUN_DIR = path.resolve(`training_runs/${RUN_ID}`);

function runHashAudit(): any {
    const rules = getApkSkirmishRuleConfig('SD');
    const base = createDemoState(rules);
    const baseHash = getBehavioralStateHash(base, 0);

    const checks: Record<string, { description: string; pass: boolean; hashDiffers: boolean }> = {};

    // 1. commanderReserveLevel
    const sReserveLvl = JSON.parse(JSON.stringify(base)) as GameState;
    sReserveLvl.players[0].commanderReserveLevel = 3 as any;
    const hReserveLvl = getBehavioralStateHash(sReserveLvl, 0);
    checks['commanderReserveLevel'] = {
        description: 'Changing commanderReserveLevel alters state hash',
        pass: hReserveLvl !== baseHash,
        hashDiffers: hReserveLvl !== baseHash
    };

    // 2. commanderReserveExp
    const sReserveExp = JSON.parse(JSON.stringify(base)) as GameState;
    sReserveExp.players[0].commanderReserveExp = 80;
    const hReserveExp = getBehavioralStateHash(sReserveExp, 0);
    checks['commanderReserveExp'] = {
        description: 'Changing commanderReserveExp alters state hash',
        pass: hReserveExp !== baseHash,
        hashDiffers: hReserveExp !== baseHash
    };

    // 3. hasMoved
    const sMoved = JSON.parse(JSON.stringify(base)) as GameState;
    sMoved.units[0].hasMoved = true;
    const hMoved = getBehavioralStateHash(sMoved, 0);
    checks['hasMoved'] = {
        description: 'Unit movement status alters state hash',
        pass: hMoved !== baseHash,
        hashDiffers: hMoved !== baseHash
    };

    // 4. hasActed
    const sActed = JSON.parse(JSON.stringify(base)) as GameState;
    sActed.units[0].hasActed = true;
    const hActed = getBehavioralStateHash(sActed, 0);
    checks['hasActed'] = {
        description: 'Unit action status alters state hash',
        pass: hActed !== baseHash,
        hashDiffers: hActed !== baseHash
    };

    // 5. pendingUnitId
    const sPending = JSON.parse(JSON.stringify(base)) as GameState;
    sPending.pendingUnitId = 'u_pending_123';
    const hPending = getBehavioralStateHash(sPending, 0);
    checks['pendingUnitId'] = {
        description: 'Active pendingUnitId alters state hash',
        pass: hPending !== baseHash,
        hashDiffers: hPending !== baseHash
    };

    // 6. Building ownership
    const sBuilding = JSON.parse(JSON.stringify(base)) as GameState;
    sBuilding.map.tiles[0][0].ownerId = 1;
    const hBuilding = getBehavioralStateHash(sBuilding, 0);
    checks['buildingOwnership'] = {
        description: 'Castle/town ownership alters state hash',
        pass: hBuilding !== baseHash,
        hashDiffers: hBuilding !== baseHash
    };

    // 7. Unit status (poisoned)
    const sStatus = JSON.parse(JSON.stringify(base)) as GameState;
    sStatus.units[0].status = { type: 'poisoned', remainingTurns: 2 };
    const hStatus = getBehavioralStateHash(sStatus, 0);
    checks['unitStatus'] = {
        description: 'Status effects alter state hash',
        pass: hStatus !== baseHash,
        hashDiffers: hStatus !== baseHash
    };

    // 8. Canonical ID invariance
    const sRenamed = JSON.parse(JSON.stringify(base)) as GameState;
    sRenamed.units[0].id = 'arbitrary_new_id_999';
    sRenamed.units[1].id = 'arbitrary_new_id_888';
    const hRenamed = getBehavioralStateHash(sRenamed, 0);
    checks['canonicalIdInvariance'] = {
        description: 'Tactically identical state with renamed IDs preserves identical hash',
        pass: hRenamed === baseHash,
        hashDiffers: hRenamed !== baseHash
    };

    const allPassed = Object.values(checks).every(c => c.pass);

    return {
        runId: RUN_ID,
        auditDate: new Date().toISOString(),
        allDimensionsVerified: allPassed,
        baseHash,
        checks
    };
}

function runSamplingCoverageAudit(): any {
    const mapCount = V7_MAPS.length;
    const goldOffsets = Array.from(GOLD_OFFSETS);
    const episodeCount = 300;

    const mapGoldPairs = new Set<string>();
    const rootIds = new Set<string>();
    const perMapGoldDist: Record<string, Set<number>> = {};

    for (const m of V7_MAPS) {
        perMapGoldDist[m.name] = new Set<number>();
    }

    for (let ep = 1; ep <= episodeCount; ep++) {
        const mapInfo = V7_MAPS[ep % V7_MAPS.length];
        const seed = 10000 + ep;
        const rootId = `root_${mapInfo.name.replace(/[^a-zA-Z0-9]/g, '_')}_seed_${seed}`;
        rootIds.add(rootId);

        const goldRand0 = splitMix32(seed * SPLITMIX_CONSTANTS.MULTIPLIER_0 + SPLITMIX_CONSTANTS.OFFSET_0) % goldOffsets.length;
        mapGoldPairs.add(`${mapInfo.name}:${goldOffsets[goldRand0]}`);
        perMapGoldDist[mapInfo.name].add(goldOffsets[goldRand0]);
    }

    const goldDiversityPerMap: Record<string, number> = {};
    for (const [mName, set] of Object.entries(perMapGoldDist)) {
        goldDiversityPerMap[mName] = set.size;
    }

    return {
        runId: RUN_ID,
        auditDate: new Date().toISOString(),
        totalEpisodesAudited: episodeCount,
        uniqueRootFamiliesGenerated: rootIds.size,
        rootCollisionsFound: episodeCount - rootIds.size, // MUST BE 0!
        distinctMapGoldCombinations: mapGoldPairs.size,
        maxPossibleCombinations: mapCount * goldOffsets.length,
        coveragePercentage: Number(((mapGoldPairs.size / (mapCount * goldOffsets.length)) * 100).toFixed(1)),
        goldOffsetsAudited: goldOffsets,
        goldDiversityPerMap,
        verdict: rootIds.size === episodeCount && mapGoldPairs.size === mapCount * goldOffsets.length
            ? 'QUALIFIED_DECOUPLED'
            : 'COUPLED_OR_COLLIDED'
    };
}

function runSplitAudit(): any {
    const splitPath = path.resolve(`training_runs/${RUN_ID}/split_manifest.json`);
    let splitManifest: any = null;
    let leakageCount = 0;
    let trainRoots: string[] = [];
    let valRoots: string[] = [];
    let duelInTrainCount = 0;
    let libertyPortInTrainCount = 0;

    if (fs.existsSync(splitPath)) {
        splitManifest = JSON.parse(fs.readFileSync(splitPath, 'utf8'));
        trainRoots = splitManifest.trainRootFamilies ?? [];
        valRoots = splitManifest.valRootFamilies ?? [];

        const trainSet = new Set(trainRoots);
        for (const vr of valRoots) {
            if (trainSet.has(vr)) leakageCount++;
        }

        for (const tr of trainRoots) {
            if (tr.includes('Duel')) duelInTrainCount++;
            if (tr.includes('Liberty')) libertyPortInTrainCount++;
        }
    }

    const valCoversDuel = valRoots.some(r => r.includes('Duel'));
    const valCoversLiberty = valRoots.some(r => r.includes('Liberty'));
    const zeroDuelInTrain = duelInTrainCount === 0;
    const zeroLibertyInTrain = libertyPortInTrainCount === 0;
    const isZeroLeakage = leakageCount === 0;

    return {
        runId: RUN_ID,
        auditDate: new Date().toISOString(),
        splitManifestPath: splitPath,
        trainRootCount: trainRoots.length,
        valRootCount: valRoots.length,
        crossPartitionLeakageRoots: leakageCount,
        hasZeroLeakage: isZeroLeakage,
        duelRootsInTrain: duelInTrainCount,
        libertyPortRootsInTrain: libertyPortInTrainCount,
        duelInTrainZero: zeroDuelInTrain,
        libertyPortInTrainZero: zeroLibertyInTrain,
        validationCoversDuel: valCoversDuel,
        validationCoversLibertyPort: valCoversLiberty,
        verdict: isZeroLeakage && zeroDuelInTrain && zeroLibertyInTrain && valCoversDuel && valCoversLiberty
            ? 'STRICTLY_ISOLATED_AND_HOLDOUT_QUALIFIED'
            : 'LEAKAGE_OR_DISTRIBUTION_VIOLATION'
    };
}

function runAccountingAudit(): any {
    const accountingPath = path.resolve(`training_runs/${RUN_ID}/dataset_accounting.json`);
    let accounting: any = null;

    if (fs.existsSync(accountingPath)) {
        accounting = JSON.parse(fs.readFileSync(accountingPath, 'utf8'));
    }

    const isConsistent = accounting?.mathematicalConsistency?.isSelfConsistent === true;

    return {
        runId: RUN_ID,
        auditDate: new Date().toISOString(),
        accountingPath,
        accountingAvailable: Boolean(accounting),
        isSelfConsistent: isConsistent,
        verdict: accounting ? (isConsistent ? 'MATHEMATICALLY_SELF_CONSISTENT' : 'MATHEMATICALLY_INCONSISTENT') : 'ACCOUNTING_NOT_FOUND',
        accountingData: accounting
    };
}

function main() {
    fs.mkdirSync(RUN_DIR, { recursive: true });
    fs.mkdirSync(REPORT_DIR, { recursive: true });

    const hashAudit = runHashAudit();
    const samplingCoverage = runSamplingCoverageAudit();
    const splitAudit = runSplitAudit();
    const accountingAudit = runAccountingAudit();

    // Write hash_audit.json
    fs.writeFileSync(path.join(RUN_DIR, 'hash_audit.json'), JSON.stringify(hashAudit, null, 2), 'utf8');
    fs.writeFileSync(path.join(REPORT_DIR, 'hash_audit.json'), JSON.stringify(hashAudit, null, 2), 'utf8');
    console.log('Wrote hash_audit.json');

    // Write sampling_coverage.json
    fs.writeFileSync(path.join(RUN_DIR, 'sampling_coverage.json'), JSON.stringify(samplingCoverage, null, 2), 'utf8');
    fs.writeFileSync(path.join(REPORT_DIR, 'sampling_coverage.json'), JSON.stringify(samplingCoverage, null, 2), 'utf8');
    console.log('Wrote sampling_coverage.json');

    // Write split_audit.json
    fs.writeFileSync(path.join(RUN_DIR, 'split_audit.json'), JSON.stringify(splitAudit, null, 2), 'utf8');
    fs.writeFileSync(path.join(REPORT_DIR, 'split_audit.json'), JSON.stringify(splitAudit, null, 2), 'utf8');
    console.log('Wrote split_audit.json');

    // Write accounting_audit.json
    fs.writeFileSync(path.join(RUN_DIR, 'accounting_audit.json'), JSON.stringify(accountingAudit, null, 2), 'utf8');
    fs.writeFileSync(path.join(REPORT_DIR, 'accounting_audit.json'), JSON.stringify(accountingAudit, null, 2), 'utf8');
    console.log('Wrote accounting_audit.json');

    console.log('All audits completed successfully.');
}

main();
