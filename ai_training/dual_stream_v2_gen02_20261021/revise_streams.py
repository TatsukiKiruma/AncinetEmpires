"""仅修订本次独立工具中的跨局流与旧评测排重入口。"""
from bootstrap import HERE


def edit(name, old, new):
    p = HERE / name
    text = p.read_text('utf-8')
    assert old in text, (name, old[:80])
    p.write_text(text.replace(old, new), encoding='utf-8')


edit('data.py', 'def batches(split, epoch=0, limit=None):', 'def batches(split, epoch=0, limit=None, stream=None):')
edit('data.py', "os.environ.get('LEAGUE_STREAM', 'dual_stream_v2_gen02_20261021/stream.ts')", "stream or os.environ.get('LEAGUE_STREAM', 'dual_stream_v2_gen02_20261021/stream.ts')")
edit('stream.ts', 'batch.length < 32', 'batch.length < 16')
edit('stream.ts', 'length >= 32', 'length >= 16')
edit('league_stream.ts', "for (const entry of league.replayBufferManifest.filter((e: any) => e.generation <= generation)) {\n    const plan = read(entry.manifest);\n    for (const slot of plan.slots) {\n        const initial = read(slot.initialPath), prefix = `generations/gen_${String(entry.generation).padStart(2, '0')}/games/${slot.id}`;\n        const result = read(prefix + '/result.json');\n        if (!read(prefix + '/strict-replay.json').passed) throw Error('未经strict不得训练');\n        for await (const row of gzipRows(fs.readFileSync(path.join(DIR, prefix, 'samples.jsonl.gz')))) {", """async function* acrossGames() {
    const slots = league.replayBufferManifest.filter((e: any) => e.generation <= generation).flatMap((entry: any) => read(entry.manifest).slots.map((slot: any) => ({ entry, slot, priority: createHash('sha256').update(`${epoch}:${slot.id}`).digest('hex') }))).sort((a: any, b: any) => a.priority.localeCompare(b.priority));
    const active: any[] = [];
    const add = () => { const item = slots.shift(); if (item) { const prefix = `generations/gen_${String(item.entry.generation).padStart(2, '0')}/games/${item.slot.id}`; if (!read(prefix + '/strict-replay.json').passed) throw Error('未经strict不得训练'); active.push({ slot: item.slot, result: read(prefix + '/result.json'), initial: read(item.slot.initialPath), iterator: gzipRows(fs.readFileSync(path.join(DIR, prefix, 'samples.jsonl.gz')))[Symbol.asyncIterator]() }); } };
    for (let i = 0; i < 8; i++) add();
    while (active.length) {
        for (const item of [...active]) {
            const next = await item.iterator.next();
            if (next.done) { active.splice(active.indexOf(item), 1); add(); }
            else yield { ...item, row: next.value };
        }
    }
}
for await (const { initial, result, row } of acrossGames()) {""")
edit('league_stream.ts', "        }\n    }\n}\nfor (const [key, entries]", "}\nfor (const [key, entries]")
edit('league_stream.ts', "configuredPlayers: row.configuredPlayers, terminalMask", "turn: state.turn, trainingSource: 'expert', configuredPlayers: row.configuredPlayers, terminalMask")
edit('exclusions.ts', "walk(path.join(DIR, 'historical-arena'));", """const predecessor = path.resolve(DIR, '../dual_stream_v2_phase5_20261020');
    walk(path.join(predecessor, 'historical-arena'));
    walk(path.join(predecessor, 'champion-pure-arena')); walk(path.join(predecessor, 'champion-search-arena'));
    for (const e of fs.readdirSync(path.join(predecessor, 'generations'), { withFileTypes: true })) if (e.isDirectory()) walk(path.join(predecessor, 'generations', e.name, 'arena'));
    for (const e of fs.readdirSync(predecessor, { withFileTypes: true })) if (e.isDirectory() && e.name.startsWith('device-comparison-10')) walk(path.join(predecessor, e.name));
    walk(path.join(DIR, 'historical-arena'));""")
edit('exclusions.ts', 'const mapBase = base.startsWith(DIR + path.sep) ? DIR : base;', "const mapBase = base.startsWith(DIR + path.sep) ? DIR : base.startsWith(predecessor + path.sep) ? predecessor : base;")
