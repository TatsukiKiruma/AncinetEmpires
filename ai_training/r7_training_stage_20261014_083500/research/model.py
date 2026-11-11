import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import os

class ResBlock(nn.Module):
    def __init__(self, channels=32):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, kernel_size=3, padding=1)
        self.conv2 = nn.Conv2d(channels, channels, kernel_size=3, padding=1)

    def forward(self, x):
        res = x
        out = F.relu(self.conv1(x))
        out = self.conv2(out)
        out = F.relu(out + res)
        return out

class SpatialResNetPolicyValueNet(nn.Module):
    """
    与 TypeScript SpatialResNetPredictor 完全自洽的 PyTorch 模型
    架构: spatial_resnet_32ch_2res
    空间输入: 34 通道, 20x20
    全局输入: 20 维
    动作语义: 53 维
    局部空间提取: actorCoord, landingCoord, targetCoord 各 32 维
    PolicyDense1: 32*3 + 53 + 20 = 169 维
    ValueDense1: 32 (GAP) + 20 (Global) = 52 维
    """
    def __init__(self, in_channels=34, trunk_channels=32, global_dim=20, action_semantic_dim=53):
        super().__init__()
        self.in_channels = in_channels
        self.trunk_channels = trunk_channels
        self.global_dim = global_dim
        self.action_semantic_dim = action_semantic_dim

        self.stem = nn.Conv2d(in_channels, trunk_channels, kernel_size=3, padding=1)
        self.res1 = ResBlock(trunk_channels)
        self.res2 = ResBlock(trunk_channels)

        # 价值头
        self.val_dense1 = nn.Linear(trunk_channels + global_dim, 32)
        self.val_dense2 = nn.Linear(32, 1)

        # 动作打分头
        policy_in_dim = trunk_channels * 3 + action_semantic_dim + global_dim
        self.pol_dense1 = nn.Linear(policy_in_dim, 48)
        self.pol_dense2 = nn.Linear(48, 1)

    def forward_trunk(self, spatial_tensor):
        """
        spatial_tensor: [B, C, H, W]
        returns: Z [B, trunk_channels, H, W]
        """
        x = F.relu(self.stem(spatial_tensor))
        x = self.res1(x)
        x = self.res2(x)
        return x

    def forward_value(self, Z, global_features):
        """
        Z: [B, trunk_channels, H, W]
        global_features: [B, global_dim]
        returns: value [B, 1] in [-1, 1]
        """
        gap = torch.mean(Z, dim=(2, 3)) # [B, trunk_channels]
        val_in = torch.cat([gap, global_features], dim=-1)
        h = F.relu(self.val_dense1(val_in))
        val = torch.tanh(self.val_dense2(h))
        return val

    def forward_policy_single(self, Z_single, global_single, actor_coords, landing_coords, target_coords, semantics):
        """
        单样本候选动作前向打分 (精确对齐 TypeScript 逐候选动作前向逻辑)
        Z_single: [32, H, W]
        global_single: [20]
        actor_coords: [K, 2] (x, y)
        landing_coords: [K, 2] (x, y)
        target_coords: [K, 2] (x, y)
        semantics: [K, 53]
        returns: logits [K]
        """
        K = semantics.shape[0]
        if K == 0:
            return torch.empty(0, dtype=torch.float32, device=Z_single.device)

        H, W = Z_single.shape[1], Z_single.shape[2]
        C = self.trunk_channels

        def sample_coord(coords):
            feats = torch.zeros((K, C), dtype=torch.float32, device=Z_single.device)
            for i in range(K):
                x, y = int(coords[i, 0]), int(coords[i, 1])
                if 0 <= x < W and 0 <= y < H:
                    feats[i] = Z_single[:, y, x]
            return feats

        act_feats = sample_coord(actor_coords)
        land_feats = sample_coord(landing_coords)
        tar_feats = sample_coord(target_coords)

        glob_repeated = global_single.unsqueeze(0).expand(K, -1)

        pol_in = torch.cat([act_feats, land_feats, tar_feats, semantics, glob_repeated], dim=-1)
        h = F.relu(self.pol_dense1(pol_in))
        logits = self.pol_dense2(h).squeeze(-1)
        return logits

