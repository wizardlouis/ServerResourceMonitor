const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const cp=require('node:child_process');
test('SSH editing isolates shared aliases, preserves includes, detects conflicts and restores',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'monitor-ssh-'));
 const originalHome=os.homedir, originalExec=cp.execFileSync;
 try {
  fs.mkdirSync(path.join(dir,'.ssh'));
  const file=path.join(dir,'.ssh','config');
  const original='ServerAliveInterval 7\nHost demo other\n HostName old.example\n User demo\n Port 22\n';
  fs.writeFileSync(file,original,{mode:0o600});
  os.homedir=()=>dir;
  cp.execFileSync=(command,args,options)=>originalExec(command,['-F',file,...args],options);
  const config=require('../desktop/ssh-config.cjs');
  const before=config.read('demo');
  const saved=config.save({...before,address:'192.0.2.10',username:'updated',port:2222});
  assert.equal(config.read('demo').address,'192.0.2.10');
  assert.equal(config.read('demo').port,2222);
  assert.equal(config.read('other').address,'old.example');
  assert.equal(config.read('other').username,'demo');
  assert.throws(()=>config.save({...before,address:'192.0.2.11'}),/其他程序/);
  config.restore(saved);
  assert.equal(fs.readFileSync(file,'utf8'),original);
  assert.throws(()=>config.save({...before,address:'bad\nHost evil'}));
 } finally {os.homedir=originalHome;cp.execFileSync=originalExec;fs.rmSync(dir,{recursive:true,force:true});}
});
