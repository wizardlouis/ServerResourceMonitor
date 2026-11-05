const {Client} = require('ssh2');
const {endpoint,validatePassword}=require('./connections.cjs');
function collectPassword(profile,password,script,{timeout=18000,ClientImpl=Client}={}) {
  const p=endpoint(profile);validatePassword(password);
  const client=new ClientImpl();let finish,observed,changed=false;
  const promise=new Promise((resolve,reject)=>{
    let settled=false,stdout='',timer;
    finish=(error,data)=>{
      if(settled)return;settled=true;clearTimeout(timer);client.destroy();
      error?reject(error):resolve({data,fingerprint:observed});
    };
    const failure=(message,code)=>Object.assign(Error(message),{code});
    timer=setTimeout(()=>finish(failure('SSH 连接或采集超时，请检查地址、端口和网络','TIMEOUT')),timeout);
    client.on('error',error=>finish(changed?failure('服务器主机密钥已变化，连接已停止。请核对服务器身份后再添加新连接。','HOST_KEY'):
      error.level==='client-authentication'?failure('用户名或密码错误，或服务器未启用普通密码登录','AUTH'):failure('SSH 连接失败，请检查网络、端口及服务器 SSH 服务','NETWORK')));
    client.on('close',()=>finish(failure('SSH 连接已关闭','NETWORK')));
    client.on('ready',()=>{
      // The exec command is constant. Password and endpoint never enter shell command text.
      client.exec('python3 -',(error,stream)=>{
        if(error)return finish(failure('无法启动采集，需要远端安装 Python 3','COLLECT'));
        stream.on('data',chunk=>{stdout+=chunk.toString();if(Buffer.byteLength(stdout)>4*1024*1024)finish(failure('采集数据过大','COLLECT'));});
        stream.stderr.on('data',()=>{});
        stream.on('error',()=>finish(failure('采集通道中断','COLLECT')));
        stream.on('close',(code)=>{
          if(code!==0)return finish(failure('远端采集失败，需要 Linux 和 Python 3','COLLECT'));
          try {
            const data=JSON.parse(stdout);
            if(!Array.isArray(data.gpus)||!Array.isArray(data.processes)||!Number.isFinite(data.cpu_percent))throw Error();
            finish(null,data);
          }catch{finish(failure('服务器返回的数据格式无效','COLLECT'));}
        });
        stream.end(script);
      });
    });
    try { client.connect({host:p.address,port:p.port,username:p.username,password,
      authHandler:['password'],tryKeyboard:false,hostHash:'sha256',
      hostVerifier:hash=>{observed=hash;changed=!!profile.fingerprint && hash!==profile.fingerprint;return !changed;},
      readyTimeout:Math.min(timeout,8000),keepaliveInterval:5000,keepaliveCountMax:1});
    }catch{finish(failure('无法建立 SSH 连接','NETWORK'));}
  });
  return {promise,cancel:()=>finish(Object.assign(Error('连接已取消'),{code:'CANCELLED'}))};
}
module.exports={collectPassword};
