const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {endpoint,savedConnection}=require('../desktop/connections.cjs');
const {normalize,mutate}=require('../desktop/model.cjs');
const {Vault}=require('../desktop/vault.cjs');
const {collectPassword}=require('../desktop/password-collector.cjs');
const {sshFixture}=require('./ssh-fixture.cjs');
test('endpoint defaults, IPv6, validation and credential references',()=>{
 assert.deepEqual(endpoint({address:' example.org ',username:'demo'}),{address:'example.org',username:'demo',port:22});
 assert.equal(endpoint({address:'[2001:db8::1]',username:'demo',port:'2222'}).address,'2001:db8::1');
 for(const patch of [{address:'user@host'},{address:'-option'},{address:'x;sh'},{address:'host:22'},{port:0},{port:65536},{port:'1e2'},{username:'a b'}])assert.throws(()=>endpoint({address:'host',username:'demo',...patch}));
 const p=savedConnection({address:'host',username:'demo',credentialID:crypto.randomUUID(),fingerprint:'a'.repeat(64),remember:true,password:'must-be-dropped'});
 assert.equal(p.password,undefined);
 const c=normalize({servers:['demo'],passwordConnections:{demo:p}});
 assert.deepEqual(mutate(c,{type:'remove',alias:'demo'}).passwordConnections,{});
 assert.deepEqual(normalize({servers:['legacy']}).passwordConnections,{});
});
test('vault encrypted persistence, session-only, secure Linux backend and corrupt file protection',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'monitor-vault-')),file=path.join(dir,'credentials.json');
 // Encryption adapter for deterministic file/rollback tests; not production cryptography.
 const key=crypto.randomBytes(32);
 const storage={isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'gnome_libsecret',encryptString:s=>{const iv=crypto.randomBytes(16),c=crypto.createCipheriv('aes-256-cbc',key,iv);return Buffer.concat([iv,c.update(s),c.final()]);},decryptString:b=>{const d=crypto.createDecipheriv('aes-256-cbc',key,b.subarray(0,16));return Buffer.concat([d.update(b.subarray(16)),d.final()]).toString();}};
 try {
  const v=new Vault(file,storage,'linux');v.put('saved','fixture-secret',true);v.put('session','session-secret',false);
  assert.equal(v.get('session'),'session-secret');assert.ok(!fs.readFileSync(file,'utf8').includes('fixture-secret'));assert.ok(!fs.readFileSync(file,'utf8').includes('session'));
  assert.equal(new Vault(file,storage,'linux').get('saved'),'fixture-secret');assert.throws(()=>new Vault(file,storage).get('session'));
  const insecure=new Vault(file,{...storage,getSelectedStorageBackend:()=> 'basic_text'},'linux');assert.equal(insecure.canRemember(),false);assert.throws(()=>insecure.put('bad','secret',true));
  v.remove('saved');v.clearSession();assert.throws(()=>v.get('saved'));assert.throws(()=>v.get('session'));
  fs.writeFileSync(file,'corrupt');const broken=new Vault(file,storage);assert.throws(()=>broken.put('id','secret',true));assert.equal(fs.readFileSync(file,'utf8'),'corrupt');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('real SSH password transport: custom port, repeated samples, wrong password, pinned host key',async()=>{
 const fixture=await sshFixture();
 try {
  const first=await collectPassword(fixture.profile,fixture.password,'fixture-script').promise;
  assert.equal(first.data.hostname,'local-ssh-fixture');assert.match(first.fingerprint,/^[a-f0-9]{64}$/);
  const pinned={...fixture.profile,fingerprint:first.fingerprint};
  assert.equal((await collectPassword(pinned,fixture.password,'fixture-script').promise).data.cpu_percent,12);
  await assert.rejects(collectPassword(pinned,'incorrect','fixture').promise,{code:'AUTH'});
  const count=fixture.attempts.length;
  await assert.rejects(collectPassword({...pinned,fingerprint:'0'.repeat(64)},fixture.password,'fixture').promise,{code:'HOST_KEY'});
  assert.equal(fixture.attempts.length,count,'host-key mismatch must stop before password authentication');
  assert.ok(fixture.attempts.every(m=>m==='password'));
 }finally{await fixture.close();}
});
test('real SSH invalid data, timeout and cancellation',async()=>{
 const invalid=await sshFixture({badJSON:true});
 try{await assert.rejects(collectPassword(invalid.profile,invalid.password,'fixture').promise,{code:'COLLECT'});}finally{await invalid.close();}
 const slow=await sshFixture({hang:true});
 try{
  await assert.rejects(collectPassword(slow.profile,slow.password,'fixture',{timeout:500}).promise,{code:'TIMEOUT'});
  const job=collectPassword(slow.profile,slow.password,'fixture');job.cancel();await assert.rejects(job.promise,{code:'CANCELLED'});
 }finally{await slow.close();}
});