def load_from_ppo_pt(model, pt_path):
    """
    从历史 θ1 ppo_w1.train_state.pt 加载权重
    """
    ckpt = torch.load(pt_path, map_location='cpu')
    m_dict = ckpt['model'] if 'model' in ckpt else ckpt

    with torch.no_grad():
        model.stem.weight.copy_(m_dict['stem.weight'])
        model.stem.bias.copy_(m_dict['stem.bias'])

        # res1
        model.res1.conv1.weight.copy_(m_dict['res_blocks.0.conv1.weight'])
        model.res1.conv1.bias.copy_(m_dict['res_blocks.0.conv1.bias'])
        model.res1.conv2.weight.copy_(m_dict['res_blocks.0.conv2.weight'])
        model.res1.conv2.bias.copy_(m_dict['res_blocks.0.conv2.bias'])

        # res2
        model.res2.conv1.weight.copy_(m_dict['res_blocks.1.conv1.weight'])
        model.res2.conv1.bias.copy_(m_dict['res_blocks.1.conv1.bias'])
        model.res2.conv2.weight.copy_(m_dict['res_blocks.1.conv2.weight'])
        model.res2.conv2.bias.copy_(m_dict['res_blocks.1.conv2.bias'])

        # val_dense
        model.val_dense1.weight.copy_(m_dict['valDense1.weight'] if 'valDense1.weight' in m_dict else m_dict['val_dense1.weight'])
        model.val_dense1.bias.copy_(m_dict['valDense1.bias'] if 'valDense1.bias' in m_dict else m_dict['val_dense1.bias'])
        model.val_dense2.weight.copy_(m_dict['valDense2.weight'] if 'valDense2.weight' in m_dict else m_dict['val_dense2.weight'])
        model.val_dense2.bias.copy_(m_dict['valDense2.bias'] if 'valDense2.bias' in m_dict else m_dict['val_dense2.bias'])

        # pol_dense
        model.pol_dense1.weight.copy_(m_dict['polDense1.weight'] if 'polDense1.weight' in m_dict else m_dict['pol_dense1.weight'])
        model.pol_dense1.bias.copy_(m_dict['polDense1.bias'] if 'polDense1.bias' in m_dict else m_dict['pol_dense1.bias'])
        model.pol_dense2.weight.copy_(m_dict['polDense2.weight'] if 'polDense2.weight' in m_dict else m_dict['pol_dense2.weight'])
        model.pol_dense2.bias.copy_(m_dict['polDense2.bias'] if 'polDense2.bias' in m_dict else m_dict['pol_dense2.bias'])

    print(f"Loaded weights successfully from {pt_path}")

def export_model_to_ts_json(model, out_path, architecture_id='spatial_resnet_32ch_2res', encoder_schema_id='spatial34_global20_actionSemantics53_v19'):
    """
    导出为 TypeScript 权威引擎 SpatialResNetPredictor 可直接读取的 JSON 格式
    """
    def export_conv(conv_layer):
        return {
            "inChannels": conv_layer.in_channels,
            "outChannels": conv_layer.out_channels,
            "kernelSize": 3,
            "padding": 1,
            "weights": conv_layer.weight.detach().cpu().numpy().flatten().tolist(),
            "biases": conv_layer.bias.detach().cpu().numpy().flatten().tolist()
        }

    def export_dense(dense_layer):
        return {
            "inDim": dense_layer.in_features,
            "outDim": dense_layer.out_features,
            "weights": dense_layer.weight.detach().cpu().numpy().flatten().tolist(),
            "biases": dense_layer.bias.detach().cpu().numpy().flatten().tolist()
        }

    d = {
        "version": "spatial-resnet-v2",
        "architectureId": architecture_id,
        "encoderSchemaId": encoder_schema_id,
        "stem": export_conv(model.stem),
        "res1_1": export_conv(model.res1.conv1),
        "res1_2": export_conv(model.res1.conv2),
        "res2_1": export_conv(model.res2.conv1),
        "res2_2": export_conv(model.res2.conv2),
        "valDense1": export_dense(model.val_dense1),
        "valDense2": export_dense(model.val_dense2),
        "polDense1": export_dense(model.pol_dense1),
        "polDense2": export_dense(model.pol_dense2)
    }

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(d, f)
    print(f"Exported model to TS JSON format at {out_path} ({os.path.getsize(out_path) / 1024:.1f} KB)")
