const keysCache=new WeakMap<object,string[]>();

/** 只为完全相同的普通JSON结构提供快捷路径；键顺序也必须一致。 */
export function exactGeometryEquals(a:any,b:any):boolean{
    if(a===b)return true;
    if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
    if(Array.isArray(a)||Array.isArray(b)){
        if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return false;
        for(let i=0;i<a.length;i++)if(a[i]!==b[i]&&!exactGeometryEquals(a[i],b[i]))return false;
        return true;
    }
    if(Object.getPrototypeOf(a)!==Object.prototype||Object.getPrototypeOf(b)!==Object.prototype)return false;
    const keys=Object.keys(a);let other=keysCache.get(b);
    if(!other){other=Object.keys(b);keysCache.set(b,other);}
    if(keys.length!==other.length)return false;
    for(let i=0;i<keys.length;i++){const k=keys[i];if(k!==other[i]||a[k]!==b[k]&&!exactGeometryEquals(a[k],b[k]))return false;}
    return true;
}
