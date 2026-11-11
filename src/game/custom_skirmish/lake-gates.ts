import type { CustomSkirmishMap } from './types';

export const lakeGates = {
    id: 'lake-gates',
    label: '四门环湖',
    description: '四面各有一处入口，湖心四村避免独占唯一中心。',
    startingGold: 300,
    rows: [
        '..h....fm...fm.....',
        '.f....h.........mf.',
        '.m..h..f.......m..h',
        '..mf......f....f...',
        '....A----v----B.h..',
        'm...-...f-hff.-....',
        'f...-f~~~|~~~.-..h.',
        '....-f~~~|~~~.-.f.f',
        '...f-h~~v.v~~f-...m',
        '....v-==...==-v....',
        'm...-f~~v.v~~h-f...',
        'f.f.-.~~~|~~~f-....',
        '.h..-.~~~|~~~f-...f',
        '....-.ffh-f...-...m',
        '..h.D----v----C....',
        '...f....f......fm..',
        'h..m.......f..h..m.',
        '.fm.........h....f.',
        '.....mf...mf....h..',
    ],
    commanders: [[0, 4, 4], [1, 14, 4], [2, 14, 14], [3, 4, 14]],
    objectives: [[9, 4], [14, 9], [9, 14], [4, 9]]
} as const satisfies CustomSkirmishMap;
