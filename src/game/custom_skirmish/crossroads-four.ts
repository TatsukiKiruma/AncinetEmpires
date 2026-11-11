import type { CustomSkirmishMap } from './types';

export const crossroadsFour = {
    id: 'crossroads-four',
    label: '四隅通衢',
    description: '四座边线村由相邻两家争夺，内环可转线。',
    startingGold: 250,
    rows: [
        'm....f.........fm',
        'f....h...mf......',
        '.....m..hf...b...',
        '..aA----v----B...',
        '...-m...-..fm-...',
        '...-f..f-....-mhf',
        '.f.-..v---v..-...',
        '.mf-..-h-h-f.-...',
        '..hv---------vh..',
        '...-.f-h-h-..-fm.',
        '...-..v---v..-.f.',
        'fhm-....-f..f-...',
        '...-mf..-...m-...',
        '...D----v----Cd..',
        '...e...fh..m.....',
        '......fm...h....f',
        'mf.........f....m',
    ],
    commanders: [[0, 3, 3], [1, 13, 3], [2, 13, 13], [3, 3, 13]],
    objectives: [[8, 3], [13, 8], [8, 13], [3, 8]]
} as const satisfies CustomSkirmishMap;
