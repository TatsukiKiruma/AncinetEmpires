import type { CustomSkirmishMap } from './types';

export const tideHarbors = {
    id: 'tide-harbors',
    label: '三港回潮',
    description: '三条桥通向同一座岛堡，外环可绕后。',
    startingGold: 300,
    rows: [
        '....mf.......fm....',
        '...m....f.f....m...',
        '...f.....A.....f...',
        '......f..-..f......',
        'f........-........f',
        'm...-----v-----...m',
        '....-.m.h-h.m.-....',
        '.m..-h.~~|~~.h-..m.',
        '....-..~.-.~..-....',
        '..B--v-=-c-=-v--C..',
        '....-..~...~..-....',
        '....-..~~~~~..-....',
        'fhm.-.........-.mhf',
        '...h-----------h...',
        '...f.m.......m.f...',
        '..h.....f.f.....h..',
        '.....fh.....hf.....',
    ],
    commanders: [[0, 9, 2], [1, 2, 9], [2, 16, 9]],
    objectives: [[9, 9]]
} as const satisfies CustomSkirmishMap;
