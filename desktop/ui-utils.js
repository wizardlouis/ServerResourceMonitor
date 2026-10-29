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
  const api = {shortName, groupCores};
  if (typeof module !== 'undefined') module.exports = api;
  else root.utils = api;
})(globalThis);
