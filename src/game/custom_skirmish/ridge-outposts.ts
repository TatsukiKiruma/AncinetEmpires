import type { CustomSkirmishMap } from './types';

export const ridgeOutposts = {
    id: 'ridge-outposts',
    label: '双岭旧驿',
    description: '首轮资金相同；先手驿站待修，后手指挥官前置一格。',
    startingGold: 250,
    rows: [
        '......fh.....',
        '......mf.....',
        'm-A.fff......',
        'hh-r.fhmm.v..',
        '.f----hhhmfmh',
        '..f-v.--f.ffh',
        '.mh-------hm.',
        'hff.f--.v-f..',
        'hmfmhhh----f.',
        '..v.mmhf.v-hh',
        '......fff.B-m',
        '.....fm......',
        '.....hf......',
    ],
    commanders: [[0, 2, 2], [1, 10, 9]],
    objectives: [[3, 3], [9, 9]]
} as const satisfies CustomSkirmishMap;
