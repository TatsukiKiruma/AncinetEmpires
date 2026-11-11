import { multiplayerFixture, standardFixture } from '../dual_stream_v2_phase1_20261020/fixtures';

export function architectureFixtures() {
    const rectangle = multiplayerFixture(2, 20, 8); rectangle.map.height = 12; rectangle.map.tiles = rectangle.map.tiles.slice(0, 12);
    const odd = multiplayerFixture(2, 15, 8);
    const six = multiplayerFixture(6, 32, 8); for (const u of six.units) if (u.ownerId >= 4) u.pos.y = 12 + Math.floor(Number(u.id.split('u')[1]) / 3) * 2;
    return [
        { name: 'standard-1v1', state: standardFixture() }, { name: 'rectangle-20x12', state: rectangle }, { name: 'odd-15x15', state: odd },
        { name: '3ffa', state: multiplayerFixture(3) }, { name: '2v2', state: multiplayerFixture(4, 16, 8, true) }, { name: '6ffa', state: six },
        { name: '100units-32x32', state: multiplayerFixture(4, 32, 25) }, { name: '160units-64x64', state: multiplayerFixture(4, 64, 40) },
        { name: 'standard-1v1-12x12', state: multiplayerFixture(2, 12, 4) }
    ];
}

