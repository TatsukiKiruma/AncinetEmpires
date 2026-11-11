import type { CustomSkirmishMap } from './types';

export const mirrorBay = {
    id: 'mirror-bay',
    label: '镜湾争城',
    description: '对称对照图：南北两座中立城堡，中桥可争。',
    startingGold: 200,
    rows: [
        '......f.h.m....',
        '........fhm..m.',
        '...----c----fh.',
        'mf.-..v~fh-.hf.',
        'hhf-fff~.f-....',
        'mm.-.hv~..-b...',
        '..fA---=---Bf..',
        '...a-..~vh.-.mm',
        '....-f.~fff-fhh',
        '.fh.-hf~v..-.fm',
        '.hf----c----...',
        '.m..mhf........',
        '....m.h.f......',
    ],
    commanders: [[0, 3, 6], [1, 11, 6]],
    objectives: [[7, 2], [7, 10]]
} as const satisfies CustomSkirmishMap;
