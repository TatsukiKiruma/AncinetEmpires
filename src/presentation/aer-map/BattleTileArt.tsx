import type { CSSProperties } from 'react';
import { APK_UNIT_CLASS_TO_ID } from '../../game/apk_compat';
import type { Grave, Unit } from '../../game/types';
import borders from './border-patterns.json';
import atlases from './atlas-layout.json';
import { aerBorderFrame, type AerMapTile } from './tiles';

type AtlasName = keyof typeof atlases;

function frameStyle(atlas: AtlasName, frame: number, palette = 0): CSSProperties {
    const { columns, rows, variants } = atlases[atlas];
    const y = Math.floor(frame / columns) + rows * palette;
    const height = rows * variants;
    return {
        backgroundImage: `url("${import.meta.env.BASE_URL}aer-map/${atlas}.png")`,
        backgroundSize: `${columns * 100}% ${height * 100}%`,
        backgroundPosition: `${columns === 1 ? 0 : (frame % columns) * 100 / (columns - 1)}% ${height === 1 ? 0 : y * 100 / (height - 1)}%`
    };
}

function Sprite({ atlas, frame, palette }: { atlas: AtlasName; frame: number; palette?: number }) {
    return <span aria-hidden="true" className="aer-map-sprite" style={frameStyle(atlas, frame, palette)} />;
}

const teamPalette = (team: number | null | undefined) => team !== null && team !== undefined && team >= 0 && team < 6 ? team : 6;
const unitFrame = (id: number) => (Math.floor((id + 1) / 16) * 32) + ((id + 1) % 16);

export function BattleTileArt({ grid, x, y, unit, grave }: {
    grid: AerMapTile[][]; x: number; y: number; unit?: Unit; grave?: Grave;
}) {
    const tile = grid[y][x];
    const border = aerBorderFrame(grid, x, y, borders);
    const castleTop = grid[y + 1]?.[x]?.object === 8;
    // 网页图集只有部分单位有头像，指挥官按队伍选用对应头像。
    const head = unit?.unitClass === 'commander' ? unit.apkUnitHead ?? (unit.ownerId % 4) : -1;
    return (
        <span className="aer-map-art" aria-hidden="true">
            <Sprite atlas="base" frame={tile.base} />
            {border > 0 && <Sprite atlas="border" frame={border} />}
            {tile.object >= 0 && <Sprite atlas="objects" frame={tile.object + 1} palette={teamPalette(tile.team)} />}
            {castleTop && <Sprite atlas="objects" frame={37} palette={6} />}
            {grave && <Sprite atlas="tombs" frame={1} palette={teamPalette(grave.ownerId)} />}
            {unit && <Sprite atlas="units" frame={unitFrame(APK_UNIT_CLASS_TO_ID[unit.unitClass])}
                palette={unit.hasActed ? 7 : teamPalette(unit.ownerId)} />}
            {head >= 0 && head < 4 && <Sprite atlas="heads" frame={unitFrame(head)} palette={unit?.hasActed ? 1 : 0} />}
        </span>
    );
}
