const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('monitor', {
  state: () => ipcRenderer.invoke('state'),
  action: action => ipcRenderer.invoke('action', action),
  subscribe: callback => {
    const handler = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on('snapshot', handler);
    return () => ipcRenderer.removeListener('snapshot', handler);
  }
});
