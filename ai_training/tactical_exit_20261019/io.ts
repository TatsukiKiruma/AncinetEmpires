import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
export const DIR=path.dirname(fileURLToPath(import.meta.url));
export const sha=(x:string|Buffer)=>createHash('sha256').update(x).digest('hex');
export const hash=(x:unknown)=>sha(JSON.stringify(x));
export const read=(n:string)=>JSON.parse(fs.readFileSync(path.resolve(DIR,n),'utf8').replace(/^\uFEFF/,''));
export function save(n:string,x:unknown){const p=path.resolve(DIR,n);if(!p.startsWith(DIR+path.sep))throw Error('输出越界');fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(x));}
export { quantiles } from '../tactical_value_search_20261018/io';
