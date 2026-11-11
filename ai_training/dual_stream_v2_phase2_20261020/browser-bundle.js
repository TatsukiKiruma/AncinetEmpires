(() => {
  // ../src/ai_runtime/dual_v2/contract.ts
  var SCHEMA_ID = "dual-stream-v2-phase1-v1";

  // ../src/ai_runtime/dual_v2/tensor_workspace.ts
  var TensorWorkspace = class {
    constructor() {
      this.blocks = [];
      this.cursor = 0;
    }
    reset() {
      this.cursor = 0;
    }
    allocate(length, clear) {
      const index = this.cursor++;
      let block = this.blocks[index];
      if (!block || block.length < length) this.blocks[index] = block = new Float32Array(length);
      const result = block.length === length ? block : block.subarray(0, length);
      if (clear) result.fill(0);
      return result;
    }
  };
  var active;
  function tensor(length, clear = true) {
    return active ? active.allocate(length, clear) : new Float32Array(length);
  }
  function withTensorWorkspace(workspace, run) {
    const previous = active;
    active = workspace;
    workspace.reset();
    try {
      return run();
    } finally {
      active = previous;
    }
  }

  // ../src/ai_runtime/dual_v2/matrix_kernels.ts
  function matrix306x48(x, rows, w, bias) {
    const y = tensor(rows * 48, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 306, yi = r * 48;
      for (let o = 0; o < 48; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 306;
        for (let k = 0; k < 306; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 306 + k];
          if (v0 === 0 && v1 === 0) continue;
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 48 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 48 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 48 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 48 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 48; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 306;
      for (let k = 0; k < 306; k++, wi += 4) {
        const v = x[r * 306 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 48 + o] = a + (bias?.[o] ?? 0);
      y[r * 48 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 48 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 48 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix48x8(x, rows, w, bias) {
    const y = tensor(rows * 8, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 48, yi = r * 8;
      for (let o = 0; o < 8; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 48;
        for (let k = 0; k < 48; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 48 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 8 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 8 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 8 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 8 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 8; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 48;
      for (let k = 0; k < 48; k++, wi += 4) {
        const v = x[r * 48 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 8 + o] = a + (bias?.[o] ?? 0);
      y[r * 8 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 8 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 8 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix8x48(x, rows, w, bias) {
    const y = tensor(rows * 48, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 8, yi = r * 48;
      for (let o = 0; o < 48; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 8;
        for (let k = 0; k < 8; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 8 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 48 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 48 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 48 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 48 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 48; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 8;
      for (let k = 0; k < 8; k++, wi += 4) {
        const v = x[r * 8 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 48 + o] = a + (bias?.[o] ?? 0);
      y[r * 48 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 48 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 48 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix64x8(x, rows, w, bias) {
    const y = tensor(rows * 8, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 64, yi = r * 8;
      for (let o = 0; o < 8; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 64;
        for (let k = 0; k < 64; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 64 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 8 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 8 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 8 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 8 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 8; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 64;
      for (let k = 0; k < 64; k++, wi += 4) {
        const v = x[r * 64 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 8 + o] = a + (bias?.[o] ?? 0);
      y[r * 8 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 8 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 8 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix8x64(x, rows, w, bias) {
    const y = tensor(rows * 64, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 8, yi = r * 64;
      for (let o = 0; o < 64; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 8;
        for (let k = 0; k < 8; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 8 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 64 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 64 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 64 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 64 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 64; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 8;
      for (let k = 0; k < 8; k++, wi += 4) {
        const v = x[r * 8 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 64 + o] = a + (bias?.[o] ?? 0);
      y[r * 64 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 64 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 64 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix96x16(x, rows, w, bias) {
    const y = tensor(rows * 16, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 96, yi = r * 16;
      for (let o = 0; o < 16; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 96;
        for (let k = 0; k < 96; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 96 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 16 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 16 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 16 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 16 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 16; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 96;
      for (let k = 0; k < 96; k++, wi += 4) {
        const v = x[r * 96 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 16 + o] = a + (bias?.[o] ?? 0);
      y[r * 16 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 16 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 16 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix16x96(x, rows, w, bias) {
    const y = tensor(rows * 96, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 16, yi = r * 96;
      for (let o = 0; o < 96; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 16;
        for (let k = 0; k < 16; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 16 + k];
          if (v0 === 0 && v1 === 0) continue;
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 96 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 96 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 96 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 96 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 96; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 16;
      for (let k = 0; k < 16; k++, wi += 4) {
        const v = x[r * 16 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 96 + o] = a + (bias?.[o] ?? 0);
      y[r * 96 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 96 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 96 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix48x64(x, rows, w, bias) {
    const y = tensor(rows * 64, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 48, yi = r * 64;
      for (let o = 0; o < 64; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 48;
        for (let k = 0; k < 48; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 48 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 64 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 64 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 64 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 64 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 64; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 48;
      for (let k = 0; k < 48; k++, wi += 4) {
        const v = x[r * 48 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 64 + o] = a + (bias?.[o] ?? 0);
      y[r * 64 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 64 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 64 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix64x96(x, rows, w, bias) {
    const y = tensor(rows * 96, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 64, yi = r * 96;
      for (let o = 0; o < 96; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 64;
        for (let k = 0; k < 64; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 64 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 96 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 96 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 96 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 96 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 96; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 64;
      for (let k = 0; k < 64; k++, wi += 4) {
        const v = x[r * 64 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 96 + o] = a + (bias?.[o] ?? 0);
      y[r * 96 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 96 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 96 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix66x96(x, rows, w, bias) {
    const y = tensor(rows * 96, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 66, yi = r * 96;
      for (let o = 0; o < 96; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 66;
        for (let k = 0; k < 66; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 66 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 96 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 96 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 96 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 96 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 96; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 66;
      for (let k = 0; k < 66; k++, wi += 4) {
        const v = x[r * 66 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 96 + o] = a + (bias?.[o] ?? 0);
      y[r * 96 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 96 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 96 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix96x64(x, rows, w, bias) {
    const y = tensor(rows * 64, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 96, yi = r * 64;
      for (let o = 0; o < 64; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 96;
        for (let k = 0; k < 96; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 96 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 64 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 64 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 64 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 64 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 64; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 96;
      for (let k = 0; k < 96; k++, wi += 4) {
        const v = x[r * 96 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 64 + o] = a + (bias?.[o] ?? 0);
      y[r * 64 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 64 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 64 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix64x48(x, rows, w, bias) {
    const y = tensor(rows * 48, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 64, yi = r * 48;
      for (let o = 0; o < 48; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 64;
        for (let k = 0; k < 64; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 64 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 48 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 48 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 48 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 48 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 48; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 64;
      for (let k = 0; k < 64; k++, wi += 4) {
        const v = x[r * 64 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 48 + o] = a + (bias?.[o] ?? 0);
      y[r * 48 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 48 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 48 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix130x128(x, rows, w, bias) {
    const y = tensor(rows * 128, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 130, yi = r * 128;
      for (let o = 0; o < 128; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 130;
        for (let k = 0; k < 130; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 130 + k];
          if (v0 === 0 && v1 === 0) continue;
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 128 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 128 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 128 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 128 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 128; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 130;
      for (let k = 0; k < 130; k++, wi += 4) {
        const v = x[r * 130 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 128 + o] = a + (bias?.[o] ?? 0);
      y[r * 128 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 128 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 128 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix16x16(x, rows, w, bias) {
    const y = tensor(rows * 16, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 16, yi = r * 16;
      for (let o = 0; o < 16; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 16;
        for (let k = 0; k < 16; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 16 + k];
          if (v0 === 0 && v1 === 0) continue;
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 16 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 16 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 16 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 16 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 16; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 16;
      for (let k = 0; k < 16; k++, wi += 4) {
        const v = x[r * 16 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 16 + o] = a + (bias?.[o] ?? 0);
      y[r * 16 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 16 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 16 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix16x4(x, rows, w, bias) {
    const y = tensor(rows * 4, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 16, yi = r * 4;
      for (let o = 0; o < 4; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 16;
        for (let k = 0; k < 16; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 16 + k];
          if (v0 === 0 && v1 === 0) continue;
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 4 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 4 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 4 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 4 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 4; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 16;
      for (let k = 0; k < 16; k++, wi += 4) {
        const v = x[r * 16 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 4 + o] = a + (bias?.[o] ?? 0);
      y[r * 4 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 4 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 4 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix128x384(x, rows, w, bias) {
    const y = tensor(rows * 384, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 128, yi = r * 384;
      for (let o = 0; o < 384; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 128;
        for (let k = 0; k < 128; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 128 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 384 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 384 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 384 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 384 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 384; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 128;
      for (let k = 0; k < 128; k++, wi += 4) {
        const v = x[r * 128 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 384 + o] = a + (bias?.[o] ?? 0);
      y[r * 384 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 384 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 384 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix128x128(x, rows, w, bias) {
    const y = tensor(rows * 128, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 128, yi = r * 128;
      for (let o = 0; o < 128; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 128;
        for (let k = 0; k < 128; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 128 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 128 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 128 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 128 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 128 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 128; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 128;
      for (let k = 0; k < 128; k++, wi += 4) {
        const v = x[r * 128 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 128 + o] = a + (bias?.[o] ?? 0);
      y[r * 128 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 128 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 128 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix128x256(x, rows, w, bias) {
    const y = tensor(rows * 256, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 128, yi = r * 256;
      for (let o = 0; o < 256; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 128;
        for (let k = 0; k < 128; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 128 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 256 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 256 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 256 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 256 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 256; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 128;
      for (let k = 0; k < 128; k++, wi += 4) {
        const v = x[r * 128 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 256 + o] = a + (bias?.[o] ?? 0);
      y[r * 256 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 256 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 256 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix256x128(x, rows, w, bias) {
    const y = tensor(rows * 128, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 256, yi = r * 128;
      for (let o = 0; o < 128; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 256;
        for (let k = 0; k < 256; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 256 + k];
          if (v0 === 0 && v1 === 0) continue;
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 128 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 128 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 128 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 128 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 128; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 256;
      for (let k = 0; k < 256; k++, wi += 4) {
        const v = x[r * 256 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 128 + o] = a + (bias?.[o] ?? 0);
      y[r * 128 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 128 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 128 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix128x64(x, rows, w, bias) {
    const y = tensor(rows * 64, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 128, yi = r * 64;
      for (let o = 0; o < 64; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 128;
        for (let k = 0; k < 128; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 128 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 64 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 64 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 64 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 64 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 64; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 128;
      for (let k = 0; k < 128; k++, wi += 4) {
        const v = x[r * 128 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 64 + o] = a + (bias?.[o] ?? 0);
      y[r * 64 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 64 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 64 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix64x64(x, rows, w, bias) {
    const y = tensor(rows * 64, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 64, yi = r * 64;
      for (let o = 0; o < 64; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 64;
        for (let k = 0; k < 64; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 64 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 64 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 64 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 64 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 64 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 64; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 64;
      for (let k = 0; k < 64; k++, wi += 4) {
        const v = x[r * 64 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 64 + o] = a + (bias?.[o] ?? 0);
      y[r * 64 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 64 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 64 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix128x36(x, rows, w, bias) {
    const y = tensor(rows * 36, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 128, yi = r * 36;
      for (let o = 0; o < 36; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 128;
        for (let k = 0; k < 128; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 128 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 36 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 36 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 36 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 36 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 36; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 128;
      for (let k = 0; k < 128; k++, wi += 4) {
        const v = x[r * 128 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 36 + o] = a + (bias?.[o] ?? 0);
      y[r * 36 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 36 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 36 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix64x36(x, rows, w, bias) {
    const y = tensor(rows * 36, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 64, yi = r * 36;
      for (let o = 0; o < 36; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 64;
        for (let k = 0; k < 64; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 64 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 36 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 36 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 36 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 36 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 36; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 64;
      for (let k = 0; k < 64; k++, wi += 4) {
        const v = x[r * 64 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 36 + o] = a + (bias?.[o] ?? 0);
      y[r * 36 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 36 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 36 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  function matrix459x128(x, rows, w, bias) {
    const y = tensor(rows * 128, false);
    let r = 0;
    for (; r + 1 < rows; r += 2) {
      const xi = r * 459, yi = r * 128;
      for (let o = 0; o < 128; o += 4) {
        let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s10 = 0, s11 = 0, s12 = 0, s13 = 0, wi = o * 459;
        for (let k = 0; k < 459; k++, wi += 4) {
          const v0 = x[xi + k], v1 = x[xi + 459 + k];
          const w0 = w[wi], w1 = w[wi + 1], w2 = w[wi + 2], w3 = w[wi + 3];
          s00 += v0 * w0;
          s01 += v0 * w1;
          s02 += v0 * w2;
          s03 += v0 * w3;
          s10 += v1 * w0;
          s11 += v1 * w1;
          s12 += v1 * w2;
          s13 += v1 * w3;
        }
        y[yi + 0 + o + 0] = s00 + (bias?.[o + 0] ?? 0);
        y[yi + 0 + o + 1] = s01 + (bias?.[o + 1] ?? 0);
        y[yi + 0 + o + 2] = s02 + (bias?.[o + 2] ?? 0);
        y[yi + 0 + o + 3] = s03 + (bias?.[o + 3] ?? 0);
        y[yi + 128 + o + 0] = s10 + (bias?.[o + 0] ?? 0);
        y[yi + 128 + o + 1] = s11 + (bias?.[o + 1] ?? 0);
        y[yi + 128 + o + 2] = s12 + (bias?.[o + 2] ?? 0);
        y[yi + 128 + o + 3] = s13 + (bias?.[o + 3] ?? 0);
      }
    }
    if (r < rows) for (let o = 0; o < 128; o += 4) {
      let a = 0, b = 0, c = 0, d = 0, wi = o * 459;
      for (let k = 0; k < 459; k++, wi += 4) {
        const v = x[r * 459 + k];
        a += v * w[wi];
        b += v * w[wi + 1];
        c += v * w[wi + 2];
        d += v * w[wi + 3];
      }
      y[r * 128 + o] = a + (bias?.[o] ?? 0);
      y[r * 128 + o + 1] = b + (bias?.[o + 1] ?? 0);
      y[r * 128 + o + 2] = c + (bias?.[o + 2] ?? 0);
      y[r * 128 + o + 3] = d + (bias?.[o + 3] ?? 0);
    }
    return y;
  }
  var MATRIX_KERNELS = { "306:48": matrix306x48, "48:8": matrix48x8, "8:48": matrix8x48, "64:8": matrix64x8, "8:64": matrix8x64, "96:16": matrix96x16, "16:96": matrix16x96, "48:64": matrix48x64, "64:96": matrix64x96, "66:96": matrix66x96, "96:64": matrix96x64, "64:48": matrix64x48, "130:128": matrix130x128, "16:16": matrix16x16, "16:4": matrix16x4, "128:384": matrix128x384, "128:128": matrix128x128, "128:256": matrix128x256, "256:128": matrix256x128, "128:64": matrix128x64, "64:64": matrix64x64, "128:36": matrix128x36, "64:36": matrix64x36, "459:128": matrix459x128 };

  // ../src/ai_runtime/dual_v2/tensor_ops.ts
  var packedMatrices = /* @__PURE__ */ new WeakMap();
  var packedFourMatrices = /* @__PURE__ */ new WeakMap();
  function packedWeight(weight, input, output, cache) {
    let packed = cache ? packedMatrices.get(weight) : void 0;
    if (packed) return packed;
    packed = cache ? new Float32Array(Math.floor(output / 8) * input * 8) : tensor(Math.floor(output / 8) * input * 8);
    for (let o = 0; o + 7 < output; o += 8) for (let k = 0; k < input; k++) for (let j = 0; j < 8; j++) packed[o * input + k * 8 + j] = weight[(o + j) * input + k];
    if (cache) packedMatrices.set(weight, packed);
    return packed;
  }
  function linear(x, rows, input, weight, output, bias, cache = true) {
    const kernel = MATRIX_KERNELS[`${input}:${output}`];
    if (kernel) {
      let packed2 = cache ? packedFourMatrices.get(weight) : void 0;
      if (!packed2) {
        packed2 = cache ? new Float32Array(weight.length) : tensor(weight.length);
        for (let o = 0; o < output; o += 4) for (let k = 0; k < input; k++) for (let j = 0; j < 4; j++) packed2[o * input + k * 4 + j] = weight[(o + j) * input + k];
        if (cache) packedFourMatrices.set(weight, packed2);
      }
      return kernel(x, rows, packed2, bias);
    }
    const y = tensor(rows * output, false);
    const packed = packedWeight(weight, input, output, cache);
    for (let r = 0; r < rows; r++) {
      const xi = r * input, yi = r * output;
      let o = 0;
      for (; o + 7 < output; o += 8) {
        let a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0;
        let wi = o * input;
        for (let k = 0; k < input; k++, wi += 8) {
          const v = x[xi + k];
          if (v === 0) continue;
          a += v * packed[wi];
          b += v * packed[wi + 1];
          c += v * packed[wi + 2];
          d += v * packed[wi + 3];
          e += v * packed[wi + 4];
          f += v * packed[wi + 5];
          g += v * packed[wi + 6];
          h += v * packed[wi + 7];
        }
        y[yi + o] = a + (bias?.[o] ?? 0);
        y[yi + o + 1] = b + (bias?.[o + 1] ?? 0);
        y[yi + o + 2] = c + (bias?.[o + 2] ?? 0);
        y[yi + o + 3] = d + (bias?.[o + 3] ?? 0);
        y[yi + o + 4] = e + (bias?.[o + 4] ?? 0);
        y[yi + o + 5] = f + (bias?.[o + 5] ?? 0);
        y[yi + o + 6] = g + (bias?.[o + 6] ?? 0);
        y[yi + o + 7] = h + (bias?.[o + 7] ?? 0);
      }
      for (; o < output; o++) {
        let sum = 0;
        for (let k = 0; k < input; k++) sum += x[xi + k] * weight[o * input + k];
        y[yi + o] = sum + (bias?.[o] ?? 0);
      }
    }
    return y;
  }
  function norm(x, rows, channels, weight, bias, groups = 0, relu = false) {
    const y = tensor(x.length, false);
    if (!groups) {
      for (let row = 0; row < rows; row++) {
        const base = row * channels;
        let mean = 0, square = 0;
        for (let c = 0; c < channels; c++) {
          const v = x[base + c];
          mean += v;
          square += v * v;
        }
        mean /= channels;
        const inv = 1 / Math.sqrt(Math.max(0, square / channels - mean * mean) + 1e-5);
        for (let c = 0; c < channels; c++) {
          const v = (x[base + c] - mean) * inv * weight[c] + bias[c];
          y[base + c] = relu ? Math.max(0, v) : v;
        }
      }
    } else {
      const size = channels / groups;
      for (let g = 0; g < groups; g++) {
        let mean = 0, square = 0;
        for (let r = 0; r < rows; r++) for (let c = g * size; c < (g + 1) * size; c++) {
          const v = x[r * channels + c];
          mean += v;
          square += v * v;
        }
        mean /= rows * size;
        const inv = 1 / Math.sqrt(Math.max(0, square / (rows * size) - mean * mean) + 1e-5);
        for (let r = 0; r < rows; r++) for (let c = g * size; c < (g + 1) * size; c++) {
          const v = (x[r * channels + c] - mean) * inv * weight[c] + bias[c];
          y[r * channels + c] = relu ? Math.max(0, v) : v;
        }
      }
    }
    return y;
  }
  function add(x, y, scale = 1, relu = false) {
    const out = tensor(x.length, false);
    for (let i = 0; i < out.length; i++) {
      const v = x[i] + scale * y[i];
      out[i] = relu ? Math.max(0, v) : v;
    }
    return out;
  }
  function pool(x, height, width, channels) {
    const h = Math.ceil(height / 2), w = Math.ceil(width / 2), out = tensor(h * w * channels, false);
    for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) for (let c = 0; c < channels; c++) {
      let sum = 0, count = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) if (2 * y + dy < height && 2 * xx + dx < width) {
        sum += x[((2 * y + dy) * width + 2 * xx + dx) * channels + c];
        count++;
      }
      out[(y * w + xx) * channels + c] = sum / count;
    }
    return out;
  }
  function upsample(x, sourceWidth, height, width, channels) {
    const out = tensor(height * width * channels, false);
    for (let y = 0; y < height; y++) for (let xx = 0; xx < width; xx++) {
      const src = (Math.floor(y / 2) * sourceWidth + Math.floor(xx / 2)) * channels;
      out.set(x.subarray(src, src + channels), (y * width + xx) * channels);
    }
    return out;
  }
  function depthwise(x, height, width, channels, weight, bias) {
    const out = tensor(x.length, false);
    const stride = (width + 2) * channels, padded = tensor((height + 2) * stride);
    for (let y = 0; y < height; y++) padded.set(x.subarray(y * width * channels, (y + 1) * width * channels), (y + 1) * stride + channels);
    for (let y = 0; y < height; y++) for (let xx = 0; xx < width; xx++) for (let c = 0; c < channels; c++) {
      const i = y * stride + xx * channels + c, wi = c * 9;
      let sum = padded[i] * weight[wi];
      sum += padded[i + channels] * weight[wi + 1];
      sum += padded[i + 2 * channels] * weight[wi + 2];
      sum += padded[i + stride] * weight[wi + 3];
      sum += padded[i + stride + channels] * weight[wi + 4];
      sum += padded[i + stride + 2 * channels] * weight[wi + 5];
      sum += padded[i + 2 * stride] * weight[wi + 6];
      sum += padded[i + 2 * stride + channels] * weight[wi + 7];
      sum += padded[i + 2 * stride + 2 * channels] * weight[wi + 8];
      out[(y * width + xx) * channels + c] = sum + bias[c];
    }
    return out;
  }
  function softmax(x, mask) {
    const out = tensor(x.length);
    let max = -Infinity, sum = 0;
    for (let i = 0; i < x.length; i++) if (!mask || mask[i]) max = Math.max(max, x[i]);
    if (!Number.isFinite(max)) throw Error("\u6982\u7387\u5206\u5E03\u6CA1\u6709\u6709\u6548\u5019\u9009");
    for (let i = 0; i < x.length; i++) if (!mask || mask[i]) {
      out[i] = Math.exp(x[i] - max);
      sum += out[i];
    }
    for (let i = 0; i < x.length; i++) out[i] /= sum;
    return out;
  }

  // ../src/ai_runtime/dual_v2/spatial_model.ts
  function spatialForward(input, weights) {
    const { height: h, width: w } = input, area = h * w;
    const dense = (x, rows, ci, co, key) => linear(x, rows, ci, weights[key + ".weight"], co, weights[key + ".bias"]);
    const normalization = (x, rows, c, key, relu = true) => norm(x, rows, c, weights[key + ".weight"], weights[key + ".bias"], 8, relu);
    const block = (x, hh, ww, c, key) => {
      const rank = c === 96 ? 16 : 8;
      let z3 = normalization(dense(x, hh * ww, c, rank, key + ".reduce"), hh * ww, rank, key + ".norm1");
      z3 = normalization(depthwise(z3, hh, ww, rank, weights[key + ".depth.weight"], weights[key + ".depth.bias"]), hh * ww, rank, key + ".norm2");
      return add(x, normalization(dense(z3, hh * ww, rank, c, key + ".expand"), hh * ww, c, key + ".norm3", false), 0.5, true);
    };
    const patches = tensor(area * 306);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 34; c++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (y + dy >= 0 && y + dy < h && x + dx >= 0 && x + dx < w) patches[(y * w + x) * 306 + c * 9 + (dy + 1) * 3 + dx + 1] = input.spatialTensor[c * area + (y + dy) * w + x + dx];
    }
    let z0 = normalization(dense(patches, area, 306, 48, "map.stem"), area, 48, "map.stem_norm");
    z0 = block(block(z0, h, w, 48, "map.stage0.0"), h, w, 48, "map.stage0.1");
    const h1 = Math.ceil(h / 2), w1 = Math.ceil(w / 2), h2 = Math.ceil(h1 / 2), w2 = Math.ceil(w1 / 2);
    let z1 = dense(pool(z0, h, w, 48), h1 * w1, 48, 64, "map.down1");
    z1 = block(block(z1, h1, w1, 64, "map.stage1.0"), h1, w1, 64, "map.stage1.1");
    let z2 = dense(pool(z1, h1, w1, 64), h2 * w2, 64, 96, "map.down2");
    z2 = block(block(z2, h2, w2, 96, "map.stage2.0"), h2, w2, 96, "map.stage2.1");
    const context = dense(input.playerOrder.features, 1, 66, 96, "map.context");
    for (let i = 0; i < z2.length; i++) z2[i] += context[i % 96];
    let z = block(add(dense(upsample(z2, w2, h1, w1, 96), h1 * w1, 96, 64, "map.up1"), z1), h1, w1, 64, "map.decode1");
    z = block(add(dense(upsample(z, w1, h, w, 64), area, 64, 48, "map.up0"), z0), h, w, 48, "map.decode0");
    const map = dense(z, area, 48, 64, "map.out"), pooled = tensor(64);
    for (let c = 0; c < 64; c++) {
      let sum = 0;
      for (let tile = 0; tile < area; tile++) sum += map[tile * 64 + c];
      pooled[c] = sum / area;
    }
    return { map, pooled };
  }

  // ../src/ai_runtime/dual_v2/attention.ts
  function relationalAttention(qkv, tokens, entities, bias) {
    const out = tensor(tokens * 128);
    for (let head = 0; head < 4; head++) {
      const q = tensor(tokens * 32), k = tensor(tokens * 32), vTranspose = tensor(tokens * 32);
      for (let i = 0; i < tokens; i++) for (let c = 0; c < 32; c++) {
        q[i * 32 + c] = qkv[i * 384 + head * 32 + c];
        k[i * 32 + c] = qkv[i * 384 + 128 + head * 32 + c];
        vTranspose[c * tokens + i] = qkv[i * 384 + 256 + head * 32 + c];
      }
      const scores = linear(q, tokens, 32, k, tokens, void 0, false);
      for (let i = 0; i < tokens; i++) {
        let max = -Infinity, sum = 0;
        for (let j = 0; j < tokens; j++) {
          const idx = i * tokens + j;
          scores[idx] = Math.fround(scores[idx] / Math.sqrt(32)) + (i < entities && j < entities ? bias[(i * entities + j) * 4 + head] : 0);
          max = Math.max(max, scores[idx]);
        }
        for (let j = 0; j < tokens; j++) {
          const idx = i * tokens + j;
          scores[idx] = Math.exp(scores[idx] - max);
          sum += scores[idx];
        }
        for (let j = 0; j < tokens; j++) scores[i * tokens + j] /= sum;
      }
      const attended = linear(scores, tokens, tokens, vTranspose, 32, void 0, false);
      for (let i = 0; i < tokens; i++) out.set(attended.subarray(i * 32, (i + 1) * 32), i * 128 + head * 32);
    }
    return out;
  }

  // ../src/ai_runtime/dual_v2/entity_model.ts
  function entityForward(input, map, pooled, weights) {
    const n = input.entityIndexMap.globalActorIdx, t = n + 1;
    const dense = (x, rows, ci, co, key) => linear(x, rows, ci, weights[key + ".weight"], co, weights[key + ".bias"]);
    const normalization = (x, rows, key, relu = false) => norm(x, rows, 128, weights[key + ".weight"], weights[key + ".bias"], 0, relu);
    const tokens = tensor(n * 130), relations = tensor(input.relationalBias.length);
    for (let i = 0; i < relations.length; i++) relations[i] = Math.max(-4, Math.min(4, input.relationalBias[i]));
    for (let i = 0; i < n; i++) {
      const raw = input.entityTokens.subarray(i * 66, (i + 1) * 66), tile = raw[34] * input.width + raw[33];
      for (let c = 0; c < 66; c++) tokens[i * 130 + c] = Math.max(-4, Math.min(4, raw[c] * (c === 33 || c === 34 ? 1 / 64 : 1)));
      tokens.set(map.subarray(tile * 64, (tile + 1) * 64), i * 130 + 66);
    }
    let ent = tensor(t * 128);
    ent.set(normalization(dense(tokens, n, 130, 128, "entity_proj"), n, "entity_norm", true));
    const global = tensor(130);
    global.set(pooled);
    global.set(input.playerOrder.features, 64);
    ent.set(normalization(dense(global, 1, 130, 128, "global_proj"), 1, "global_norm", true), n * 128);
    const hiddenRel = dense(relations, n * n, 16, 16, "rel1");
    for (let i = 0; i < hiddenRel.length; i++) hiddenRel[i] = Math.max(0, hiddenRel[i]);
    const bias = dense(hiddenRel, n * n, 16, 4, "rel2");
    for (let layer = 0; layer < 2; layer++) {
      const key = `blocks.${layer}`, qkv = dense(normalization(ent, t, key + ".ln1"), t, 128, 384, key + ".qkv");
      const attended = relationalAttention(qkv, t, n, bias);
      ent = add(ent, dense(attended, t, 128, 128, key + ".proj"));
      const ff = dense(normalization(ent, t, key + ".ln2"), t, 128, 256, key + ".ff1");
      for (let i = 0; i < ff.length; i++) ff[i] = Math.max(0, ff[i]);
      ent = add(ent, dense(ff, t, 256, 128, key + ".ff2"));
    }
    return { entities: ent, relations };
  }

  // ../src/ai_runtime/dual_v2/policy_model.ts
  function policyForward(input, ent, map, relations, weights) {
    const n = input.entityIndexMap.globalActorIdx, t = n + 1, area = input.width * input.height;
    const dense = (x, rows, ci, co, key) => linear(x, rows, ci, weights[key + ".weight"], co, weights[key + ".bias"]);
    const ptr = input.actions.pointers, tileRows = new Int32Array(area).fill(-1), usedTiles = [];
    for (let a = 0; a < ptr.length; a += 5) {
      const tile = ptr[a + 1];
      if (tile >= 0 && tileRows[tile] < 0) {
        tileRows[tile] = usedTiles.length;
        usedTiles.push(tile);
      }
    }
    const tileFeatures = tensor(usedTiles.length * 64);
    for (let i = 0; i < usedTiles.length; i++) tileFeatures.set(map.subarray(usedTiles[i] * 64, (usedTiles[i] + 1) * 64), i * 64);
    const who = dense(ent, t, 128, 1, "who"), query = dense(ent, t, 128, 64, "tile_q"), keys = dense(tileFeatures, usedTiles.length, 64, 64, "tile_k");
    const semanticEntity = dense(ent, t, 128, 36, "what_entity"), semanticTile = dense(keys, usedTiles.length, 64, 36, "what_tile");
    const logits = tensor(ptr.length / 5), headIndex = { 1: 0, 7: 1, 8: 2, 9: 3 };
    const targetQueries = /* @__PURE__ */ new Map(), targetKeys = /* @__PURE__ */ new Map();
    const projectTarget = (entity, hi, kind, cache) => {
      const id = entity * 4 + hi;
      let result = cache.get(id);
      if (!result) {
        const key = `target_${kind}`;
        result = linear(ent.subarray(entity * 128, (entity + 1) * 128), 1, 128, weights[key + ".weight"].subarray(hi * 64 * 128, (hi + 1) * 64 * 128), 64, weights[key + ".bias"].subarray(hi * 64, (hi + 1) * 64));
        cache.set(id, result);
      }
      return result;
    };
    for (let a = 0; a < logits.length; a++) {
      const actor = ptr[a * 5], tile = ptr[a * 5 + 1], head = ptr[a * 5 + 2], cls = ptr[a * 5 + 3], target = ptr[a * 5 + 4];
      const tileRow = tile >= 0 ? tileRows[tile] : -1;
      let where = 0, targetScore = 0;
      if (tileRow >= 0) {
        for (let c = 0; c < 64; c++) where += query[actor * 64 + c] * keys[tileRow * 64 + c];
        where = Math.fround(where) / 8;
      }
      let what = Math.fround(semanticEntity[actor * 36 + head] + (tileRow >= 0 ? semanticTile[tileRow * 36 + head] : 0));
      if (cls >= 0) what = Math.fround(what + Math.fround(semanticEntity[actor * 36 + 15 + cls] + (tileRow >= 0 ? semanticTile[tileRow * 36 + 15 + cls] : 0)));
      if (target >= 0) {
        const hi = headIndex[head];
        let dot = 0, rel = 0;
        const tq = projectTarget(actor, hi, "q", targetQueries), tk = projectTarget(target, hi, "k", targetKeys);
        for (let c = 0; c < 64; c++) dot += tq[c] * tk[c];
        if (actor < n && target < n) for (let c = 0; c < 16; c++) rel += weights.target_rel[hi * 16 + c] * relations[(actor * n + target) * 16 + c];
        targetScore = Math.fround(Math.fround(dot) / 8 + Math.fround(rel));
      }
      logits[a] = Math.fround(Math.fround(Math.fround(who[actor] + where) + what) + targetScore) + weights.headBias[head];
    }
    const prior = softmax(logits), actorPrior = tensor(t), conditionalPrior = tensor(prior.length);
    const marginal = new Float64Array(t);
    for (let a = 0; a < prior.length; a++) marginal[ptr[a * 5]] += prior[a];
    for (let actor = 0; actor < t; actor++) actorPrior[actor] = marginal[actor];
    const actorMax = tensor(t).fill(-Infinity), actorSum = new Float64Array(t);
    for (let a = 0; a < prior.length; a++) {
      const actor = ptr[a * 5];
      actorMax[actor] = Math.max(actorMax[actor], logits[a]);
    }
    for (let a = 0; a < prior.length; a++) {
      const actor = ptr[a * 5];
      conditionalPrior[a] = Math.exp(logits[a] - actorMax[actor]);
      actorSum[actor] += conditionalPrior[a];
    }
    for (let a = 0; a < prior.length; a++) conditionalPrior[a] /= actorSum[ptr[a * 5]];
    return { logits, actorPrior, conditionalPrior };
  }

  // ../src/game/apk_terrain.ts
  var APK_TERRAIN_CONFIGS = [
    {
      "id": 0,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 1,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [
        2
      ],
      "graphicsType": 1
    },
    {
      "id": 2,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 3,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 4,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 5,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 6,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 7,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 8,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 9,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 10,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 11,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 12,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 13,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 14,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 15,
      "kind": 2,
      "isLand": true,
      "capturable": false,
      "flagA": 1,
      "variant": 2,
      "linkedA": -1,
      "defenseBonus": 10,
      "healPerTurn": 0,
      "moveCost": 2,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000002",
      "variants": [],
      "graphicsType": 2
    },
    {
      "id": 16,
      "kind": 2,
      "isLand": true,
      "capturable": false,
      "flagA": 1,
      "variant": 2,
      "linkedA": -1,
      "defenseBonus": 10,
      "healPerTurn": 0,
      "moveCost": 2,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000002",
      "variants": [],
      "graphicsType": 2
    },
    {
      "id": 17,
      "kind": 1,
      "isLand": true,
      "capturable": false,
      "flagA": 1,
      "variant": 1,
      "linkedA": -1,
      "defenseBonus": 15,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000003",
      "variants": [],
      "graphicsType": 3
    },
    {
      "id": 18,
      "kind": 0,
      "isLand": true,
      "capturable": false,
      "flagA": 1,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 5,
      "healPerTurn": 0,
      "moveCost": 1,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000000",
      "variants": [],
      "graphicsType": 0
    },
    {
      "id": 19,
      "kind": 1,
      "isLand": true,
      "capturable": false,
      "flagA": 1,
      "variant": 1,
      "linkedA": -1,
      "defenseBonus": 10,
      "healPerTurn": 0,
      "moveCost": 2,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000003",
      "variants": [],
      "graphicsType": 3
    },
    {
      "id": 20,
      "kind": 0,
      "isLand": true,
      "capturable": false,
      "flagA": 1,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 1,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000004",
      "variants": [],
      "graphicsType": 4
    },
    {
      "id": 21,
      "kind": 0,
      "isLand": true,
      "capturable": false,
      "flagA": 1,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 1,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000004",
      "variants": [],
      "graphicsType": 4
    },
    {
      "id": 22,
      "kind": 0,
      "isLand": true,
      "capturable": false,
      "flagA": 1,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 1,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000004",
      "variants": [],
      "graphicsType": 4
    },
    {
      "id": 23,
      "kind": 0,
      "isLand": true,
      "capturable": false,
      "flagA": 1,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 1,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000004",
      "variants": [],
      "graphicsType": 4
    },
    {
      "id": 24,
      "kind": 0,
      "isLand": true,
      "capturable": false,
      "flagA": 1,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 1,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000004",
      "variants": [],
      "graphicsType": 4
    },
    {
      "id": 25,
      "kind": 0,
      "isLand": true,
      "capturable": false,
      "flagA": 1,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 1,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000004",
      "variants": [],
      "graphicsType": 4
    },
    {
      "id": 26,
      "kind": 0,
      "isLand": true,
      "capturable": false,
      "flagA": 1,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 1,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000004",
      "variants": [],
      "graphicsType": 4
    },
    {
      "id": 27,
      "kind": 4,
      "isLand": true,
      "capturable": false,
      "flagA": 1,
      "variant": 4,
      "linkedA": -1,
      "defenseBonus": 10,
      "healPerTurn": 0,
      "moveCost": 1,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": 36,
      "flagC": 0,
      "tail": "0x00000006",
      "variants": [],
      "graphicsType": 6
    },
    {
      "id": 28,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 1,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000005",
      "variants": [],
      "graphicsType": 5
    },
    {
      "id": 29,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 1,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000005",
      "variants": [],
      "graphicsType": 5
    },
    {
      "id": 30,
      "kind": 0,
      "isLand": true,
      "capturable": false,
      "flagA": 1,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 10,
      "healPerTurn": 20,
      "moveCost": 1,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000008",
      "variants": [],
      "graphicsType": 8
    },
    {
      "id": 31,
      "kind": 5,
      "isLand": true,
      "capturable": false,
      "flagA": 1,
      "variant": 5,
      "linkedA": -1,
      "defenseBonus": 10,
      "healPerTurn": 20,
      "moveCost": 1,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000008",
      "variants": [],
      "graphicsType": 8
    },
    {
      "id": 32,
      "kind": 0,
      "isLand": true,
      "capturable": false,
      "flagA": 1,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 5,
      "healPerTurn": 0,
      "moveCost": 1,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000008",
      "variants": [],
      "graphicsType": 8
    },
    {
      "id": 33,
      "kind": 0,
      "isLand": true,
      "capturable": false,
      "flagA": 1,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 20,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000008",
      "variants": [],
      "graphicsType": 8
    },
    {
      "id": 34,
      "kind": 0,
      "isLand": true,
      "capturable": false,
      "flagA": 1,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 5,
      "healPerTurn": 0,
      "moveCost": 1,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000008",
      "variants": [],
      "graphicsType": 8
    },
    {
      "id": 35,
      "kind": 0,
      "isLand": true,
      "capturable": false,
      "flagA": 1,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 10,
      "healPerTurn": 0,
      "moveCost": 1,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000008",
      "variants": [],
      "graphicsType": 8
    },
    {
      "id": 36,
      "kind": 4,
      "isLand": true,
      "capturable": true,
      "flagA": 1,
      "variant": 4,
      "linkedA": -1,
      "defenseBonus": 15,
      "healPerTurn": 20,
      "moveCost": 1,
      "flagB": 1,
      "linkedB": 27,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000006",
      "variants": [],
      "graphicsType": 6
    },
    {
      "id": 37,
      "kind": 3,
      "isLand": true,
      "capturable": true,
      "flagA": 1,
      "variant": 3,
      "linkedA": 0,
      "defenseBonus": 15,
      "healPerTurn": 20,
      "moveCost": 1,
      "flagB": 1,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000007",
      "variants": [],
      "graphicsType": 7
    },
    {
      "id": 38,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 39,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 40,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 41,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 42,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 43,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 44,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 45,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 46,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 47,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 48,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 49,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 50,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 51,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 52,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 53,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 54,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 55,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 56,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 57,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 58,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 59,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 60,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 61,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 62,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 63,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 64,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 65,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 66,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 67,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 68,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 69,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 70,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 71,
      "kind": 0,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000001",
      "variants": [],
      "graphicsType": 1
    },
    {
      "id": 72,
      "kind": 0,
      "isLand": true,
      "capturable": false,
      "flagA": 1,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 1,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000004",
      "variants": [],
      "graphicsType": 4
    },
    {
      "id": 73,
      "kind": 0,
      "isLand": true,
      "capturable": false,
      "flagA": 1,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 1,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000004",
      "variants": [],
      "graphicsType": 4
    },
    {
      "id": 74,
      "kind": 0,
      "isLand": true,
      "capturable": false,
      "flagA": 1,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 1,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000004",
      "variants": [],
      "graphicsType": 4
    },
    {
      "id": 75,
      "kind": 0,
      "isLand": true,
      "capturable": false,
      "flagA": 1,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 1,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000004",
      "variants": [],
      "graphicsType": 4
    },
    {
      "id": 76,
      "kind": 0,
      "isLand": true,
      "capturable": false,
      "flagA": 1,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 1,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000004",
      "variants": [],
      "graphicsType": 4
    },
    {
      "id": 77,
      "kind": 0,
      "isLand": true,
      "capturable": false,
      "flagA": 1,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 1,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000004",
      "variants": [],
      "graphicsType": 4
    },
    {
      "id": 78,
      "kind": 0,
      "isLand": true,
      "capturable": false,
      "flagA": 1,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 1,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000004",
      "variants": [],
      "graphicsType": 4
    },
    {
      "id": 79,
      "kind": 0,
      "isLand": true,
      "capturable": false,
      "flagA": 1,
      "variant": 0,
      "linkedA": -1,
      "defenseBonus": 0,
      "healPerTurn": 0,
      "moveCost": 1,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000004",
      "variants": [],
      "graphicsType": 4
    },
    {
      "id": 80,
      "kind": 5,
      "isLand": true,
      "capturable": false,
      "flagA": 1,
      "variant": 5,
      "linkedA": -1,
      "defenseBonus": 10,
      "healPerTurn": 20,
      "moveCost": 1,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000008",
      "variants": [],
      "graphicsType": 8
    },
    {
      "id": 81,
      "kind": 1,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 1,
      "linkedA": -1,
      "defenseBonus": 10,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000003",
      "variants": [],
      "graphicsType": 3
    },
    {
      "id": 82,
      "kind": 1,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 1,
      "linkedA": -1,
      "defenseBonus": 10,
      "healPerTurn": 0,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000003",
      "variants": [],
      "graphicsType": 3
    },
    {
      "id": 83,
      "kind": 5,
      "isLand": false,
      "capturable": false,
      "flagA": 0,
      "variant": 5,
      "linkedA": -1,
      "defenseBonus": 10,
      "healPerTurn": 20,
      "moveCost": 3,
      "flagB": 0,
      "linkedB": -1,
      "linkedC": -1,
      "flagC": 0,
      "tail": "0x00000008",
      "variants": [],
      "graphicsType": 8
    }
  ];
  var APK_TERRAIN_BY_ID = new Map(
    APK_TERRAIN_CONFIGS.map((config) => [config.id, config])
  );
  var HIGH_CONFIDENCE_APK_TERRAIN_TO_PROJECT = {
    27: 8,
    36: 9,
    37: 10,
    72: 17
  };
  var SKIRMISH_APK_TERRAIN_TO_PROJECT = {
    // 水面与海岸变体。APK 有大量水边自动拼接 tile，项目规则层统一按深水处理。
    0: 2,
    1: 2,
    2: 2,
    3: 2,
    4: 2,
    5: 2,
    6: 2,
    7: 2,
    8: 2,
    9: 2,
    10: 2,
    11: 2,
    12: 2,
    13: 2,
    14: 2,
    38: 2,
    39: 2,
    40: 2,
    41: 2,
    42: 2,
    43: 2,
    44: 2,
    45: 2,
    46: 2,
    47: 2,
    48: 2,
    49: 2,
    50: 2,
    51: 2,
    52: 2,
    53: 2,
    54: 2,
    55: 2,
    56: 2,
    57: 2,
    58: 2,
    59: 2,
    60: 2,
    61: 2,
    62: 2,
    63: 2,
    64: 2,
    65: 2,
    66: 2,
    67: 2,
    68: 2,
    69: 2,
    70: 2,
    71: 2,
    // 常规陆地。
    15: 7,
    16: 7,
    17: 3,
    18: 1,
    19: 4,
    20: 6,
    21: 6,
    22: 6,
    23: 6,
    24: 6,
    25: 6,
    26: 6,
    32: 1,
    34: 1,
    35: 15,
    73: 6,
    74: 6,
    75: 6,
    76: 6,
    77: 6,
    78: 6,
    79: 6,
    // 桥和木桥变体。APK 文案明确桥也按水面地形处理。
    28: 17,
    29: 17,
    72: 17,
    // 非收入治疗建筑。t30/t31 已实测；t80 按 OPENCODE 反编译确认的特殊村庄/神庙混合语义处理。
    30: 11,
    31: 12,
    33: 14,
    80: 12,
    // 水域特殊 tile。OPENCODE 确认为水面障碍，不能套用神庙净化语义。
    81: 2,
    82: 2,
    // t83 是水中治疗平台，有 healPerTurn=20，不提供神庙净化。
    83: 16,
    ...HIGH_CONFIDENCE_APK_TERRAIN_TO_PROJECT
  };

  // ../src/ai_runtime/dual_v2/value_model.ts
  function valueForward(input, ent, pooled, weights) {
    const n = input.entityIndexMap.globalActorIdx, vectors = tensor(6 * 459);
    let armySum = 0;
    for (let s = 0; s < 6; s++) {
      const base = s * 459, mean = new Float64Array(128), max = tensor(128).fill(-Infinity);
      let count = 0;
      for (let i = 0; i < n; i++) if (input.entityTokens[i * 66] > 0.5 && input.entityTokens[i * 66 + 24 + s] > 0.5) {
        for (let c = 0; c < 128; c++) {
          const v = ent[i * 128 + c];
          mean[c] += v;
          max[c] = Math.max(max[c], v);
        }
        count++;
      }
      vectors.set(input.playerOrder.features.subarray(s * 11, (s + 1) * 11), base);
      for (let c = 0; c < 128; c++) {
        vectors[base + 11 + c] = count ? mean[c] / count : 0;
        vectors[base + 139 + c] = count ? max[c] : 0;
      }
      vectors.set(ent.subarray(n * 128), base + 267);
      vectors.set(pooled, base + 395);
      armySum += Math.max(0, input.playerOrder.features[s * 11 + 7]) * input.playerOrder.active[s];
    }
    const hidden = linear(vectors, 6, 459, weights["value1.weight"], 128, weights["value1.bias"]);
    const normalized = norm(hidden, 6, 128, weights["value_norm.weight"], weights["value_norm.bias"], 0, true);
    const valueLogits = linear(normalized, 6, 128, weights["value2.weight"], 1, weights["value2.bias"]);
    for (let s = 0; s < 6; s++) valueLogits[s] = input.playerOrder.active[s] ? valueLogits[s] + weights.army_scale[0] * Math.max(0, input.playerOrder.features[s * 11 + 7]) / Math.max(1e-12, armySum) : -1e9;
    return { valueLogits, valueProbs: softmax(valueLogits, input.playerOrder.active) };
  }

  // ../src/ai_runtime/dual_v2/model_weights.ts
  var MODEL_ID = "dual-stream-v2-phase2-v1";
  function expectedWeightShapes() {
    const shapes = {};
    const dense = (name, input, output, kernel = 0, bias = true) => {
      shapes[name + ".weight"] = kernel ? [output, input, kernel, kernel] : [output, input];
      if (bias) shapes[name + ".bias"] = [output];
    };
    const normalization = (name, channels) => {
      shapes[name + ".weight"] = [channels];
      shapes[name + ".bias"] = [channels];
    };
    const block = (name, c) => {
      const r = c === 96 ? 16 : 8;
      dense(name + ".reduce", c, r, 1);
      normalization(name + ".norm1", r);
      shapes[name + ".depth.weight"] = [r, 1, 3, 3];
      shapes[name + ".depth.bias"] = [r];
      normalization(name + ".norm2", r);
      dense(name + ".expand", r, c, 1);
      normalization(name + ".norm3", c);
    };
    dense("map.stem", 34, 48, 3);
    normalization("map.stem_norm", 48);
    for (const [stage, c] of [48, 64, 96].entries()) for (let i = 0; i < 2; i++) block(`map.stage${stage}.${i}`, c);
    dense("map.down1", 48, 64, 1);
    dense("map.down2", 64, 96, 1);
    dense("map.context", 66, 96);
    dense("map.up1", 96, 64, 1);
    block("map.decode1", 64);
    dense("map.up0", 64, 48, 1);
    block("map.decode0", 48);
    dense("map.out", 48, 64, 1);
    dense("entity_proj", 130, 128);
    normalization("entity_norm", 128);
    dense("global_proj", 130, 128);
    normalization("global_norm", 128);
    dense("rel1", 16, 16);
    dense("rel2", 16, 4);
    for (let i = 0; i < 2; i++) {
      const b = `blocks.${i}`;
      normalization(b + ".ln1", 128);
      dense(b + ".qkv", 128, 384);
      dense(b + ".proj", 128, 128);
      normalization(b + ".ln2", 128);
      dense(b + ".ff1", 128, 256);
      dense(b + ".ff2", 256, 128);
    }
    dense("who", 128, 1);
    dense("tile_q", 128, 64);
    dense("tile_k", 64, 64, 1);
    dense("what_entity", 128, 36);
    dense("what_tile", 64, 36, 0, false);
    dense("target_q", 128, 256);
    dense("target_k", 128, 256);
    shapes.target_rel = [4, 16];
    shapes.headBias = [15];
    dense("value1", 459, 128);
    normalization("value_norm", 128);
    dense("value2", 128, 1);
    shapes.army_scale = [1];
    return shapes;
  }
  function loadModelWeights(manifest, binary) {
    if (manifest.model !== MODEL_ID || manifest.schema !== SCHEMA_ID || manifest.dtype !== "float32-le") throw Error("\u6A21\u578B\u6216\u8F93\u5165\u5951\u7EA6\u7248\u672C\u4E0D\u5339\u914D");
    const expected = expectedWeightShapes(), weights = {};
    let offset = 0;
    if (binary && binary.byteLength !== manifest.parameters * 4) throw Error("\u4E8C\u8FDB\u5236\u6743\u91CD\u957F\u5EA6\u9519\u8BEF");
    const view = binary ? new DataView(binary) : void 0;
    for (const tensor2 of manifest.tensors) {
      const shape = expected[tensor2.name];
      if (!shape || weights[tensor2.name] || JSON.stringify(shape) !== JSON.stringify(tensor2.shape) || tensor2.offset !== offset || tensor2.length !== shape.reduce((a, b) => a * b, 1)) throw Error(`\u6743\u91CD\u5F62\u72B6\u6216\u504F\u79FB\u9519\u8BEF\uFF1A${tensor2.name}`);
      if (!view && tensor2.values?.length !== tensor2.length) throw Error("JSON\u5185\u5D4C\u6743\u91CD\u7F3A\u5931");
      const data = new Float32Array(tensor2.length);
      for (let i = 0; i < data.length; i++) {
        data[i] = view ? view.getFloat32((offset + i) * 4, true) : tensor2.values[i];
        if (!Number.isFinite(data[i])) throw Error("\u6A21\u578B\u5305\u542B\u975E\u6709\u9650\u6743\u91CD");
      }
      weights[tensor2.name] = data;
      offset += tensor2.length;
    }
    if (offset !== manifest.parameters || Object.keys(weights).length !== Object.keys(expected).length) throw Error("\u6A21\u578B\u6743\u91CD\u4E0D\u5B8C\u6574");
    return weights;
  }

  // ../src/ai_runtime/dual_v2/model_runtime.ts
  var DualStreamModel = class {
    constructor(manifest, binary) {
      this.workspace = new TensorWorkspace();
      this.weights = loadModelWeights(manifest, binary);
    }
    forward(input) {
      const n = input.entityIndexMap.globalActorIdx, area = input.width * input.height;
      if (input.schema !== SCHEMA_ID || !Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width < 6 || input.height < 6 || input.width > 64 || input.height > 64) throw Error("\u6A21\u578B\u4EC5\u652F\u63016\u81F364\u7684\u77E9\u5F62\u5730\u56FE\u4E0E\u51BB\u7ED3\u8F93\u5165\u5951\u7EA6");
      if (input.spatialTensor.length !== area * 34 || input.entityTokens.length !== n * 66 || input.relationalBias.length !== n * n * 16 || input.playerOrder.features.length !== 66 || input.playerOrder.active.length !== 6 || input.actions.actorMask.length !== n + 1 || !input.actions.pointers.length || input.actions.pointers.length % 5) throw Error("\u6A21\u578B\u8F93\u5165\u5F20\u91CF\u5F62\u72B6\u9519\u8BEF");
      for (const data of [input.spatialTensor, input.entityTokens, input.relationalBias, input.playerOrder.features]) for (let i = 0; i < data.length; i++) if (!Number.isFinite(data[i])) throw Error("\u6A21\u578B\u8F93\u5165\u5305\u542B\u975E\u6709\u9650\u6570\u503C");
      for (let i = 0; i < n; i++) {
        const x = input.entityTokens[i * 66 + 33], y = input.entityTokens[i * 66 + 34];
        if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= input.width || y >= input.height) throw Error("\u5B9E\u4F53\u7A7A\u95F4\u91C7\u6837\u5750\u6807\u8D8A\u754C");
      }
      const p = input.actions.pointers;
      for (let a = 0; a < p.length; a += 5) if (p[a] < 0 || p[a] > n || !input.actions.actorMask[p[a]] || p[a + 1] < -1 || p[a + 1] >= area || p[a + 2] < 0 || p[a + 2] >= 15 || p[a + 3] < -1 || p[a + 3] >= 21 || p[a + 4] < -1 || p[a + 4] >= n || p[a + 4] >= 0 && ![1, 7, 8, 9].includes(p[a + 2])) throw Error("\u5408\u6CD5\u52A8\u4F5C\u6307\u9488\u8D8A\u754C");
      return withTensorWorkspace(this.workspace, () => {
        const spatial = spatialForward(input, this.weights), entity = entityForward(input, spatial.map, spatial.pooled, this.weights);
        const out = { ...policyForward(input, entity.entities, spatial.map, entity.relations, this.weights), ...valueForward(input, entity.entities, spatial.pooled, this.weights) };
        return { logits: out.logits.slice(), actorPrior: out.actorPrior.slice(), conditionalPrior: out.conditionalPrior.slice(), valueLogits: out.valueLogits.slice(), valueProbs: out.valueProbs.slice() };
      });
    }
  };

  // dual_stream_v2_phase2_20261020/browser.ts
  var argmax = (x) => {
    let best = 0;
    for (let i = 1; i < x.length; i++) if (x[i] > x[best]) best = i;
    return best;
  };
  async function main() {
    const prefix = new URL(location.href).searchParams.get("prefix") ?? "initial";
    const [manifest, weights, meta, bytes, reference, node] = await Promise.all([
      fetch(`/${prefix}.json`).then((r) => r.json()),
      fetch(`/${prefix}.bin`).then((r) => r.arrayBuffer()),
      fetch("/samples.json").then((r) => r.json()),
      fetch("/samples.bin").then((r) => r.arrayBuffer()),
      fetch(`/${prefix}-torch-reference.json`).then((r) => r.json()),
      fetch(`/${prefix}-node-output.json`).then((r) => r.json())
    ]);
    const model = new DualStreamModel(manifest, weights), arrays = Array.from({ length: meta.batches }, () => ({}));
    for (const e of meta.arrays) {
      const raw = bytes.slice(e.offset, e.offset + e.bytes);
      arrays[e.batch][e.name] = e.dtype === "<f4" ? new Float32Array(raw) : e.dtype === "<i4" ? new Int32Array(raw) : new Uint8Array(raw);
    }
    let maxLogit = 0, maxValue = 0, maxNode = 0;
    const receipts = arrays.map((a, i) => {
      const source = meta.sources[i], n = a.entities.length / 66;
      const observation = {
        schema: "dual-stream-v2-phase1-v1",
        width: source.width,
        height: source.height,
        spatialTensor: a.spatial,
        entityTokens: a.entities,
        relationalBias: a.relations,
        playerOrder: { features: a.players, active: a.active, playerIds: [], slotByPlayer: /* @__PURE__ */ new Map() },
        entityIndexMap: { globalActorIdx: n, entities: [], units: /* @__PURE__ */ new Map(), castles: /* @__PURE__ */ new Map(), graves: /* @__PURE__ */ new Map() },
        actions: { pointers: a.pointers, actorMask: a.actorMask, sourceIndices: new Int32Array(a.pointers.length / 5), tilesByActor: /* @__PURE__ */ new Map(), rowsByActorTile: /* @__PURE__ */ new Map() }
      };
      const out = model.forward(observation);
      let logitError = 0, valueError = 0, nodeError = 0;
      for (let j = 0; j < out.logits.length; j++) logitError = Math.max(logitError, Math.abs(out.logits[j] - reference[i].logits[j]));
      for (let j = 0; j < 6; j++) valueError = Math.max(valueError, Math.abs(out.valueProbs[j] - reference[i].valueProbs[j]));
      for (const key of ["logits", "actorPrior", "valueProbs"]) for (let j = 0; j < out[key].length; j++) nodeError = Math.max(nodeError, Math.abs(out[key][j] - node[i][key][j]));
      maxLogit = Math.max(maxLogit, logitError);
      maxValue = Math.max(maxValue, valueError);
      maxNode = Math.max(maxNode, nodeError);
      return { ...source, logitError, valueError, nodeError, actionMatch: argmax(out.logits) === argmax(reference[i].logits) && argmax(out.logits) === argmax(node[i].logits), actorMatch: argmax(out.actorPrior) === argmax(reference[i].actorPrior) && argmax(out.actorPrior) === argmax(node[i].actorPrior) };
    });
    return { passed: maxLogit < 1e-5 && maxValue < 1e-5 && maxNode < 1e-5 && receipts.every((r) => r.actionMatch && r.actorMatch), prefix, userAgent: navigator.userAgent, maxLogit, maxValue, maxNode, receipts };
  }
  main().catch((error) => ({ passed: false, error: String(error), stack: error.stack })).then((result) => fetch("/complete", { method: "POST", body: JSON.stringify(result) }));
})();
