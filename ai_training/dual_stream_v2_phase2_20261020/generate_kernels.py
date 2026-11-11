from pathlib import Path
p=Path('src/ai_runtime/dual_v2/matrix_kernels.ts')
shapes=[(306,48),(48,8),(8,48),(64,8),(8,64),(96,16),(16,96),(48,64),(64,96),(66,96),(96,64),(64,48),(130,128),(16,16),(16,4),(128,384),(128,128),(128,256),(256,128),(128,64),(64,64),(128,36),(64,36),(459,128)]
s=["import { tensor } from './tensor_workspace';",'/** 固定维度双行四列矩阵内核；由阶段2 generate_kernels.py 确定生成。 */','type Kernel = (x: Float32Array, rows: number, w: Float32Array, bias?: Float32Array) => Float32Array;']
for ci,co in shapes:
    skip = 'if (v0 === 0 && v1 === 0) continue;' if ci in [16,130,256,306] else ''
    declarations=', '.join(f's{r}{c} = 0' for r in range(2) for c in range(4))
    adds='\n                '.join(f's{r}{c} += v{r} * w{c};' for r in range(2) for c in range(4))
    writes='\n            '.join(f'y[yi + {r*co} + o + {c}] = s{r}{c} + (bias?.[o + {c}] ?? 0);' for r in range(2) for c in range(4))
    s.append(f'''function matrix{ci}x{co}(x: Float32Array, rows: number, w: Float32Array, bias?: Float32Array): Float32Array {{
    const y = tensor(rows * {co}, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {{
        const xi = r * {ci}, yi = r * {co};
        for (let o = 0; o < {co}; o += 4) {{
            let {declarations}, wi = o * {ci};
            for (let k = 0; k < {ci}; k++, wi += 4) {{
                const v0 = x[xi + k], v1 = x[xi + {ci} + k]; {skip}
                const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
                {adds}
            }}
            {writes}
        }}
    }}
    if (r < rows) for (let o = 0; o < {co}; o += 4) {{
        let a = 0, b = 0, c = 0, d = 0, wi = o * {ci};
        for (let k = 0; k < {ci}; k++, wi += 4) {{ const v = x[r * {ci} + k]; a += v * w[wi]; b += v * w[wi + 1]; c += v * w[wi + 2]; d += v * w[wi + 3]; }}
        y[r * {co} + o] = a + (bias?.[o] ?? 0); y[r * {co} + o + 1] = b + (bias?.[o + 1] ?? 0);
        y[r * {co} + o + 2] = c + (bias?.[o + 2] ?? 0); y[r * {co} + o + 3] = d + (bias?.[o + 3] ?? 0);
    }}
    return y;
}}''')
s.append('export const MATRIX_KERNELS: Record<string, Kernel> = {'+', '.join(f"'{ci}:{co}': matrix{ci}x{co}" for ci,co in shapes)+'};\n')
p.write_text('\n\n'.join(s),encoding='utf-8')
