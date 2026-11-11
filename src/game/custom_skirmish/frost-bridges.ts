import type { CustomSkirmishMap } from './types';

export const frostBridges = {
    id: 'frost-bridges',
    label: '霜桥双线',
    description: '双桥分流，后手多一座已占村庄。',
    startingGold: 300,
    rows: [
        '....hm~......',
        'ff...f~....f.',
        '..Avf.~...vh.',
        '.f---v=--....',
        'h.f-..~.--ff.',
        'mmh-hf~fh-hmm',
        '.ff--.~..-f.h',
        '....--=v---f.',
        '.hv...~.fbB..',
        '.f....~f...ff',
        '......~mh....',
    ],
    commanders: [[0, 2, 2], [1, 10, 8]],
    objectives: [[5, 3], [7, 7]]
} as const satisfies CustomSkirmishMap;
