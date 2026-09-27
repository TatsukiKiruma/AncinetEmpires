import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadDualHeadModelFromJson, predictDecision } from './skirmish_dual_head_net';

const modelPath = path.resolve('src/game/ai/models/trained_5map_dual_head.json');
console.log(`Checking trained model at ${modelPath}...`);

const jsonStr = fs.readFileSync(modelPath, 'utf8');
const net = loadDualHeadModelFromJson(jsonStr);

console.log('Model loaded successfully!');
console.log('Trunk layers:', net.trunkLayers.length);
console.log('Policy layers:', net.policyLayers.length);
console.log('Value layers:', net.valueLayers.length);

// Test dummy forward pass
const dummyState = new Array(356).fill(0.1);
const dummyCand = [new Array(45).fill(0.2), new Array(45).fill(0.5)];
const dec = predictDecision(net, dummyState, dummyCand);

console.log('Decision logits:', dec.logits);
console.log('Decision value:', dec.value);
console.log('Top index:', dec.bestActionIndex);
