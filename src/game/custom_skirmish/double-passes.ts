import type { CustomSkirmishMap } from './types';

export const doublePasses = {
    id: 'double-passes',
    label: '四角双关',
    description: '四座侧翼副城等距，近点小村支持先展开再抢城。',
    startingGold: 200,
    rows: [
        '....f.....h......fh..',
        '..f....h.......hf....',
        'h..f..f......m..hb.f.',
        'f.aA--v---c---v--Bf..',
        '.fh-......-...fm.-..f',
        '.h.-m.....-......-...',
        '...vf.m...-f..m..vf..',
        '..m-...-------...-.h.',
        '...-...-mmhmm-...-...',
        '...-..f-m...m-...-...',
        'h..c----h...h----c..h',
        '...-...-m...m-f..-...',
        '...-...-mmhmm-...-...',
        '.h.-...-------...-m..',
        '..fv..m..f-...m.fv...',
        '...-......-.....m-.h.',
        'f..-.mf...-......-hf.',
        '..fD--v---c---v--Cd.f',
        '.f.eh..m......f..f..h',
        '....fh.......h....f..',
        '..hf......h.....f....',
    ],
    commanders: [[0, 3, 3], [1, 17, 3], [2, 17, 17], [3, 3, 17]],
    objectives: [[10, 3], [17, 10], [10, 17], [3, 10]]
} as const satisfies CustomSkirmishMap;
