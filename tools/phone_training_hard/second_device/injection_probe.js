// 只读核对同UID注入能力，不访问AI、不开始对局。
'use strict';
rpc.exports = {
 init(stage, parameters) {
  send({kind:'second_device_injection_probe',pid:Process.id,stage:String(stage),architecture:Process.arch});
  return {attached:true,pid:Process.id};
 }
};
