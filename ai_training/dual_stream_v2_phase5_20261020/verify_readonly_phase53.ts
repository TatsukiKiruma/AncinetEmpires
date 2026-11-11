import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { DIR, ROOT, read, save, sha } from './common';

const snapshot = path.join(DIR, 'phase53-audit/v4-attempt01-source');
const original = fs.readFileSync(path.join(snapshot, 'src/game/engine.ts'), 'utf8'), current = fs.readFileSync(path.join(ROOT, 'src/game/engine.ts'), 'utf8');
function members(source: string) {
    const file = ts.createSourceFile('engine.ts', source, ts.ScriptTarget.Latest, true);
    const declaration = file.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'GameEngine') as ts.ClassDeclaration;
    return new Map(declaration.members.map(n => [n.name?.getText(file) ?? 'constructor', n.getText(file)]));
}
const before = members(original), after = members(current);
for (const [name, source] of before) assert.equal(after.get(name), source, `既有权威方法发生变化:${name}`);
assert.deepEqual([...after.keys()].filter(name => !before.has(name)), ['matchesState', 'hasLegalAction']);
const topLevel = (source: string) => {
    const file = ts.createSourceFile('engine.ts', source, ts.ScriptTarget.Latest, true);
    return file.statements.filter(n => !ts.isClassDeclaration(n) && !(ts.isImportDeclaration(n) && n.moduleSpecifier.getText(file) === "'./state_equals'")).map(n => n.getText(file));
};
assert.deepEqual(topLevel(current), topLevel(original), '既有顶层函数、接口与导入必须完整保持');
const manifest = read('phase53-audit/v4-attempt01-source/manifest.json');
const changed = Object.keys(manifest).filter(name => name.startsWith('src/game/') && name !== 'src/game/engine.ts' && sha(fs.readFileSync(path.join(ROOT, name))) !== manifest[name]);
assert.deepEqual(changed, []);
const rules = fs.readdirSync(path.join(ROOT, 'src/game')).filter(n => n.endsWith('.ts') && !n.endsWith('.test.ts')).sort();
const authoritySha256 = sha(rules.map(n => sha(fs.readFileSync(path.join(ROOT, 'src/game', n)))).join(':'));
save(process.env.LEAGUE_READONLY_OUTPUT ?? 'phase53-audit/read-only-engine-equivalence.json', { passed: true, existingMembersUnchanged: before.size, existingTopLevelStatementsUnchanged: topLevel(original).length, addedMembers: ['matchesState', 'hasLegalAction'], otherAuthorityFilesChanged: changed, authoritySha256, sourceSha256: sha(current), comparisonSha256: sha(fs.readFileSync(path.join(ROOT, 'src/game/state_equals.ts'))), previousAuthoritySha256: read('index-authority-attestation.json').authoritySha256 });
console.log(JSON.stringify({ passed: true, existingMembersUnchanged: before.size, authoritySha256 }));
