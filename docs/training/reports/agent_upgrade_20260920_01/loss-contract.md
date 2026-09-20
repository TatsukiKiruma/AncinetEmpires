# 双头网络损失与梯度归一化契约 (N04 / F06)

**执行轮次:** `agent_upgrade_20260920_01`  
**模块:** `tools/skirmish_dual_head_net.ts`  
**生效日期:** 2026-09-20  

---

## 1. 损失公式与归一化定义

在 `skirmish_dual_head_net.ts` 中，策略头与价值头的训练损失采用样本与有效掩码分离的分别归一化机制：

$$L_{\text{policy}} = \frac{1}{N} \sum_{i=1}^N \text{CE}_i = -\frac{1}{N} \sum_{i=1}^N \log(\max(10^{-12}, P_i[y_i]))$$

$$L_{\text{value}} = \begin{cases} \displaystyle \frac{1}{M} \sum_{i: m_i=1} (v_i - z_i)^2 & \text{若 } M > 0 \\ 0 & \text{若 } M = 0 \end{cases}$$

$$L_{\text{total}} = L_{\text{policy}} + \lambda_{\text{value}} \cdot L_{\text{value}}$$

其中：
- $N$ 为当前批次的总样本数（`totalSamples`）。
- $m_i \in \{0, 1\}$ 为可靠价值目标掩码（仅当 `valueTarget !== null` 时 $m_i = 1$）。
- $M = \sum_{i=1}^N m_i$ 为当前批次具有可靠价值监督的样本数（`valueCount`）。
- $\lambda_{\text{value}}$ 为配置的价值权重参数（`TrainOptions.valueWeight`）。

---

## 2. 梯度反向传播与动量更新契约 (解决 F06)

在历史实现中，报告的 `valueLoss` 按 $M$ 归一化，而反向传播的梯度在 `applyMomentum` 中统一乘以 $\frac{1}{N}$。这导致当批次中带有效价值标签的样本比例 $\frac{M}{N}$ 变化时，实际施加在网络上的价值梯度被隐性缩放。

**N04 统一契约：**
1. **梯度贡献：**
   - 策略头梯度：每个样本产生 $\frac{\partial \text{CE}_i}{\partial \theta_{\text{policy}}}$，并在全批累计后除以 $N$。
   - 价值头梯度：仅当 $m_i = 1$ 时计算 $\frac{\partial (v_i - z_i)^2}{\partial \theta_{\text{value}}}$。
   - 共享干路（Trunk）梯度：干路顶层特征 $e$ 同时接收策略梯度与价值梯度的线性叠加 $\nabla_e L = \nabla_e L_{\text{policy}} + \lambda_{\text{value}} \nabla_e L_{\text{value}}$。
2. **全掩码批次 ($M = 0$) 行为：**
   - 当批次内无有效价值目标（$M = 0$）时，价值头参数不产生任何梯度。
   - 价值头权重更新增量严格为 0（在动量为 0 时权重逐位不变）。
   - 报告的 `valueLoss = 0`，`valueCount = 0`。
   - 共享 trunk 仅由策略损失驱动更新，不引入任何伪造的 0 值伪胜率梯度。

---

## 3. 有限差分梯度验证

通过 `checkGradients(net, sample, eps, tol)` 对网络中各层参数进行中心差分校验：

$$g_{\text{numerical}} = \frac{L(\theta + \epsilon) - L(\theta - \epsilon)}{2\epsilon}, \quad \epsilon = 10^{-5}$$

相对误差定义：

$$\text{relError} = \frac{|g_{\text{analytical}} - g_{\text{numerical}}|}{\max(|g_{\text{analytical}}|, |g_{\text{numerical}}|, 10^{-4})} \le 10^{-3}$$

涵盖路径：
- Trunk 共享层（NET_A 2 层 / NET_B 3 层）。
- Policy 策略头各层。
- Value 价值头各层。

---

## 4. 纯推理热路径不分配梯度 (Inference Zero-Allocation)

- `predictDecision` 采用 `forwardDenseInference`，仅进行纯数值前向仿射计算与激活，绝不构造含有 `dW` 与 `db` 缓冲区的 `DenseWithGrad` 对象。
- 单次调用对输入状态进行一次共享 Trunk 前向，获取特征 $e$ 后分发至各候选，避免为每个候选动作重复编码状态。
