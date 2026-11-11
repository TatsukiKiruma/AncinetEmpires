// Read-only audit loader: transpiles local TypeScript without installing project dependencies.
// No game/source files are changed. Only import.meta filename boilerplate is adapted for CJS.
const fs = require('fs');
const cp = require('child_process');
const path = require('path');
const ts = require(path.join(cp.execSync('npm root -g',{encoding:'utf8'}).trim(),'typescript'));
require.extensions['.ts'] = function(mod, filename) {
 let text = fs.readFileSync(filename,'utf8');
 text = text.replace(/^const __filename = fileURLToPath\(import\.meta\.url\);\r?$/mg,'');
 text = text.replace(/^const __dirname = path\.dirname\(__filename\);\r?$/mg,'');
 const out=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},fileName:filename});
 mod._compile(out.outputText,filename);
};
