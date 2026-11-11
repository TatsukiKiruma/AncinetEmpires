"""创建阶段三的版本化适配文件、配置和只读历史身份快照。"""
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
STAGE1 = HERE.parent / 'stage1'


def sha(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def save(path, value):
    if path.exists():
        raise ValueError('不能覆盖已冻结文件：' + str(path))
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), 'utf-8')


def main():
    source = (STAGE1 / 'encode_server.ts').read_text('utf-8')
    source = source.replace("from './io';", "from '../stage1/io';\nimport { preflight, sealedAllowed } from './identity';\npreflight();\nconst sealed = process.argv.includes('--sealed');\nif (sealed) sealedAllowed();")
    source = source.replace("process.argv[2] ?? 'D:/", "'D:/")
    source = source.replace("!['train', 'dev'].includes(p.split)", "!(sealed ? ['test'] : ['train', 'dev']).includes(p.split)")
    source = source.replace("const packed = encode(p, decision(p, item));", "if (sealed) fs.appendFileSync('D:/AncientEmpiresData/continuation_stage3_20261030_v1/SEALED_ACCESS.jsonl', JSON.stringify({parentId:p.parentId, macro:item.macro, purpose:'locked-final-offline'}) + '\\n');\n        const packed = encode(p, decision(p, item));")
    (HERE / 'encode_server.ts').write_text(source, 'utf-8')
    source = (STAGE1 / 'parity.ts').read_text('utf-8').replace("from './io';", "from '../stage1/io';\nimport { S3 } from './identity';")
    source = source.replace("path.join(HERE, 'parity.frames')", "path.join(S3, 'parity.frames')").replace("path.join(HERE, 'parity-reference.json')", "path.join(S3, 'parity-reference.json')").replace("path.join(HERE, 'EXPORT_PARITY.json')", "path.join(S3, 'EXPORT_PARITY.json')")
    (HERE / 'parity.ts').write_text(source, 'utf-8')
    config = dict(schema='stage3-omni-full1x-v1', seed=20261030, updates=100000, sampleBudget=3200000,
                  effectiveBatch=32, microbatch=8, peakLearningRate=1e-4, endLearningRate=1.5e-5,
                  warmupUpdates=1000, weightDecay=1e-4, clip=1., priorDropout=.25,
                  priorScaleStart=1., priorScaleEnd=.30, checkpointEvery=500, diagnosticEvery=20000,
                  wallSeconds=43200, encodingTimeout=120, lowFreeDiskBytes=10737418240,
                  proportions={'old2':.17,'new2':.17,'new3':.33,'new4':.33},
                  earlyStop=dict(oldNllRelative=.08, oldBrierIncrease=.03, consecutive=2, newPlateauStart=60000,newNllImprovementThreshold=.005,newBrierChangeAtLeast=0),
                  candidateUpdates=[40000,100000], maxAdditionalOfflineBest=1,
                  selection='开发54局按人数等权平均归一化排名，依次以独胜、new/dev NLL、old/dev Brier破同分；每候选先验0.3与1.0；最多三个权重点；测试不得用于回调',
                  sealed='候选及唯一先验锁定后，一次性329父局固定分层离线+54局配对验收',
                  limitations='八张官方双人标准初态必然共享已知地图；测试新父局原态在锁定前不访问；先冻结测试元数据及种子，锁定后物化')
    save(HERE / 'CONFIG.json', config)
    paths = []
    for stage in ['stage1', 'stage2']:
        for p in (HERE.parent / stage).rglob('*'):
            if p.is_file() and '__pycache__' not in p.parts:
                paths.append(p)
    save(HERE / 'HISTORICAL_PRESERVATION.json', {'files':{str(p.relative_to(ROOT)).replace('\\','/'):sha(p) for p in paths}})
    save(HERE / 'AUTHORIZATION.json', dict(source='用户本次粘贴的第三阶段明确授权', schema='stage3-omni-v1',
          overrides=['旧STAGE3_PROPOSAL零预算','旧75%双人比例','旧40局只双人筛选预算'],
          checkpointSha256='338dea17879354363c7e76a9921eb97ec0bf9e2d87709661b55a9b82af86a34b',
          dataRoot='D:/AncientEmpiresData/continuation_stage3_20261030_v1',
          publicRulesEdits=False, uiDeployment=False, phone=False, stage4=False))
    print(json.dumps(dict(config=config, historicalFiles=len(paths)), ensure_ascii=False))


if __name__ == '__main__':
    main()
