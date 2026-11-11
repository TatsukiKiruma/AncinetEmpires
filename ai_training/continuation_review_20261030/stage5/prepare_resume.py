"""生成独立续跑控制器，保留原控制器和历史RUN身份。"""
from pathlib import Path

HERE = Path(__file__).resolve().parent
source = (HERE / 'development.ts').read_text(encoding='utf-8')
source = source.replace("import { healthGate }", "import { runtimeIdentity } from '../stage4_v7/runtime_identity';\nimport { healthGate }")
source = source.replace("'development.ts'", "'development_resume.ts'")
source = source.replace("const configs =", "const runtimeSha = runtimeIdentity().sha256;\nconst configs =")
source = source.replace("return {...read(path.join(dir, 'SUMMARY.json')).games[0], artifactDirectory: path.join(dir, match)};", "const summary = read(path.join(dir, 'SUMMARY.json'));\n        if (!summary.complete || !summary.gpuExited || summary.runtimeSha256 !== runtimeSha || summary.modelSha256 !== read(path.join(HERE, `config-${id}.json`)).modelVersion) throw Error('旧收据运行时或模型身份不符');\n        return {...summary.games[0], artifactDirectory: path.join(dir, match)};")
source = source.replace("await save(selection, {panelSha256: panelSha, ids: [match]}, true);", "if (!fs.existsSync(selection)) await save(selection, {panelSha256: panelSha, ids: [match]}, true);\n    else if (read(selection).panelSha256 !== panelSha || JSON.stringify(read(selection).ids) !== JSON.stringify([match])) throw Error('已有子集身份不符');")
source = source.replace("await save(path.join(dir, 'SUMMARY.json'), {games, complete: true}, true);", "if (!fs.existsSync(path.join(dir, 'SUMMARY.json'))) await save(path.join(dir, 'SUMMARY.json'), {games, complete: true}, true);")
source = source.replace("await save(path.join(dir, 'ANALYSIS.json'), result, true);", "if (!fs.existsSync(path.join(dir, 'ANALYSIS.json'))) await save(path.join(dir, 'ANALYSIS.json'), result, true);")
source = source.replace("path.join(folder, 'RUN.json')", "path.join(folder, 'RESUME_RUN.json')")
source = source.replace("{configHashes, sources, panelSha,", "{configHashes, sources, runtimeSha, panelSha,")
source = source.replace("await save(path.join(HERE, 'DEV_SCREEN_SUMMARY.json'), screen, true);", "await save(path.join(HERE, 'DEV_SCREEN_SUMMARY.json'), screen, true);\n    await save(path.join(HERE, 'DEV18_SUMMARY.json'), screen, true);")
source = source.replace("(s.equalRank >= .6597 || s.equalWin >= .5602)", "(s.equalRank >= .6597 && s.equalWin >= .5602)")
source = source.replace("const s = full.scores;", "await save(path.join(HERE, 'DEV54_SUMMARY.json'), full, true);\n        const s = full.scores;")
source = source.replace("await save(path.join(HERE, 'DEVELOPMENT_PROGRESS.json'), {state: 'development_finished'", "await save(path.join(HERE, 'GATE_DECISION.json'), read(path.join(HERE, 'DEVELOPMENT_GATE_REPORT.json')), true);\n    await save(path.join(HERE, 'DEVELOPMENT_PROGRESS.json'), {state: 'development_finished'")
with (HERE / 'development_resume.ts').open('x', encoding='utf-8') as stream:
    stream.write(source)
