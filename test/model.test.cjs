const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const {normalize,mutate,validAlias}=require('../desktop/model.cjs');
const {Store}=require('../desktop/store.cjs');
const {shortName,groupCores}=require('../desktop/ui-utils.js');
test('legacy migration, unique members and new/removed servers',()=>{
 const c=normalize({servers:['A','B','C','A'],columns:[{id:'x',name:'AB',members:['A','B']},{id:'x',name:'bad',members:['B','missing']}]});
 assert.deepEqual(c.columns.map(x=>x.members),[['A','B'],['C']]);
 assert.equal(normalize({servers:['C'],columns:c.columns}).columns.length,1);
 assert.equal(normalize({servers:['A','B']}).columns.length,2);
});
test('merge, rename, transfer, detach, dissolve, sorting and boundaries',()=>{
 let c=normalize({servers:['A','B','C','D']}); const id=c.columns[0].id;
 c=mutate(c,{type:'edit',id,name:'Pair',members:['B','A']});
 assert.deepEqual(c.columns.map(x=>x.members),[['B','A'],['C'],['D']]);
 c=mutate(c,{type:'move',id,step:-1});assert.equal(c.columns[0].id,id);
 c=mutate(c,{type:'move',id,step:1});assert.equal(c.columns[1].id,id);
 c=mutate(c,{type:'edit',id,name:'Renamed',members:['A','D']});
 assert.deepEqual(c.columns.map(x=>x.members),[['C'],['A','D'],['B']]);
 c=mutate(c,{type:'dissolve',id});assert.deepEqual(c.columns.map(x=>x.members),[['C'],['A'],['D'],['B']]);
 c=mutate(c,{type:'remove',alias:'D'});assert.equal(c.columns.length,3);
 c=mutate(c,{type:'add',alias:'E'});assert.deepEqual(c.columns.at(-1).members,['E']);
 assert.throws(()=>mutate(c,{type:'edit',name:'',members:['A']}));
 assert.throws(()=>mutate(c,{type:'edit',name:'bad',members:['unknown']}));
});
test('untrusted aliases never become shell options or commands',()=>{
 for(const a of ['-oProxyCommand=bad','x; rm','x\ny','a@host','$(whoami)','a b','']) assert.equal(validAlias(a),false);
 assert.equal(validAlias('a100node1'),true);
});
test('migration keeps original and persists independent preferences',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'monitor-test-'));
 try {
  const legacy=path.join(dir,'legacy.json'), dest=path.join(dir,'new','config.json');
  const original='{"servers":["A","B"]}';fs.writeFileSync(legacy,original);
  const store=new Store(dest,legacy);assert.equal(store.imported,true);
  store.update({type:'coreSize',alias:'A',size:8});store.update({type:'overview',collapsed:true});
  assert.equal(fs.readFileSync(legacy,'utf8'),original);
  const reload=new Store(dest);assert.equal(reload.config.coreGrouping.A,8);assert.equal(reload.config.overviewCollapsed,true);
  const before=store.config;store.filename=path.join(legacy,'invalid');assert.throws(()=>store.update({type:'remove',alias:'A'}));assert.deepEqual(store.config,before);
  fs.writeFileSync(dest,'corrupt');const broken=new Store(dest);assert.ok(broken.error);assert.throws(()=>broken.update({type:'add',alias:'C'}));assert.equal(fs.readFileSync(dest,'utf8'),'corrupt');
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('GPU name distinctions and CPU group averages/missing samples',()=>{
 for(const [a,b] of [['NVIDIA GeForce RTX 4090 D','RTX 4090 D'],['NVIDIA RTX 6000 Ada Generation','RTX 6000 Ada'],['NVIDIA A100 80GB PCIe','A100'],['Tesla V100-SXM2-32GB','V100'],['NVIDIA Future X','Future X']])assert.equal(shortName(a),b);
 const cores=[{id:3,percent:100},{id:1,percent:0},{id:4,percent:50}];
 assert.deepEqual(groupCores(cores,2),[{ids:[1,3],percent:50},{ids:[4],percent:50}]);
 assert.equal(groupCores([{id:0,percent:null}],1)[0].percent,null);
 for(const size of [1,2,4,8,16]) assert.equal(groupCores(Array.from({length:32},(_,id)=>({id,percent:50})),size).length,32/size);
});
