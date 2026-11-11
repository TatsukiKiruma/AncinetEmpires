import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv.indexOf('--out');
const destination = path.resolve(root, arg < 0 ? 'deliverables/clean_workspace' : process.argv[arg + 1]);
if (!destination.startsWith(root + path.sep) || destination === root) throw new Error('交付目录必须在项目内，且不能等于项目根目录。');
if (fs.existsSync(destination)) throw new Error(`交付目录已存在；请指定新的 --out，避免覆盖：${destination}`);
const printer = ts.createPrinter({removeComments: true});
const files = [];
function write(name, content, source = null) {
  const output = path.join(destination, name);
  fs.mkdirSync(path.dirname(output), {recursive:true});
  fs.writeFileSync(output, content);
  files.push({path:name, source, sha256:crypto.createHash('sha256').update(content).digest('hex')});
}
function copy(name, stripComments = false) {
  const input = fs.readFileSync(path.join(root,name));
  const content = stripComments ? printer.printFile(ts.createSourceFile(name,input.toString('utf8'),ts.ScriptTarget.Latest,true)) : input;
  write(name,content,name);
}

// 白名单只包含公共规则与指定的规则策略；不递归复制模型、历史或 Git 数据。
for (const entry of fs.readdirSync(path.join(root,'src/game'),{withFileTypes:true})) {
  if (entry.isFile() && entry.name.endsWith('.ts') && entry.name !== 'state_snapshot.ts') copy(`src/game/${entry.name}`,true);
}
for (const entry of fs.readdirSync(path.join(root,'src/game/tests'),{withFileTypes:true})) {
  if (entry.isFile() && entry.name.endsWith('.ts') && entry.name !== 'engine.test.ts') copy(`src/game/tests/${entry.name}`,true);
}
const policyFiles = ['apk_like_ai.ts','heuristic_ai.ts','tactical_evaluation.ts','tactical_pathfinding.ts',
  'apk_like_ai.test.ts','heuristic_ai.test.ts','tactical_pathfinding.test.ts'];
for (const name of policyFiles) copy(`src/game/ai/${name}`);

// 保留规则和启发式基线测试，只排除未交付的随机策略测试。
const testPath = 'src/game/tests/engine.test.ts';
const source = ts.createSourceFile(testPath,fs.readFileSync(path.join(root,testPath),'utf8'),ts.ScriptTarget.Latest,true);
let omittedPolicyTests = 0;
const transformed = ts.transform(source,[context => {
  function visit(node) {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier.text.endsWith('/random_ai')) return undefined;
    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
      const callee = node.expression.expression.getText(source);
      if (/^(it|test)(\.|$)/.test(callee) && /\bRandomAI\b/.test(node.getText(source))) {
        omittedPolicyTests += 1;
        return undefined;
      }
    }
    return ts.visitEachChild(node,visit,context);
  }
  return node => ts.visitNode(node,visit);
}]);
write(testPath,printer.printFile(transformed.transformed[0]),testPath);
transformed.dispose();

for (const name of ['docs/environment/interface.md','docs/rules/initial-turn-income.md',
  'docs/rules/apk-native-ai.md','docs/rules/apk-rule-fixes-20261013.md','docs/rules/apk-replay-fixes-20261013.md','docs/rules/apk-castle-fix-20261013.md','docs/rules/apk-grave-fix-20261013.md']) copy(name);
