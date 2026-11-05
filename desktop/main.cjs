const {app, BrowserWindow, ipcMain, Menu, safeStorage} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {Store} = require('./store.cjs');
const {collect} = require('./collector.cjs');
const {collectPassword}=require('./password-collector.cjs');
const {Vault}=require('./vault.cjs');
const {endpoint,title,sameEndpoint,validatePassword}=require('./connections.cjs');
const {normalize}=require('./model.cjs');
const {randomUUID}=require('node:crypto');
const smoke = process.argv.includes('--smoke-test');
const packageCheck = process.argv.includes('--package-check');
const testing = smoke || packageCheck;
if (testing) app.disableHardwareAcceleration();
let store, vault, window, timer, connectionBusy=false, pendingConnection, paused = false, stopped = false;
const records = new Map(), running = new Map();
function snapshot() {
  return {config: {...store.config,passwordConnections:Object.fromEntries(Object.entries(store.config.passwordConnections).map(([id,p])=>[id,{address:p.address,port:p.port,username:p.username,remember:p.remember}]))}, canRememberPassword: vault.canRemember(), servers: store.config.servers.map(alias => ({alias, status: 'loading', history: [], ...records.get(alias)})), paused, error: store.error, imported: store.imported, platform: process.platform, version: app.getVersion()};
}
function broadcast() { if (window && !window.isDestroyed()) window.webContents.send('snapshot', snapshot()); }
function collectorScript() { return fs.readFileSync(app.isPackaged ? path.join(process.resourcesPath, 'collector.py') : path.join(__dirname, '..', 'collector.py'), 'utf8'); }
async function connectServer(action) {
  if(connectionBusy)throw Error('正在验证连接，请稍候');
  if(store.error)throw Error(store.error);
  const p=endpoint(action);validatePassword(action.password);
  const id=action.id || 'direct-'+randomUUID();
  const old=Object.hasOwn(store.config.passwordConnections,id)?store.config.passwordConnections[id]:null;
  if(action.id && !old)throw Error('连接已不存在');
  if(!action.id && store.config.servers.length>=16)throw Error('最多支持 16 台服务器');
  if(Object.entries(store.config.passwordConnections).some(([key,value])=>key!==id && sameEndpoint(value,p)))throw Error('该连接已在列表中');
  if(action.remember===true && !vault.canRemember())throw Error('系统安全存储不可用，请取消“记住密码”');
  const credentialID=randomUUID();let stored=false;
  connectionBusy=true;
  try {
    pendingConnection=collectPassword({...p,fingerprint:sameEndpoint(old,p)?old.fingerprint:undefined},action.password,collectorScript());
    const {data,fingerprint}=await pendingConnection.promise;
    if(stopped || (action.id && store.config.passwordConnections[id]!==old))throw Error('连接配置已变化，请重试');
    vault.put(credentialID,action.password,action.remember===true);stored=true;
    const next=structuredClone(store.config);
    if(!old)next.servers.push(id);
    next.passwordConnections[id]={...p,credentialID,fingerprint,remember:action.remember===true};
    if(old)next.columns=next.columns.map(c=>c.members.length===1 && c.members[0]===id && c.name===title(old)?{...c,name:title(p)}:c);
    else next.columns.push({id:randomUUID(),name:title(p),members:[id]});
    store.save(normalize(next));
    const runningJob=running.get(id);running.delete(id);runningJob?.cancel();
    records.set(id,{...data,history:[],status:'online',updated:Date.now()});
    if(old)try{vault.remove(old.credentialID);}catch{store.error='连接已更新，但旧密码记录未能清理，请检查配置目录权限';}
  } catch(error) {
    if(stored)try{vault.remove(credentialID);}catch{}
    throw error;
  } finally {action.password='';pendingConnection=null;connectionBusy=false;}
}
function refresh() {
  if (paused || stopped || testing) return;
  const script = collectorScript();
  for (const alias of store.config.servers) {
    if (running.has(alias) || records.get(alias)?.authenticationBlocked) continue;
    const profile=store.config.passwordConnections[alias];
    const started=Date.now();let job;
    try {
      if(profile) {
        const pending=collectPassword(profile,vault.get(profile.credentialID),script);
        job={promise:pending.promise.then(result=>result.data),cancel:pending.cancel};
      }else job=collect(alias,script);
    }catch(error) {
      records.set(alias,{...records.get(alias),status:'offline',authenticationBlocked:true,error:error.message});broadcast();continue;
    }
    running.set(alias, job);
    job.promise.then(data => {
      if (running.get(alias) !== job || stopped) return;
      const values = data.gpus.map(g => g.util).filter(Number.isFinite);
      const history = [...(records.get(alias)?.history || []), {cpu: data.cpu_percent, gpu: values.length ? values.reduce((a,b) => a+b,0)/values.length : null}].slice(-120);
      records.set(alias, {...data, history, status:'online', updated:Date.now(), latency:Date.now()-started});
    }).catch(e => {
      if (running.get(alias) === job && !stopped) records.set(alias, {...records.get(alias), status:'offline', authenticationBlocked:!!profile && ['AUTH','HOST_KEY','CREDENTIAL'].includes(e.code), error:e.message + (profile && ['AUTH','HOST_KEY','CREDENTIAL'].includes(e.code)?'；已暂停自动重试，请打开连接设置处理':'')});
    }).finally(() => { if (running.get(alias) === job) running.delete(alias); broadcast(); });
  }
}
if (!testing && !app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(async () => {
  const dir = testing ? fs.mkdtempSync(path.join(os.tmpdir(),'server-monitor-smoke-')) : path.join(app.getPath('appData'), 'ServerResourceMonitorDesktop');
  const legacy = !testing && process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support', 'ServerResourceMonitor', 'servers.json') : null;
  store = new Store(path.join(dir, 'config.json'), legacy);
  vault = new Vault(path.join(dir,'credentials.json'),safeStorage);
  if (smoke) {
    const fixture = require('../test/fixture.cjs');
    store.save(fixture.config);
    for (const server of fixture.servers) records.set(server.alias, server);
  }
  const page = path.join(__dirname, 'index.html');
  window = new BrowserWindow({width:1280, height:900, minWidth:760, minHeight:560, backgroundColor:'#0b111b', title:'服务器资源监控器', icon:path.join(__dirname,'..','native','icon.png'), webPreferences:{preload:path.join(__dirname,'preload.cjs'), contextIsolation:true, nodeIntegration:false, sandbox:true}});
  window.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  window.webContents.on('will-navigate', e => e.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  const authorized = event => event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame;
  ipcMain.handle('state', event => { if (!authorized(event)) throw Error('非法请求'); return snapshot(); });
  ipcMain.handle('action', async (event, action) => {
    if (!authorized(event)) throw Error('非法请求');
    try {
      if (action?.type === 'connect') await connectServer(action);
      else if (action?.type === 'pause') paused = !paused;
      else if (action?.type !== 'refresh') {
        const removed=action?.type==='remove'?store.config.passwordConnections[action.alias]:null;
        store.update(action);
        if(removed)try{vault.remove(removed.credentialID);}catch{store.error='监控已移除，但密码记录未能清理，请检查配置目录权限';}
        for (const [alias, job] of running) if (!store.config.servers.includes(alias)) { running.delete(alias); job.cancel(); }
        for (const alias of records.keys()) if (!store.config.servers.includes(alias)) records.delete(alias);
      }
      broadcast(); refresh(); return {ok:true};
    } catch (e) { return {ok:false, error:e.message}; }
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{role:'appMenu'}] : []),
    {role:'editMenu'}, {role:'viewMenu'}, {role:'windowMenu'}
  ]));
  app.on('second-instance', () => { if (window.isMinimized()) window.restore(); window.show(); window.focus(); });
  await window.loadFile(page);
  refresh(); timer = setInterval(refresh, 5000);
  if (packageCheck) {
    try {
      const collectorPath = path.join(process.resourcesPath, 'collector.py');
      if (!fs.existsSync(collectorPath)) throw Error('Packaged collector missing');
      let ready = false;
      for (let i = 0; i < 100; i++) {
        ready = await window.webContents.executeJavaScript(`document.getElementById('version').textContent === ${JSON.stringify('v'+app.getVersion())} && typeof require === 'undefined'`);
        if (ready) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (!ready) throw Error('Packaged renderer failed to initialize');
      if(typeof require('ssh2').Client!=='function')throw Error('Packaged SSH client missing');
      console.log('PACKAGE PASS', process.platform, process.arch);
      fs.rmSync(dir, {recursive:true, force:true}); app.exit(0);
    } catch(e) { console.error(e); app.exit(1); }
  }
  if (smoke) {
    try {
      await require('../test/smoke.cjs')(window, store, vault);
      console.log('SMOKE PASS', process.platform, process.arch);
      app.exit(0);
    } catch (e) { console.error(e); app.exit(1); }
    finally { fs.rmSync(dir, {recursive:true, force:true}); }
  }
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { stopped = true; clearInterval(timer); for (const job of running.values()) job.cancel(); pendingConnection?.cancel(); vault?.clearSession(); });
