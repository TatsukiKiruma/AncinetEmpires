import type { CustomSkirmishMap } from './types';

export const threeForks = {
    id: 'three-forks',
    label: '三岔雪原',
    description: '三路各有一座前哨村，外路可绕过交会点。',
    startingGold: 250,
    rows: [
        '..mf.........fm..',
        '....m...a...m....',
        '.f......A......f.',
        '..h.....-.....h..',
        '....---------....',
        '....-f..-..f-....',
        'h.f.-...v...-.f.h',
        '....-...-...-....',
        '.bB---v---v---Cd.',
        '....-.f.-.f.-....',
        '.m..-...-...-..m.',
        '...h---------h...',
        '...ffhm...mhff...',
        'f......m.m......f',
        'm......h.h......m',
    ],
    commanders: [[0, 8, 2], [1, 2, 8], [2, 14, 8]],
    objectives: [[8, 6], [6, 8], [10, 8]]
} as const satisfies CustomSkirmishMap;
