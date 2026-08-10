const { contextBridge, ipcRenderer } = require('electron');

const call = (ch) => (...args) => ipcRenderer.invoke(ch, ...args);

contextBridge.exposeInMainWorld('api', {
  getAll: call('getAll'),
  addWorker: call('addWorker'),
  addProject: call('addProject'),
  addLog: call('addLog'),
  addPayment: call('addPayment'),
  resetAll: call('resetAll'),
  importAll: call('importAll'),
  exportBackup: call('exportBackup'),
  importBackup: call('importBackup')
});
