"""神经MLP与可学习分阶段军力跳连；不调用任何启发式AI。"""
from train import *

class ResidualValue(nn.Module):
    def __init__(self,w):super().__init__();self.flat=nn.Parameter(torch.tensor(w,dtype=DT))
    def features(self,x):
        w=self.flat;d=x.shape[1];b=d*64;n=b+64;o=n+128
        z=x@w[:b].reshape(d,64)+w[b:n];hidden=torch.relu(F.layer_norm(z,(64,),w[n:n+64],w[n+64:o],1e-5));phase=x[:,-8:-5];skip=torch.cat([phase*x[:,-1:],phase],1)
        return hidden,skip,o
    def forward(self,x):
        hidden,skip,o=self.features(x);w=self.flat;return torch.tanh(hidden@w[o:o+64]+w[o+64]+skip@w[o+65:o+71])
