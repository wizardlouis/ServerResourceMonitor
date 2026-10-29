const {test}=require('node:test');const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');const {PassThrough}=require('node:stream');
const {collect}=require('../desktop/collector.cjs');
function fake(run) {return (...args)=>{const p=new EventEmitter();p.stdout=new PassThrough();p.stderr=new PassThrough();p.stdin=new PassThrough();p.kill=()=>p.emit('close',1);setImmediate(()=>run(p,args));return p;};}
test('SSH fixed arguments, script stdin and JSON output',async()=>{
 const r=collect('demo','print(1)',{spawnImpl:fake((p,[_exe,args,opts])=>{
  assert.equal(opts.shell,false);assert.ok(args.includes('BatchMode=yes'));assert.ok(args.includes('StrictHostKeyChecking=yes'));assert.deepEqual(args.slice(-2),['demo','python3 -']);
  assert.equal(p.stdin.read().toString(),'print(1)');p.stdout.write('{"cpu_percent":1,"gpus":[],"processes":[]}');p.emit('close',0);
 })});assert.equal((await r.promise).cpu_percent,1);
});
test('authentication, invalid JSON, missing SSH and timeout are errors',async()=>{
 await assert.rejects(collect('demo','',{spawnImpl:fake(p=>{p.stderr.write('Permission denied');p.emit('close',255);})}).promise,/Permission denied/);
 await assert.rejects(collect('demo','',{spawnImpl:fake(p=>{p.stdout.write('bad');p.emit('close',0);})}).promise,/格式无效/);
 await assert.rejects(collect('demo','',{spawnImpl:fake(p=>{p.emit('error',Object.assign(Error(),{code:'ENOENT'}));})}).promise,/OpenSSH/);
 await assert.rejects(collect('demo','',{spawnImpl:fake(()=>{}),timeout:10}).promise,/超时/);
});
