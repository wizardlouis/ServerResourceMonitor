const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
module.exports=async(window,store,vault)=>{
 const errors=[];window.webContents.on('console-message',event=>{if(event.level === 'error')errors.push(event.message);});
 const run=fn=>window.webContents.executeJavaScript(`(${fn.toString()})()`);
 async function waitFor(fn){for(let i=0;i<200;i++){if(await run(fn))return;await new Promise(r=>setTimeout(r,50));}throw Error('UI condition timed out: '+fn);}
 await waitFor(()=>document.querySelectorAll('.server').length===4);
 await run(()=>{document.querySelector('[data-more]').click();document.querySelector('[data-menu-action="pause"]').click();});
 await waitFor(()=>document.querySelector('.status').textContent.includes('已暂停'));
 await run(()=>{document.querySelector('[data-more]').click();document.querySelector('[data-menu-action="pause"]').click();});
 await waitFor(()=>!document.querySelector('.status').textContent.includes('已暂停'));

 assert.equal(await run(()=>typeof require),'undefined');
 if(vault.canRemember()) {
  const id=require('node:crypto').randomUUID(), secret=require('node:crypto').randomUUID();
  try {
   vault.put(id,secret,true);
   const {Vault}=require('../desktop/vault.cjs');
   assert.equal(new Vault(vault.filename,vault.crypto).get(id),secret);
   assert.ok(!fs.readFileSync(vault.filename,'utf8').includes(secret));
   console.log('OS_CREDENTIAL_STORAGE_PASS',process.platform);
  } finally {vault.remove(id);}
 } else console.log('OS_CREDENTIAL_STORAGE_UNAVAILABLE_SESSION_ONLY',process.platform);
 assert.equal(await run(()=>document.querySelectorAll('.column').length),3);
 assert.equal(await run(()=>document.querySelectorAll('.column')[0].querySelectorAll('.server').length),2);
 assert.equal(await run(()=>document.querySelector('.gpu-total').textContent),'24.0 GiB');
 await run(()=>document.getElementById('layout-toggle').click());
 await run(()=>document.querySelector('[data-column="pair"]').click());
 await run(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
 await waitFor(()=>document.querySelector('[data-column]').dataset.column==='a100');
 await run(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true})));
 await waitFor(()=>document.querySelector('[data-column]').dataset.column==='pair');
 await run(()=>{const input=document.getElementById('alias');input.focus();input.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));});
 assert.equal(store.config.columns[0].id,'pair');
 await run(()=>document.querySelector('[data-edit="pair"]').click());
 await waitFor(()=>document.getElementById('editor').open);
 await run(()=>{document.querySelector('[data-member="demo-small-2"]').click();document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));});
 assert.equal(await run(()=>document.querySelector('[data-member]').dataset.member),'demo-small-2');
 await run(()=>document.getElementById('cancel').click());
 assert.deepEqual(store.config.columns[0].members,['demo-small','demo-small-2']);
 await run(()=>document.querySelector('[data-edit="pair"]').click());
 await run(()=>document.getElementById('editor').dispatchEvent(new Event('close')));
 await run(()=>{document.getElementById('group-name').value='已保存分组';document.getElementById('save').click();});
 await waitFor(()=>!document.getElementById('editor').open && document.querySelector('.column h2').textContent.includes('已保存分组'));
 assert.equal(store.config.columns[0].name,'已保存分组');
 await run(()=>document.querySelector('[data-edit="pair"]').click());
 await run(()=>{document.getElementById('group-name').value='双卡服务器';document.getElementById('save').click();});
 await waitFor(()=>!document.getElementById('editor').open);

 await run(()=>{const e=document.querySelector('[data-core="demo-small"]');e.value='8';e.dispatchEvent(new Event('change',{bubbles:true}));});
 await waitFor(()=>document.querySelector('[data-alias="demo-small"] .core-grid').children.length===4);
 await run(()=>document.getElementById('settings-toggle').click());
 await waitFor(()=>document.getElementById('settings').open);
 await run(()=>{const e=document.querySelector('[data-setting="coreIDRadix"]');e.value='16';e.dispatchEvent(new Event('change',{bubbles:true}));});
 await waitFor(()=>document.querySelector('[data-alias="demo-small"] .core-grid').textContent.includes('10–17'));
 await run(()=>{const e=document.querySelector('[data-setting="serverPanelTheme"]');e.value='compact';e.dispatchEvent(new Event('change',{bubbles:true}));});
 await waitFor(()=>document.body.classList.contains('compact') && document.querySelector('.user-jobs'));
 assert.equal(await run(()=>getComputedStyle(document.querySelector('.core-id')).display),'none');
 assert.equal(await run(()=>document.querySelector('.user-jobs tbody td').textContent),'demo');
 await run(()=>{const e=document.querySelector('[data-setting="groupOrientation"]');e.value='horizontal';e.dispatchEvent(new Event('change',{bubbles:true}));});
 await waitFor(()=>document.body.classList.contains('horizontal-groups'));
 assert.equal(await run(()=>getComputedStyle(document.getElementById('badges')).flexDirection),'row');
 assert.equal(await run(()=>getComputedStyle(document.querySelector('.column-members')).flexDirection),'row');
 await run(()=>document.getElementById('settings-close').click());
 await run(()=>{const e=document.querySelector('[data-gpu="demo-a100"]');e.value='8';e.dispatchEvent(new Event('change',{bubbles:true}));});
 await waitFor(()=>document.querySelectorAll('[data-alias="demo-a100"] .gpu').length===1);
 assert.equal(await run(()=>document.querySelector('[data-alias="demo-a100"] .gpu-total').textContent),'640.0 GiB');
 assert.equal(store.config.gpuGrouping['demo-small'],1);
 await run(()=>document.querySelector('[data-column="pair"]').click());
 await run(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true})));
 assert.equal(store.config.columns[0].id,'pair');
 await run(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
 await waitFor(()=>document.querySelector('[data-column]').dataset.column==='a100');
 await run(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true})));
 await waitFor(()=>document.querySelector('[data-column]').dataset.column==='pair');
 const {Store}=require('../desktop/store.cjs');
 assert.deepEqual(new Store(store.filename).config,store.config);
 // Exercise the real password flow through the renderer IPC and a local SSH fixture.
 const fixture=await require('./ssh-fixture.cjs').sshFixture();
 try {
  await run(()=>document.getElementById('password-toggle').click());
  await waitFor(()=>document.getElementById('connection').open);
  await window.webContents.executeJavaScript(`(()=>{
    document.getElementById('connection-address').value='127.0.0.1';
    document.getElementById('connection-port').value=${fixture.profile.port};
    document.getElementById('connection-user').value='demo';
    document.getElementById('connection-password').value='incorrect';
    document.getElementById('connection-remember').checked=false;
    document.getElementById('connection-save').click();
  })()`);
  await waitFor(()=>document.getElementById('connection-error').textContent.includes('用户名或密码'));
  assert.equal(store.config.servers.length,4);
  await window.webContents.executeJavaScript(`(()=>{document.getElementById('connection-password').value=${JSON.stringify(fixture.password)};document.getElementById('connection-save').click();})()`);
  await waitFor(()=>!document.getElementById('connection').open && document.querySelectorAll('.server').length===5);
  const direct=store.config.servers.find(id=>id.startsWith('direct-'));
  assert.equal(vault.session.size,1);
  assert.ok(direct);assert.equal(store.config.passwordConnections[direct].port,fixture.profile.port);
  assert.ok(!fs.readFileSync(store.filename,'utf8').includes(fixture.password));
  const publicState=await run(()=>window.monitor.state());
  assert.equal(publicState.config.passwordConnections[direct].credentialID,undefined);
  assert.ok(!JSON.stringify(publicState).includes(fixture.password));
  await window.webContents.executeJavaScript(`document.querySelector('[data-more="${direct}"]').click(); document.querySelector('[data-menu-action="edit"]').click()`);
  await waitFor(()=>document.getElementById('connection').open);
  assert.equal(await run(()=>document.getElementById('connection-password').value),'');
  await run(()=>document.getElementById('connection-cancel').click());
  await window.webContents.executeJavaScript(`document.querySelector('[data-more="${direct}"]').click(); document.querySelector('[data-menu-action="remove"]').click()`);
  await waitFor(()=>document.querySelectorAll('.server').length===4);
  assert.equal(store.config.passwordConnections[direct],undefined);
  assert.equal(vault.session.size,0);
 } finally {await fixture.close();}
 await run(()=>document.getElementById('overview').click());
 await waitFor(()=>document.body.classList.contains('collapsed'));
 await run(()=>document.getElementById('pause').click());
 await waitFor(()=>document.getElementById('pause').textContent==='继续采集');
 await run(()=>document.getElementById('pause').click());
 await run(()=>document.getElementById('layout-toggle').click());
 await waitFor(()=>!document.getElementById('editor').open && document.getElementById('layout').hidden);
 await run(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await new Promise(resolve=>setTimeout(resolve,300));
 const dir=path.resolve('smoke-output');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,`dashboard-${process.platform}-${process.arch}.png`),(await window.webContents.capturePage()).toPNG());
 window.setBounds({width:540,height:960});
 await new Promise(resolve=>setTimeout(resolve,250));
 const portrait=await run(()=>{
  const viewport=document.getElementById('servers');
  const copy=viewport.querySelector('.column').cloneNode(true);
  viewport.append(copy); viewport.append(copy.cloneNode(true));
  const max=viewport.scrollWidth-viewport.clientWidth;
  viewport.scrollLeft=max;
  return {max,left:viewport.scrollLeft,bodyOverflow:document.body.scrollWidth>innerWidth,full:!!document.getElementById('fullscreen')};
 });
 assert.ok(portrait.max>0);assert.ok(portrait.left>0);assert.equal(portrait.bodyOverflow,false);assert.equal(portrait.full,true);
 console.log('PORTRAIT_SCROLL_PASS',portrait);
 const portraitDisplay=require('electron').screen.getAllDisplays().find(d=>d.bounds.height>d.bounds.width);
 if(portraitDisplay) {
  window.setBounds({...portraitDisplay.workArea,width:Math.min(900,portraitDisplay.workArea.width),height:900});
  await new Promise(resolve=>setTimeout(resolve,300));
  window.setFullScreen(true);
  for(let i=0;i<60 && !window.isFullScreen();i++)await new Promise(resolve=>setTimeout(resolve,100));
  await new Promise(resolve=>setTimeout(resolve,1200));
  assert.ok(window.isFullScreen());
  const actual=require('electron').screen.getDisplayMatching(window.getBounds());
  assert.equal(actual.id,portraitDisplay.id);
  console.log('PHYSICAL_PORTRAIT_FULLSCREEN_PASS',window.getBounds());
  window.setFullScreen(false);
 }
 assert.deepEqual(errors,[]);
};
