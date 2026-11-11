import assert from 'node:assert/strict';
import { read,save } from './io';
import { compare } from './numeric';
const name=process.argv[2]??'initial',result=compare(read('inputs.json'),read(`python-${name}.json`),read(`numeric-model-${name}.json`));
save(`numeric-${name}.json`,result);console.log(result);assert.ok(result.passed);