write('docs/rules/README.md', '# 游戏规则\n\n以 src/game 中的规则、引擎、单位、地形和地图实现及测试为准。\n\n- [环境接口](../environment/interface.md)\n- [开局收益](initial-turn-income.md)\n- [本版规则修复和验证范围](apk-rule-fixes-20261013.md)\n- [APK 原生 AI 与项目基线](apk-native-ai.md)\n\n当前支持 pending 招募、SD/SO 遭遇战与内置官方地图。研究目标、对手、预算和验收面板请独立制定。\n');
write('README.md', '# 远古帝国游戏环境\n\n这是可独立运行的规则与环境源码，用于设计对战算法。包括内置官方地图、合法动作、状态观测、环境接口、规则回归测试及可运行的规则 AI 基线。规则版本为 apk-4.2.5.1-rules-20261013-r4，文件 SHA256 清单见 DELIVERY_MANIFEST.json。\n\n```text\nnpm ci\nnpm run lint\nnpm test\nnpm run build\nnpm run smoke\nnpm run smoke:ai\n```\n\n需要支持当前依赖的 Node.js（建议 Node 22）。此交付是无界面环境包；运行和测试不依赖浏览器、本地 APK 解包资源或模型权重。\n\n**HeuristicAI 是项目启发式基线；ApkLikeAI 是 APK 风格近似策略。包内提供 APK 原生 AI 的证据信息，没有宣称这两个类是原生 AI 的等价移植。**\n\n- [同格墓碑覆盖修复与原生对照](docs/rules/apk-grave-fix-20261013.md)\n- [敌军占堡扣血修复与最新验证](docs/rules/apk-castle-fix-20261013.md)\n- [真实回放审计后的四项修复与待定项](docs/rules/apk-replay-fixes-20261013.md)\n- [本版规则修复和验证范围](docs/rules/apk-rule-fixes-20261013.md)\n- [APK 原生 AI 机制、项目基线和调用示例](docs/rules/apk-native-ai.md)\n- [环境接口与奖励、终止语义](docs/environment/interface.md)\n- [游戏规则入口](docs/rules/README.md)\n\n请独立确定研究目标、对手、计算预算、数据来源与验收方式。自然终局、截断和运行错误应分别记录。\n');
write('AGENTS.md','# 协作要求\n\n全程中文沟通，新增注释及用户文案使用中文。修改前检查工作区，保留他人改动。\n\n游戏规则以 src/game 的 TypeScript 实现为准，不另写规则；修改规则应增加可复现回归案例。界面、算法与规则保持分离。\n\n先读 README.md 和 docs/environment/interface.md，再独立制定研究方案。不要将代理奖励、步数截断或运行错误计为自然胜利。\n');
write('examples/smoke.ts', `import { AncientEmpiresEnv } from '../src/game/env';\nimport { createDefaultAppGameState } from '../src/game/default_state';\n\n// 固定种子的均匀合法动作示例，仅检查环境能连续执行。\nconst env = new AncientEmpiresEnv({initialState:createDefaultAppGameState(), seed:42, maxPlies:200});\nlet result = env.reset();\nlet seed = 42;\nlet steps = 0;\nwhile (!result.done && steps < 100) {\n  seed = (Math.imul(seed,1664525) + 1013904223) >>> 0;\n  if (!result.legalActions.length) throw new Error('非终局没有合法动作');\n  result = env.step(seed % result.legalActions.length);\n  steps += 1;\n}\nconsole.log(JSON.stringify({步骤:steps, 环境结束:result.done, 规则胜者:result.state.winner}));\n`);
const base = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
write('examples/rule_ai.ts', `import { AncientEmpiresEnv, mulberry32, encodeAction } from '../src/game/env';
import { createDefaultAppGameState } from '../src/game/default_state';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { ApkLikeAI } from '../src/game/ai/apk_like_ai';

// 两种策略都是项目基线；上限只用于可运行性验证，不作为自然胜负。
for (const Strategy of [HeuristicAI, ApkLikeAI]) {
  const env = new AncientEmpiresEnv({initialState:createDefaultAppGameState(), seed:42, maxPlies:200});
  const ai = new Strategy(mulberry32(42));
  let result = env.reset();
  let steps = 0;
  while (!result.done && steps < 100) {
    const action = ai.getAction(env.getEngine(), env.getCurrentPlayer(), result.legalActions);
    if (!result.legalActions.some(candidate => encodeAction(candidate) === encodeAction(action))) throw new Error('策略返回非当前合法动作');
    result = env.stepAction(action);
    if (result.info.includes('非法动作')) throw new Error(result.info);
    steps += 1;
  }
  console.log(JSON.stringify({策略:Strategy.name, 步骤:steps, 环境结束:result.done, 自然终局:env.getEngine().isTerminal(), 规则胜者:result.state.winner}));
}
`);
// 保留依赖及锁文件的精确一致性；命令只暴露公共环境，不包含应用或研究入口。
const pkg = {...base,scripts:{lint:'tsc --noEmit',test:'vitest run',build:'tsc -p tsconfig.build.json',smoke:'node --import tsx examples/smoke.ts','smoke:ai':'node --import tsx examples/rule_ai.ts'}};
write('package.json',JSON.stringify(pkg,null,2)+'\n');
copy('package-lock.json');
const config = {compilerOptions:{target:'ES2022',module:'ESNext',moduleResolution:'bundler',skipLibCheck:true,noEmit:true},include:['src/**/*.ts','examples/**/*.ts']};
write('tsconfig.json',JSON.stringify(config,null,2)+'\n');
write('tsconfig.build.json',JSON.stringify({extends:'./tsconfig.json',compilerOptions:{noEmit:false,outDir:'dist'},exclude:['**/*.test.ts']},null,2)+'\n');
write('vitest.config.ts',"import { defineConfig } from 'vitest/config';\nexport default defineConfig({test:{include:['src/**/*.test.ts'],maxWorkers:1}});\n");
write('.gitignore','node_modules/\ndist/\ncoverage/\n');
for (const file of files) {
  const content = fs.readFileSync(path.join(destination,file.path),'utf8');
  if (/ai_training|training_runs|CURRENT_TRAINING_STATUS|P1_final|COVERAGE_FIT/.test(content)) throw new Error(`交付检查发现研究引用：${file.path}`);
  if (file.path.endsWith('.ts')) {
    const ast = ts.createSourceFile(file.path,content,ts.ScriptTarget.Latest,true);
    for (const statement of ast.statements) {
      if ((!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      if (!specifier.startsWith('.')) continue;
      const resolved = path.resolve(destination,path.dirname(file.path),specifier);
      if (!resolved.startsWith(destination + path.sep) || ![resolved,resolved+'.ts',path.join(resolved,'index.ts')].some(candidate=>fs.existsSync(candidate))) {
        throw new Error(`交付缺少相对依赖：${file.path} -> ${specifier}`);
      }
    }
  }
}
write('DELIVERY_MANIFEST.json',JSON.stringify({schema:2,createdAt:new Date().toISOString(),rulesRevision:'apk-4.2.5.1-rules-20261013-r4',apkNativeAiIncluded:false,knownRuleGaps:[],unresolvedReplayIds:['20260704_132339_097'],apkStateCompared:false,apkTargetedStateComparison:{replayId:'dfe18a69c9affc588808e13e',coordinate:[11,12],graveTransitions:10,equal:true,fullStateCompared:false},strictReplayValidation:{targetRecords:4563,randomSampleCount:20,randomSampleRecords:12916,seed:20261013,full257Rerun:false},policyImplementations:['HeuristicAI: 项目启发式基线','ApkLikeAI: APK 调度近似，非原生等价移植'],omittedPolicyTests,files},null,2)+'\n');
console.log(`已生成 ${files.length} 个交付文件：${destination}`);
