/** Chrome87缺少的标准接口；游戏状态仅使用普通对象、数组及标准数值容器。 */
export function installCompatibility(){
    if(!Object.hasOwn)Object.hasOwn=(object:object,key:PropertyKey)=>Object.prototype.hasOwnProperty.call(object,key);
    if(!Array.prototype.at)Object.defineProperty(Array.prototype,'at',{configurable:true,writable:true,value:function(index:number){
        const offset=Math.trunc(Number(index)||0),position=offset<0?this.length+offset:offset;
        return position<0||position>=this.length?undefined:this[position];
    }});
    if(!globalThis.structuredClone){
        globalThis.structuredClone=function<T>(source:T):T{
            const seen=new Map<object,any>();
            const copy=(value:any):any=>{
                if(value===null||typeof value!=='object')return value;
                if(seen.has(value))return seen.get(value);
                let result:any;
                if(value instanceof Date)return new Date(value.getTime());
                if(value instanceof ArrayBuffer)return value.slice(0);
                if(ArrayBuffer.isView(value))return new (value.constructor as any)(value);
                if(value instanceof Map){result=new Map();seen.set(value,result);value.forEach((v,k)=>result.set(copy(k),copy(v)));return result;}
                if(value instanceof Set){result=new Set();seen.set(value,result);value.forEach(v=>result.add(copy(v)));return result;}
                result=Array.isArray(value)?new Array(value.length):{};seen.set(value,result);
                for(const key of Object.keys(value))Object.defineProperty(result,key,{value:copy(value[key]),writable:true,enumerable:true,configurable:true});
                return result;
            };
            return copy(source);
        };
    }
}
