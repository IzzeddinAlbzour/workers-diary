const { contextBridge, ipcRenderer } = require('electron');

const call = (ch) => (...args) => ipcRenderer.invoke(ch, ...args);

contextBridge.exposeInMainWorld('api', {
  getAll: call('getAll'),
  addWorker: call('addWorker'),
  addProject: call('addProject'),
  addLog: call('addLog'),
  addPayment: call('addPayment'),
  updateWorker: call('updateWorker'),
  updateProject: call('updateProject'),
  updateLog: call('updateLog'),
  updatePayment: call('updatePayment'),
  deleteWorker: call('deleteWorker'),
  deleteProject: call('deleteProject'),
  deleteLog: call('deleteLog'),
  deletePayment: call('deletePayment'),
  resetAll: call('resetAll'),
  importAll: call('importAll'),
  exportBackup: call('exportBackup'),
  importBackup: call('importBackup')
});
