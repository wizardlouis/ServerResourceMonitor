(function(root) {
  function shortName(raw) {
    let name = String(raw || '').trim();
    for (const prefix of ['NVIDIA ', 'GeForce ', 'Tesla ']) if (name.startsWith(prefix)) name = name.slice(prefix.length);
    name = name.replace(' Ada Generation',' Ada');
    const match = name.match(/^(A100|H100|H200|V100)(?:[- ](?:SXM\d*|PCIE|PCIe|\d+GB|HBM\d*))*$/);
    return match ? match[1] : name || raw;
  }
  function groupCores(cores, size) {
    const k = [1,2,4,8,16].includes(size) ? size : 1;
    const sorted = [...cores].sort((a,b) => a.id-b.id), result = [];
    for (let i=0;i<sorted.length;i+=k) {
      const slice = sorted.slice(i,i+k);
      result.push({ids:slice.map(c=>c.id), percent:slice.every(c=>Number.isFinite(c.percent)) ? slice.reduce((a,c)=>a+c.percent,0)/slice.length : null});
    }
    return result;
  }
  function coreLabel(ids, radix=10) {
    const label = n => n.toString(radix === 16 ? 16 : 10).toUpperCase();
    return ids.length === 1 ? label(ids[0]) : label(ids[0])+'–'+label(ids.at(-1));
  }
  function compactIndices(indices) {
    const sorted=[...new Set(indices)].sort((a,b)=>a-b), parts=[];
    for(let i=0;i<sorted.length;) {
      let end=i;
      while(end+1<sorted.length && sorted[end+1]===sorted[end]+1)end++;
      if(end-i>=2)parts.push(sorted[i]+'-'+sorted[end]);
      else parts.push(...sorted.slice(i,end+1).map(String));
      i=end+1;
    }
    return parts.join('、');
  }
  function numericIndex(value) {
    return /^\d+$/.test(String(value)) ? Number(value) : null;
  }
  function groupGPUs(gpus, size) {
    const k=[1,2,4,8].includes(size)?size:1;
    const sorted=[...gpus].sort((a,b)=>{
      const x=numericIndex(a.index), y=numericIndex(b.index);
      return x!==null && y!==null && x!==y ? x-y : String(a.index).localeCompare(String(b.index));
    });
    const result=[];
    for(let i=0;i<sorted.length;i+=k) {
      const members=sorted.slice(i,i+k), names=[...new Set(members.map(g=>g.name))];
      const sum=key=>members.every(g=>Number.isFinite(g[key]))?members.reduce((v,g)=>v+g[key],0):null;
      const util=sum('util'), indices=members.map(g=>numericIndex(g.index));
      result.push({members, index:indices.every(n=>n!==null)?compactIndices(indices):members.map(g=>g.index).join('、'),
        name:names.length===1?names[0]:'混合型号', util:util===null?null:util/members.length,
        used:sum('used'),total:sum('total'),power:sum('power'),
        temp:members.every(g=>Number.isFinite(g.temp))?Math.max(...members.map(g=>g.temp)):null});
    }
    return result;
  }
  function summarizeJobs(jobs, gpus) {
    const indices=new Map(gpus.map(g=>[g.uuid,numericIndex(g.index)])), users=new Map();
    for(const job of jobs) {
      const user=job.user || '未知';
      if(!users.has(user))users.set(user,[]);
      users.get(user).push(job);
    }
    return [...users].map(([user,records])=>{
      const values=records.map(p=>indices.get(p.uuid)), known=values.filter(Number.isFinite);
      let gpuLabel=compactIndices(known);
      if(known.length!==values.length)gpuLabel+=(gpuLabel?'、':'')+'未知';
      return {user,gpuLabel,memory:records.every(p=>Number.isFinite(p.memory))?records.reduce((v,p)=>v+p.memory,0):null};
    }).sort((a,b)=>a.user.localeCompare(b.user));
  }
  const api = {shortName, groupCores, coreLabel, compactIndices, groupGPUs, summarizeJobs};
  if (typeof module !== 'undefined') module.exports = api;
  else root.utils = api;
})(globalThis);
