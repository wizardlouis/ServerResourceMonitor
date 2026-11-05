const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {normalize,mutate}=require('../desktop/model.cjs');
const {Store}=require('../desktop/store.cjs');
const {coreLabel,compactIndices,groupGPUs,summarizeJobs}=require('../desktop/ui-utils.js');
test('1.0.1 config upgrades safely; display settings persist independently',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'monitor-display-'));
 try {
  const file=path.join(dir,'config.json');
  fs.writeFileSync(file,JSON.stringify({version:1,servers:['A','B'],coreGrouping:{A:8},overviewCollapsed:true}));
  const store=new Store(file);
  assert.equal(store.config.coreGrouping.A,8);assert.equal(store.config.overviewCollapsed,true);
  assert.equal(store.config.coreIDRadix,10);assert.equal(store.config.serverPanelTheme,'detailed');assert.equal(store.config.groupOrientation,'vertical');
  for(const [key,value] of [['coreIDRadix',16],['serverPanelTheme','compact'],['groupOrientation','horizontal']])store.update({type:'display',key,value});
  store.update({type:'gpuSize',alias:'A',size:8});
  const reloaded=new Store(file);assert.deepEqual(reloaded.config,store.config);assert.equal(reloaded.config.gpuGrouping.B,1);
  for(const a of [{type:'display',key:'servers',value:[]},{type:'display',key:'__proto__',value:{}},{type:'display',key:'coreIDRadix',value:2},{type:'gpuSize',alias:'A',size:16},{type:'gpuSize',alias:'missing',size:2}])assert.throws(()=>store.update(a));
  assert.equal(mutate(store.config,{type:'remove',alias:'A'}).gpuGrouping.A,undefined);
  const bad=normalize({servers:['A'],coreIDRadix:2,serverPanelTheme:'x',groupOrientation:'x',gpuGrouping:{A:16}});
  assert.equal(bad.coreIDRadix,10);assert.equal(bad.gpuGrouping.A,1);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('hex boundaries and compact GPU ranges',()=>{
 for(const [n,v] of [[9,'9'],[10,'A'],[15,'F'],[16,'10'],[255,'FF'],[256,'100']])assert.equal(coreLabel([n],16),v);
 assert.equal(coreLabel([16,31],16),'10–1F');assert.equal(coreLabel([16],3),'16');
 assert.equal(compactIndices([1,0,1]),'0、1');assert.equal(compactIndices([0,1,2,4,5,7,8,9]),'0-2、4、5、7-9');
});
const gpu=(n,extra={})=>({index:String(n),uuid:'g'+n,name:'A100',util:20,used:25,total:100,temp:40+n,power:100,...extra});
test('GPU grouping: numeric order, tail, mean utilization, weighted memory, missing metrics',()=>{
 for(const size of [1,2,4,8]){
  const groups=groupGPUs(Array.from({length:9},(_,n)=>gpu(n)).reverse(),size);
  assert.equal(groups.length,Math.ceil(9/size));assert.equal(groups.at(-1).members.length,1);
  assert.deepEqual(groups.flatMap(g=>g.members).map(g=>g.index),Array.from({length:9},(_,n)=>String(n)));
 }
 const g=groupGPUs([gpu(1,{total:300,used:150,util:80}),gpu(0)],2)[0];
 assert.equal(g.total,400);assert.equal(g.used,175);assert.equal(g.util,50);assert.equal(g.temp,41);assert.equal(g.power,200);
 for(const key of ['util','used','total','temp','power'])assert.equal(groupGPUs([gpu(0,{[key]:null}),gpu(1)],2)[0][key],null);
 assert.equal(groupGPUs([gpu(0),gpu(1,{name:'H100'})],2)[0].name,'混合型号');
 assert.deepEqual(groupGPUs([],8),[]);
});
test('user summary counts same PID on different cards and refuses incomplete totals',()=>{
 const jobs=[{user:'alice',uuid:'g0',pid:'1',memory:100},{user:'alice',uuid:'g1',pid:'1',memory:200},{user:'alice',uuid:'g1',pid:'2',memory:300},{user:'bob',uuid:'g2',memory:null},{uuid:'missing',memory:50}];
 const summaries=summarizeJobs(jobs,[gpu(0),gpu(1),gpu(2)]);
 assert.deepEqual(summaries.find(x=>x.user==='alice'),{user:'alice',gpuLabel:'0、1',memory:600});
 assert.equal(summaries.find(x=>x.user==='bob').memory,null);
 assert.equal(summaries.find(x=>x.user==='未知').gpuLabel,'未知');assert.deepEqual(summarizeJobs([],[]),[]);
});
