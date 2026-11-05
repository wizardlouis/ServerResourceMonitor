const {app, BrowserWindow, ipcMain, Menu} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {Store} = require('./store.cjs');
const {collect} = require('./collector.cjs');
const smoke = process.argv.includes('--smoke-test');
const packageCheck = process.argv.includes('--package-check');
const testing = smoke || packageCheck;
if (testing) app.disableHardwareAcceleration();
let store, window, timer, paused = false, stopped = false;
const records = new Map(), running = new Map();
function snapshot() {
  return {config: store.config, servers: store.config.servers.map(alias => ({alias, status: 'loading', history: [], ...records.get(alias)})), paused, error: store.error, imported: store.imported, platform: process.platform, version: app.getVersion()};
}
function broadcast() { if (window && !window.isDestroyed()) window.webContents.send('snapshot', snapshot()); }
function refresh() {
  if (paused || stopped || testing) return;
  const script = fs.readFileSync(app.isPackaged ? path.join(process.resourcesPath, 'collector.py') : path.join(__dirname, '..', 'collector.py'), 'utf8');
  for (const alias of store.config.servers) {
    if (running.has(alias)) continue;
    const started = Date.now(), job = collect(alias, script);
    running.set(alias, job);
    job.promise.then(data => {
      if (running.get(alias) !== job || stopped) return;
      const values = data.gpus.map(g => g.util).filter(Number.isFinite);
      const history = [...(records.get(alias)?.history || []), {cpu: data.cpu_percent, gpu: values.length ? values.reduce((a,b) => a+b,0)/values.length : null}].slice(-120);
      records.set(alias, {...data, history, status:'online', updated:Date.now(), latency:Date.now()-started});
    }).catch(e => {
      if (running.get(alias) === job && !stopped) records.set(alias, {...records.get(alias), status:'offline', error:e.message});
    }).finally(() => { if (running.get(alias) === job) running.delete(alias); broadcast(); });
  }
}
if (!testing && !app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(async () => {
  const dir = testing ? fs.mkdtempSync(path.join(os.tmpdir(),'server-monitor-smoke-')) : path.join(app.getPath('appData'), 'ServerResourceMonitorDesktop');
  const legacy = !testing && process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support', 'ServerResourceMonitor', 'servers.json') : null;
  store = new Store(path.join(dir, 'config.json'), legacy);
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
  ipcMain.handle('action', (event, action) => {
    if (!authorized(event)) throw Error('非法请求');
    try {
      if (action?.type === 'pause') paused = !paused;
      else if (action?.type !== 'refresh') {
        store.update(action);
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
      console.log('PACKAGE PASS', process.platform, process.arch);
      fs.rmSync(dir, {recursive:true, force:true}); app.exit(0);
    } catch(e) { console.error(e); app.exit(1); }
  }
  if (smoke) {
    try {
      await require('../test/smoke.cjs')(window, store);
      console.log('SMOKE PASS', process.platform, process.arch);
      app.exit(0);
    } catch (e) { console.error(e); app.exit(1); }
    finally { fs.rmSync(dir, {recursive:true, force:true}); }
  }
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { stopped = true; clearInterval(timer); for (const job of running.values()) job.cancel(); });
