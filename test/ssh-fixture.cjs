const {Server}=require('ssh2');
const {generateKeyPairSync,randomUUID}=require('node:crypto');
async function sshFixture({badJSON=false,hang=false}={}) {
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs1',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
 const password=randomUUID(),clients=new Set(),attempts=[];
 const data={hostname:'local-ssh-fixture',cpu_percent:12,cpu_count:2,cpu_cores:[],load:[0,0,0],memory_percent:25,memory_total:1024,memory_used:256,gpus:[],processes:[]};
 const server=new Server({hostKeys:[privateKey]},client=>{
  clients.add(client);client.on('error',()=>{});client.on('close',()=>clients.delete(client));
  client.on('authentication',ctx=>{attempts.push(ctx.method);if(ctx.method==='password' && ctx.username==='demo' && ctx.password===password)ctx.accept();else ctx.reject(['password']);});
  client.on('ready',()=>client.on('session',accept=>{
   const session=accept();session.on('exec',(accept,reject,info)=>{
    if(info.command!=='python3 -')return reject();
    const stream=accept();stream.on('error',()=>{});stream.on('data',()=>{});
    stream.on('end',()=>{if(hang)return;stream.write(badJSON?'bad-json':JSON.stringify(data));stream.exit(0);stream.end();});
   });
  }));
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return {profile:{address:'127.0.0.1',port:server.address().port,username:'demo'},password,attempts,
  close:()=>new Promise(resolve=>{for(const client of clients)client.end();server.close(resolve);})};
}
module.exports={sshFixture};
