const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = (v,n=0) => Number.isFinite(v) ? v.toFixed(n) : '—';
const clamp = v => Math.min(100,Math.max(0,v || 0));
const gib = v => num(Number.isFinite(v) ? v/1073741824 : null,1);
const bar = (v,blue=false) => `<div class="bar ${blue?'blue':''}"><i style="width:${clamp(v)}%"></i></div>`;
let state, selectedColumn = null, selectedMember = null, draft = null, layoutSignature = '', busy = false, notice = '';
const expanded = new Set();
let connectionID=null, connecting=false;
function serverLabel(id) {
 const p=state?.config.passwordConnections?.[id];
 return p?`${p.username}@${p.address.includes(':')?'['+p.address+']':p.address}:${p.port}`:id;
}
function openConnection(id=null) {
 connectionID=id; const p=state.config.passwordConnections[id];
 $('connection-title').textContent=p?'修改连接':'账号密码连接';
 $('connection-address').value=p?.address||'';$('connection-port').value=String(p?.port||22);
 $('connection-user').value=p?.username||'';$('connection-password').value='';
 $('connection-remember').checked=state.canRememberPassword && (p?p.remember:false);
 $('connection-remember').disabled=!state.canRememberPassword;
 $('connection-storage').textContent=state.canRememberPassword?'默认仅用于本次运行；勾选后使用系统安全存储，系统可能请求授权。':'系统安全存储不可用：密码仅在本次运行中保留，退出后需重新输入。';
 $('connection-error').textContent='';$('connection-save').textContent=p?'连接并保存':'连接并添加';
 $('connection').showModal();
}
async function action(command) {
  const result = await window.monitor.action(command);
  if (!result.ok) { notice = result.error; $('message').textContent = notice; }
  else { notice = ''; }
  return result.ok;
}
function chart(history=[]) {
  if(history.length<2) return '<div class="chart empty">正在积累趋势数据…</div>';
  const paths = ['cpu','gpu'].map((key,j)=> {
    let d='', connected=false;
    history.forEach((p,i)=> { if(!Number.isFinite(p[key])) { connected=false; return; }
      d += `${connected?'L':'M'}${i*500/(history.length-1)},${60-clamp(p[key])*.54} `; connected=true;
    });
    return `<path d="${d}" fill="none" stroke="${j?'#6cafff':'#5ee3b2'}" stroke-width="2"/>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 500 64" preserveAspectRatio="none" role="img" aria-label="CPU 和 GPU 趋势">${paths}</svg>`;
}
function cores(server) {
  if(!server.cpu_cores?.length) return '';
  const k=state.config.coreGrouping[server.alias]||1, groups=utils.groupCores(server.cpu_cores,k);
  return `<div class="section-label"><span>CPU 核心占用 · ${server.cpu_cores.length} 个逻辑核心${state.config.coreIDRadix===16?' · HEX':''}</span><select data-core="${esc(server.alias)}" aria-label="${esc(server.alias)} 核心显示粒度">${[1,2,4,8,16].map(n=>`<option value="${n}" ${n===k?'selected':''}>${n===1?'单个逻辑核心':n+' 核心合并'}</option>`).join('')}</select></div><div class="cores"><div class="core-grid">${groups.map(g=>`<div class="core" role="img" aria-label="逻辑核心（十进制） ${esc(g.ids.join(', '))} · ${num(g.percent,1)}%" title="逻辑核心（十进制） ${esc(g.ids.join(', '))} · ${num(g.percent,1)}%"><i class="lamp" style="--lamp:${g.percent==null?'#697484':`hsl(${120-clamp(g.percent)*1.2} 75% 48%)`}"></i><span class="core-id">${esc(utils.coreLabel(g.ids,state.config.coreIDRadix))}</span><small>${num(g.percent)}%</small></div>`).join('')}</div><div class="core-notes">${groups.length} 盏灯 · 每灯最多 ${k} 个逻辑核心 · 0% 绿 → 50% 黄 → 100% 红 · 缺失采样灰色</div></div>`;
}
function gpu(g) {
  const percent=Number.isFinite(g.total)&&g.total>0&&Number.isFinite(g.used)?g.used/g.total*100:null;
  return `<div class="gpu"><div class="gpu-title" title="${esc(g.members.map(m=>'#'+m.index+' '+m.name).join('\n'))}${g.members.length>1?'\n利用率为平均值，显存为总量占比；温度为最高值，功耗为合计。':''}"><strong class="gpu-name">#${esc(g.index)} ${esc(utils.shortName(g.name))}${g.members.length>1?' · '+g.members.length+' 卡':''}</strong><strong class="gpu-total">${num(Number.isFinite(g.total)?g.total/1024:null,1)} GiB</strong></div><div class="gpu-grid"><div><span class="tiny">GPU 利用率</span><div class="value">${num(g.util)}%</div>${bar(g.util)}</div><div><span class="tiny">显存占用</span><div class="value">${num(percent,1)}%</div>${bar(percent,true)}</div></div><span class="tiny gpu-thermal">${g.members.length>1?'最高 ':''}${num(g.temp)}°C · ${g.members.length>1?'合计 ':''}${num(g.power)} W</span></div>`;
}
function userJobs(s) {
  const rows=utils.summarizeJobs(s.processes||[],s.gpus||[]);
  return `<div class="table-scroll"><table class="user-jobs"><thead><tr><th>用户</th><th>GPU</th><th>显存合计 MiB</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.user)}</td><td>${esc(r.gpuLabel)}</td><td>${r.memory===null?'未知（数据不全）':num(r.memory)}</td></tr>`).join('')||'<tr><td colspan="3">暂无可见计算进程</td></tr>'}</tbody></table></div>`;
}
function serverHTML(s) {
  return `<div class="top"><div><h2>${esc(serverLabel(s.alias))}</h2><span class="tiny">${esc(s.hostname||'等待采集')}</span></div><div><span class="status">${s.status==='online'?'● 在线':s.status==='offline'?'● 连接中断':'◌ 连接中'}</span>${state.config.passwordConnections[s.alias]?`<button data-connection="${esc(s.alias)}">连接设置</button>`:''}<button class="remove" data-remove="${esc(s.alias)}" aria-label="移除 ${esc(s.alias)}">×</button></div></div>${s.error?`<div class="error">数据已过期 / 暂不可用\n${esc(s.error)}</div>`:''}${s.cpu_percent==null?'<div class="empty">等待 SSH 采集。首次连接请查看“连接帮助”。</div>':`<div class="metrics"><div><span class="muted">CPU 使用率</span><div class="value">${num(s.cpu_percent,1)}%</div>${bar(s.cpu_percent)}<span class="tiny">${esc(s.cpu_count)} 逻辑核心 · 负载 ${num(s.load?.[0],2)}</span></div><div><span class="muted">内存使用率</span><div class="value">${num(s.memory_percent,1)}%</div>${bar(s.memory_percent,true)}<span class="tiny">${gib(s.memory_used)} / ${gib(s.memory_total)} GiB</span></div></div>${cores(s)}<div class="section-label"><span>GPU · ${(s.gpus||[]).length} 张显卡</span><select data-gpu="${esc(s.alias)}" aria-label="${esc(s.alias)} GPU 显示粒度">${[1,2,4,8].map(n=>`<option value="${n}" ${n===(state.config.gpuGrouping[s.alias]||1)?'selected':''}>${n===1?'单卡':n+' 卡合并'}</option>`).join('')}</select></div>${s.gpu_error?`<div class="error">${esc(s.gpu_error)}</div>`:''}<div class="gpus">${utils.groupGPUs(s.gpus||[],state.config.gpuGrouping[s.alias]).map(gpu).join('')}</div><div class="section-label">近期趋势 · CPU 绿 / GPU 均值 蓝</div>${chart(s.history)}<details data-details="${esc(s.alias)}" ${expanded.has(s.alias)?'open':''}><summary>GPU 计算进程 · ${(s.processes||[]).length}</summary>${state.config.serverPanelTheme==='compact'?userJobs(s):`<div class="table-scroll"><table><thead><tr><th>GPU</th><th>PID</th><th>用户</th><th>进程</th><th>显存 MiB</th></tr></thead><tbody>${(s.processes||[]).map(p=>`<tr><td>${esc(s.gpus.find(g=>g.uuid===p.uuid)?.index??'—')}</td><td>${esc(p.pid)}</td><td>${esc(p.user||'未知')}</td><td class="name" title="${esc(p.name)}">${esc(String(p.name).split(/[\\/]/).at(-1))}</td><td>${num(p.memory)}</td></tr>`).join('')||'<tr><td colspan="5">暂无可见计算进程</td></tr>'}</tbody></table></div>`}</details><div class="foot">最后成功采集 ${s.updated?new Date(s.updated).toLocaleTimeString():'—'}</div>`}`;
}
function selection() {
  document.querySelectorAll('[data-column]').forEach(e=>{const yes=e.dataset.column===selectedColumn;e.classList.toggle('selected',yes);e.setAttribute('aria-pressed',String(yes));});
  document.querySelectorAll('[data-member]').forEach(e=>{const yes=e.dataset.member===selectedMember;e.classList.toggle('selected',yes);e.setAttribute('aria-pressed',String(yes));});
}
function render(snapshot) {
  state=snapshot;
  if(!state.canRememberPassword && $('connection').open) {
    $('connection-remember').checked=false;$('connection-remember').disabled=true;
    $('connection-storage').textContent='系统安全存储不可用：密码仅在本次运行中保留，退出后需重新输入。';
  }
  const horizontal=state.config.groupOrientation==='horizontal';
  document.body.classList.toggle('horizontal-groups',horizontal);
  document.body.classList.toggle('compact',state.config.serverPanelTheme==='compact');
  $('layout-hint').textContent=horizontal?'上下滚动切换组 · 左右滚动查看组内服务器':'左右滚动切换列 · 上下滚动查看详情';
  $('order-hint').textContent=horizontal?'标牌从左到右对应各组从上到下 · ← 上移 / → 下移':'点击列标牌，再按 ← / → 调整顺序';
  $('servers').setAttribute('aria-label',horizontal?'服务器横组浏览区域':'服务器竖组浏览区域');
  document.querySelectorAll('[data-setting]').forEach(el=>{if(el!==document.activeElement)el.value=String(state.config[el.dataset.setting]);});
  document.body.classList.toggle('collapsed',state.config.overviewCollapsed);
  $('pause').textContent=state.paused?'继续采集':'暂停采集'; $('refresh').disabled=state.paused;
  const online=state.servers.filter(s=>s.status==='online'), gpus=online.flatMap(s=>s.gpus||[]);
  $('online').textContent=`${online.length}/${state.servers.length} 台在线${state.paused?' · 已暂停':''}`;
  $('count').textContent=`服务器 · ${state.servers.length} 台 · ${state.config.columns.length} 组`;
  $('version').textContent=`v${state.version}`;
  $('message').textContent=notice||state.error||(state.imported?'已导入旧版服务器与分组；新版配置独立保存。':'');
  $('summary').innerHTML=[['在线服务器',`${online.length} / ${state.servers.length}`],['在线 GPU',`${gpus.length} 张`],['可用显存合计',`${num(gpus.reduce((a,g)=>a+(Number.isFinite(g.total)&&Number.isFinite(g.used)?Math.max(0,g.total-g.used):0),0)/1024,1)} GiB`],['逻辑 CPU 核心',online.reduce((a,s)=>a+(s.cpu_count||0),0)]].map(([k,v])=>`<div>${k}<strong>${v}</strong></div>`).join('');
  const signature=JSON.stringify(state.config.columns);
  if(signature!==layoutSignature) {
    layoutSignature=signature;
    $('badges').innerHTML=state.config.columns.map(c=>`<div class="badge-item"><button data-column="${esc(c.id)}">${esc(c.name)} · ${c.members.length} 台</button><div class="badge-actions"><button data-edit="${esc(c.id)}" aria-label="编辑分组 ${esc(c.name)}">编辑分组</button>${c.members.length>1?`<button data-dissolve="${esc(c.id)}">解散</button>`:''}</div></div>`).join('');
    $('servers').innerHTML=state.config.columns.map(c=>`<section class="column"><h2>${esc(c.name)} · ${c.members.length} 台</h2><div class="column-members">${c.members.map(a=>`<article class="server" data-alias="${esc(a)}"></article>`).join('')}</div></section>`).join('')||'<div class="empty">添加 SSH 别名，开始监控服务器。点击右上角 ··· 可展开添加栏。</div>';
    if(!state.config.columns.some(c=>c.id===selectedColumn)) selectedColumn=null;
    selection();
  }
  document.querySelectorAll('.server').forEach(el=> {
    const s=state.servers.find(s=>s.alias===el.dataset.alias);
    if(!s || (el.contains(document.activeElement) && document.activeElement.tagName === "SELECT")) return;
    el.classList.toggle('offline',s.status==='offline');
    const html=serverHTML(s); if(el.innerHTML!==html) el.innerHTML=html;
  });
}
function renderMembers() {
  $('members').innerHTML=draft.members.map(m=>`<button type="button" data-member="${esc(m)}">${esc(serverLabel(m))}</button>`).join('');
  $('save').disabled=!draft.members.length;selection();
}
function edit(id) {
  const c=state.config.columns.find(c=>c.id===id);
  draft={id:c?.id,name:c?.name||'新分组',members:[...(c?.members||[])]};selectedMember=null;
  $('editor-title').textContent=c?'编辑服务器分组':'创建服务器分组';
  $('group-name').value=draft.name;
  $('choices').innerHTML=state.config.servers.map(a=>`<label><input type="checkbox" data-choice="${esc(a)}" ${draft.members.includes(a)?'checked':''}>${esc(serverLabel(a))}</label>`).join('');
  $('editor-error').textContent='';renderMembers();$('editor').showModal();
}
$('password-toggle').onclick=()=>openConnection();
$('connection-cancel').onclick=()=>$('connection').close();
$('connection').addEventListener('cancel',event=>{if(connecting)event.preventDefault();});
$('connection').addEventListener('close',()=>{if(!$('connection').open){$('connection-password').value='';connectionID=null;}});
$('connection-form').onsubmit=async event=>{
 event.preventDefault();if(connecting)return;connecting=true;
 const command={type:'connect',id:connectionID,address:$('connection-address').value,port:$('connection-port').value,username:$('connection-user').value,password:$('connection-password').value,remember:$('connection-remember').checked};
 $('connection-error').textContent='正在验证登录和采集…';
 document.querySelectorAll('#connection input').forEach(e=>e.disabled=true);
 $('connection-save').disabled=true;$('connection-cancel').disabled=true;
 let result;
 try{result=await window.monitor.action(command);}catch{result={ok:false,error:'连接请求失败，请重试'};}
 finally{command.password='';connecting=false;document.querySelectorAll('#connection input').forEach(e=>e.disabled=false);$('connection-remember').disabled=!state.canRememberPassword;$('connection-save').disabled=false;$('connection-cancel').disabled=false;}
 if(result.ok){$('connection-password').value='';$('connection').close();}
 else $('connection-error').textContent=result.error;
};
$('add').onsubmit=async e=>{e.preventDefault();if(await action({type:'add',alias:$('alias').value})) $('alias').value='';};
$('pause').onclick=()=>action({type:'pause'});$('refresh').onclick=()=>action({type:'refresh'});
$('overview').onclick=()=>action({type:'overview',collapsed:!state.config.overviewCollapsed});
$('layout-toggle').onclick=()=>{$('layout').hidden=!$('layout').hidden;selectedColumn=null;selection();};
$('settings-toggle').onclick=()=>$('settings').showModal();$('settings-close').onclick=()=>$('settings').close();
$('help-toggle').onclick=()=>$('help').showModal();$('help-close').onclick=()=>$('help').close();
$('create').onclick=()=>edit(null);$('cancel').onclick=()=>$('editor').close();
$('editor').onclose=()=>{if(!$('editor').open){draft=null;selectedMember=null;}};
$('edit-form').onsubmit=async e=>{
  e.preventDefault(); if(busy)return;busy=true;
  const result=await window.monitor.action({type:'edit',id:draft.id,name:$('group-name').value,members:draft.members});
  busy=false;if(result.ok)$('editor').close();else $('editor-error').textContent=result.error;
};
$('choices').onchange=e=>{
  const a=e.target.dataset.choice;if(!a)return;
  if(e.target.checked)draft.members.push(a);else draft.members=draft.members.filter(m=>m!==a);
  renderMembers();
};
document.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;
  if(!e.target.closest('[data-column]'))selectedColumn=null;
  if(!e.target.closest('[data-member]'))selectedMember=null;
  selection();
});
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.column){selectedColumn=b.dataset.column;b.focus();selection();}
  if(b.dataset.member){selectedMember=b.dataset.member;b.focus();selection();}
  if(b.dataset.edit)edit(b.dataset.edit);
  if(b.dataset.dissolve)action({type:'dissolve',id:b.dataset.dissolve});
  if(b.dataset.connection)openConnection(b.dataset.connection);
  if(b.dataset.remove)action({type:'remove',alias:b.dataset.remove});
});
document.addEventListener('change',e=>{if(e.target.dataset.setting){const key=e.target.dataset.setting;const value=key==='coreIDRadix'?Number(e.target.value):e.target.value;e.target.blur();action({type:'display',key,value});}if(e.target.dataset.gpu){e.target.blur();action({type:'gpuSize',alias:e.target.dataset.gpu,size:Number(e.target.value)});}if(e.target.dataset.core){e.target.blur();action({type:'coreSize',alias:e.target.dataset.core,size:Number(e.target.value)});}});
document.addEventListener('toggle',e=>{if(e.target.dataset.details){if(e.target.open)expanded.add(e.target.dataset.details);else expanded.delete(e.target.dataset.details);}},true);
document.addEventListener('keydown',async e=>{
  if(e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return;
  if(e.target.matches?.('input, textarea, select, [contenteditable=true]'))return;
  if(draft && selectedMember && ['ArrowUp','ArrowDown'].includes(e.key)) {
    e.preventDefault();const i=draft.members.indexOf(selectedMember),j=i+(e.key==='ArrowUp'?-1:1);
    if(i>=0 && j>=0 && j<draft.members.length){[draft.members[i],draft.members[j]]=[draft.members[j],draft.members[i]];renderMembers();document.querySelector('[data-member].selected')?.focus();}
  } else if(!draft && !$('help').open && !$('settings').open && !$('connection').open && selectedColumn && !$('layout').hidden && ['ArrowLeft','ArrowRight'].includes(e.key)) {
    e.preventDefault();if(busy)return;busy=true;
    await action({type:'move',id:selectedColumn,step:e.key==='ArrowLeft'?-1:1});busy=false;
    document.querySelector('[data-column].selected')?.focus();
    document.querySelector('[data-column].selected')?.scrollIntoView({block:'nearest',inline:'nearest'});
  }
});
window.monitor.subscribe(render);
window.monitor.state().then(render).catch(e=>{$('message').textContent=e.message;});
