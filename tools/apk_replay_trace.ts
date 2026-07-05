import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameEngine } from '../src/game/engine';
import { encodeAction } from '../src/game/env';
import {
    expandApkReplayRecordToProjectActions,
    type ApkReplayActionRecord
} from '../src/game/apk_replay';
import type { Action, GameState, Position } from '../src/game/types';
import { parseRemoteReplay } from './apk_game_get_validate';

interface TraceOptions {
    input: string;
    x: number;
    y: number;
    radius: number;
    until: number;
    forceExecuteReplayActions: boolean;
}

function parseArgs(argv: readonly string[]): TraceOptions {
    const options: Partial<TraceOptions> = {
        radius: 0,
        until: Number.MAX_SAFE_INTEGER,
        forceExecuteReplayActions: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--input') {
            options.input = argv[++index];
        } else if (arg === '--x') {
            options.x = Number(argv[++index]);
        } else if (arg === '--y') {
            options.y = Number(argv[++index]);
        } else if (arg === '--radius') {
            options.radius = Number(argv[++index]);
        } else if (arg === '--until') {
            options.until = Number(argv[++index]);
        } else if (arg === '--force-apk-replay-execution') {
            options.forceExecuteReplayActions = true;
        } else {
            throw new Error(`未知参数: ${arg}`);
        }
    }

    if (!options.input) throw new Error('缺少 --input');
    if (!Number.isInteger(options.x)) throw new Error('缺少或非法 --x');
    if (!Number.isInteger(options.y)) throw new Error('缺少或非法 --y');
    if (!Number.isInteger(options.radius) || options.radius < 0) throw new Error('--radius 需要非负整数');
    if (!Number.isInteger(options.until) || options.until < 0) throw new Error('--until 需要非负整数');

    return options as TraceOptions;
}

function distance(a: Position, b: Position): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function posText(pos: Position | null | undefined): string {
    return pos ? `(${pos.x},${pos.y})` : '-';
}

function isWatchedPos(pos: Position | null | undefined, center: Position, radius: number): boolean {
    return Boolean(pos && distance(pos, center) <= radius);
}

function recordTouches(record: ApkReplayActionRecord, center: Position, radius: number): boolean {
    return (
        isWatchedPos(record.source, center, radius)
        || isWatchedPos(record.moveTo, center, radius)
        || isWatchedPos(record.postMoveTo, center, radius)
        || isWatchedPos(record.target, center, radius)
    );
}

function watchedSnapshot(state: GameState, center: Position, radius: number): string {
    const units = state.units
        .filter(unit => unit.hp > 0 && distance(unit.pos, center) <= radius)
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(unit => [
            `${unit.id}:${unit.unitClass}`,
            `P${unit.ownerId}`,
            `pos=${posText(unit.pos)}`,
            `hp=${unit.hp}`,
            `lv=${unit.level ?? 0}`,
            `exp=${unit.exp ?? 0}`,
            `m=${unit.hasMoved ? 1 : 0}`,
            `a=${unit.hasActed ? 1 : 0}`,
            `rem=${unit.movementRemaining ?? '-'} `,
            `st=${unit.status ? `${unit.status.type}:${unit.status.remainingTurns ?? unit.status.remainingTicks ?? '-'}` : '-'}`
        ].join('/'));

    const graves = (state.graves ?? [])
        .filter(grave => distance(grave.pos, center) <= radius)
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(grave => `${grave.id}/owner=${grave.ownerId ?? '-'}/pos=${posText(grave.pos)}/turns=${grave.remainingTurns}`);

    return `units=[${units.join('; ')}] graves=[${graves.join('; ')}]`;
}

function createExpansionOptions(records: readonly ApkReplayActionRecord[], recordIndex: number, forceExecuteReplayActions: boolean) {
    return {
        allowAmbiguousRecruitDeployFirstMatch: true,
        skipInvalidEventAsNoop: forceExecuteReplayActions,
        recruitDeployResolver: (
            _record: ApkReplayActionRecord,
            legalDeployActions: Extract<Action, { type: 'recruit_and_deploy' }>[]
        ) => {
            const nextRecord = records[recordIndex + 1];
            if (nextRecord?.source) {
                const matched = legalDeployActions.find(action => (
                    action.to.x === nextRecord.source?.x
                    && action.to.y === nextRecord.source.y
                ));
                if (matched) return matched;
            }
            return legalDeployActions[0];
        }
    };
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));
    const center = { x: options.x, y: options.y };
    const parsed = await parseRemoteReplay(path.resolve(options.input), {
        inputs: [],
        rootDir: '',
        outPath: null,
        json: false,
        mode: 'SD',
        maxRecords: 100000,
        offset: 0,
        limit: null,
        uniqueOffset: null,
        uniqueLimit: null,
        dedupe: true,
        allowAmbiguousRecruit: true,
        strictTerrain: false,
        forceExecuteReplayActions: options.forceExecuteReplayActions
    });

    const engine = new GameEngine(parsed.initialState, {
        unsafeBypassValidationForTests: options.forceExecuteReplayActions,
        disableAutoAdvanceWhenNoMeaningfulAction: true,
        applyInitialTurnStart: true
    });

    let lastSnapshot = watchedSnapshot(engine.getState(), center, options.radius);
    console.log(`# ${path.basename(options.input)} watch=${posText(center)} radius=${options.radius}`);
    console.log(`initial ${lastSnapshot}`);

    for (let recordIndex = 0; recordIndex < parsed.actions.length && recordIndex <= options.until; recordIndex += 1) {
        const record = parsed.actions[recordIndex];
        const beforeState = engine.getState();
        const beforeSnapshot = watchedSnapshot(beforeState, center, options.radius);
        const shouldPrintRecord = recordTouches(record, center, options.radius) || beforeSnapshot !== lastSnapshot;
        let actions: Action[];

        try {
            actions = expandApkReplayRecordToProjectActions(
                record,
                beforeState,
                createExpansionOptions(parsed.actions, recordIndex, options.forceExecuteReplayActions)
            );
        } catch (error) {
            console.log(`\nrecord=${recordIndex} expand-error event=${record.eventType} src=${posText(record.source)} move=${posText(record.moveTo)} post=${posText(record.postMoveTo)} target=${posText(record.target)} recruit=${record.recruitUnitId}`);
            console.log(`before ${beforeSnapshot}`);
            console.log(error instanceof Error ? error.message : String(error));
            return;
        }

        if (shouldPrintRecord) {
            console.log(`\nrecord=${recordIndex} turn=${beforeState.turn} player=${beforeState.currentPlayer} event=${record.eventType} src=${posText(record.source)} move=${posText(record.moveTo)} post=${posText(record.postMoveTo)} target=${posText(record.target)} recruit=${record.recruitUnitId}`);
            console.log(`before ${beforeSnapshot}`);
            console.log(`actions=${actions.map(encodeAction).join(', ') || '-'}`);
        }

        for (const action of actions) {
            const result = engine.step(action);
            if (result.info.includes('非法动作')) {
                console.log(`\nrecord=${recordIndex} step-error action=${encodeAction(action)}`);
                console.log(`before ${beforeSnapshot}`);
                console.log(`info=${result.info}`);
                console.log(`after ${watchedSnapshot(result.state, center, options.radius)}`);
                return;
            }
        }

        const afterSnapshot = watchedSnapshot(engine.getState(), center, options.radius);
        if (shouldPrintRecord || afterSnapshot !== beforeSnapshot) {
            console.log(`after  ${afterSnapshot}`);
        }
        lastSnapshot = afterSnapshot;
    }
}

const isDirectRun = process.argv[1]
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
    main().catch(error => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
