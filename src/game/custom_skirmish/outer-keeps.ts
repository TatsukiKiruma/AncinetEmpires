import type { CustomSkirmishMap } from './types';

export const outerKeeps = {
    id: 'outer-keeps',
    label: '三堡外环',
    description: '每方各有一座近点副城，前线在三堡之间。',
    startingGold: 300,
    rows: [
        '......mf.....fm......',
        '..m....f.....f....m..',
        '.....h....A....h.....',
        'f..m......-......m..f',
        '.mhff.....-.....ffhm.',
        '.....-----v-----.....',
        '.....-....-....-.....',
        '..f..-fm..-..mf-..f..',
        '.....-.h..c..h.-.....',
        '.h...-....-....-...h.',
        '..B--v--c---c--v--C..',
        'h....-...m-m...-....h',
        '.....-.h..-..h.-.....',
        '.....-.m.h-h.m.-.....',
        '.f...-----------...f.',
        '...h.....f.f.....h...',
        '...fh...........hf...',
        '.........f.f.........',
        'f....f....h....f....f',
    ],
    commanders: [[0, 10, 2], [1, 2, 10], [2, 18, 10]],
    objectives: [[10, 8], [8, 10], [12, 10]]
} as const satisfies CustomSkirmishMap;
