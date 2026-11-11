"""float32权重与激活，允许用float64累加；对齐浏览器逐算子舍入边界。"""
import torch
from torch import nn
from torch.nn import functional as F


class Linear(nn.Linear):
    accurate = False
    def forward(self, x):
        if not self.accurate:
            return super().forward(x)
        return F.linear(x.double(), self.weight.double(), self.bias.double() if self.bias is not None else None).float()


class Conv2d(nn.Conv2d):
    accurate = False
    def forward(self, x):
        if not self.accurate:
            return super().forward(x)
        return self._conv_forward(x.double(), self.weight.double(), self.bias.double() if self.bias is not None else None).float()


class GroupNorm(nn.GroupNorm):
    accurate = False
    def forward(self, x):
        if not self.accurate:
            return super().forward(x)
        batch, channels, height, width = x.shape
        z = x.double().reshape(batch, self.num_groups, channels // self.num_groups, height, width).permute(0, 1, 3, 4, 2)
        mean = z.mean((2, 3, 4), keepdim=True)
        variance = (z.square().mean((2, 3, 4), keepdim=True) - mean.square()).clamp_min(0)
        z = (z - mean) / (variance + self.eps).sqrt()
        z = z * self.weight.double().reshape(1, self.num_groups, 1, 1, -1) + self.bias.double().reshape(1, self.num_groups, 1, 1, -1)
        return z.permute(0, 1, 4, 2, 3).reshape(x.shape).float()


class LayerNorm(nn.LayerNorm):
    accurate = False
    def forward(self, x):
        if not self.accurate:
            return super().forward(x)
        z = x.double()
        mean = z.mean(-1, keepdim=True)
        variance = (z.square().mean(-1, keepdim=True) - mean.square()).clamp_min(0)
        return ((z - mean) / (variance + self.eps).sqrt() * self.weight.double() + self.bias.double()).float()


def softmax(x, dim, accurate):
    if not accurate:
        return x.softmax(dim)
    exp = (x.double() - x.max(dim, keepdim=True).values.double()).exp().float()
    return (exp.double() / exp.double().sum(dim, keepdim=True)).float()


def dot(a, b, accurate):
    return (a.double() * b.double()).sum(-1).float() if accurate else (a * b).sum(-1)


def mean(x, dim, accurate):
    return x.double().mean(dim).float() if accurate else x.mean(dim)


def matmul(a, b, accurate):
    return (a.double() @ b.double()).float() if accurate else a @ b
