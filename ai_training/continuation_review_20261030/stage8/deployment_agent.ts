import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DualStreamModel} from '../../../src/ai_runtime/dual_v3/model_runtime';
import {NeuralBeamSearchAI} from '../../../src/ai_runtime/dual_v3/beam_search';
import {deploymentSearchOptions} from '../../../src/ai_runtime/dual_v3/deployment_config';
import type {GameEngine} from '../../../src/game/engine';
import type {ModelIdentity} from './client_v2';
const models=new Map<string,DualStreamModel>();
/** 每次决策与应用一样新建搜索器，模型权重按线程只读复用。 */
export class DeploymentAgent {
    private last!:NeuralBeamSearchAI;
    private model:DualStreamModel;
    constructor(private identity:ModelIdentity){
        let loaded=models.get(identity.sha256);
        if(!loaded){const b=fs.readFileSync(identity.prefix+'.bin');assert.equal(createHash('sha256').update(b).digest('hex'),identity.sha256);
            loaded=new DualStreamModel(JSON.parse(fs.readFileSync(identity.prefix+'.json','utf8')),b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));models.set(identity.sha256,loaded);}
        this.model=loaded;
    }
    get telemetry(){return this.last.telemetry;}
    getAction(engine:GameEngine,player:number){this.last=new NeuralBeamSearchAI(this.model,deploymentSearchOptions(this.identity.sha256));return this.last.getAction(engine,player);}
}
