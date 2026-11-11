"""保持每张原地图边界的批量卷积、掩码组归一化和奇数边池化。"""
import torch
from torch.nn import functional as F


def mask_for(x,sizes):
    h,w=x.shape[-2:]
    return ((torch.arange(h,device=x.device)[None,:,None]<sizes[:,0,None,None]) &
            (torch.arange(w,device=x.device)[None,None,:]<sizes[:,1,None,None]))[:,None].to(x.dtype)


def norm(x,module,mask):
    b,c,h,w=x.shape
    z=x.reshape(b,module.num_groups,c//module.num_groups,h,w)
    valid=mask[:,None]
    denominator=(mask.sum((2,3))*(c//module.num_groups))[:,None,:,None,None]
    mean=(z*valid).sum((2,3,4),keepdim=True)/denominator
    variance=((z-mean).square()*valid).sum((2,3,4),keepdim=True)/denominator
    out=((z-mean)*torch.rsqrt(variance+module.eps)).reshape(b,c,h,w)
    return (out*module.weight[None,:,None,None]+module.bias[None,:,None,None])*mask


def residual(x,block,mask):
    z=F.relu(norm(block.reduce(x),block.norm1,mask))
    z=F.relu(norm(block.depth(z),block.norm2,mask))
    return F.relu(x+.5*norm(block.expand(z),block.norm3,mask))*mask


def stage(x,blocks,mask):
    for block in blocks:
        x=residual(x,block,mask)
    return x


def pool(x,mask):
    # 原图奇数边界只有1或2个有效格，不能把填充格计入平均分母。
    total=F.avg_pool2d(x,2)*4
    count=F.avg_pool2d(mask,2)*4
    return total/count.clamp_min(1)


def map_forward(m,spatial,players,sizes):
    m0=mask_for(spatial,sizes)
    z0=stage(F.relu(norm(m.stem(spatial),m.stem_norm,m0)),m.stage0,m0)
    size1=(sizes+1)//2
    pooled=pool(z0,m0);m1=mask_for(pooled,size1)
    z1=stage(m.down1(pooled)*m1,m.stage1,m1)
    size2=(size1+1)//2
    pooled=pool(z1,m1);m2=mask_for(pooled,size2)
    z2=stage(m.down2(pooled)*m2,m.stage2,m2)
    z2=(z2+m.context(players.flatten(1))[:,:,None,None])*m2
    up=z2.repeat_interleave(2,2).repeat_interleave(2,3)
    z=residual((m.up1(up)*m1+z1)*m1,m.decode1,m1)
    up=z.repeat_interleave(2,2).repeat_interleave(2,3)
    z=residual((m.up0(up)*m0+z0)*m0,m.decode0,m0)
    fmap=m.out(z)*m0
    gmap=fmap.sum((2,3))/(sizes[:,0]*sizes[:,1])[:,None]
    return fmap,gmap
