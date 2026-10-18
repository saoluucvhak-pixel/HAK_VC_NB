'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Kênh IPC có tiền tố "vc:" để không đụng kênh của module DGVC khi chạy chung một ứng dụng.
contextBridge.exposeInMainWorld('vcApi', {
  invoke: (channel, args) => ipcRenderer.invoke('vc:api', channel, args),
  openFile: (opts) => ipcRenderer.invoke('vc:dialog.openFile', opts || {}),
  saveExport: (info) => ipcRenderer.invoke('vc:dialog.saveExport', info),
  showItem: (p) => ipcRenderer.invoke('vc:shell.showItem', p),
  openPath: (p) => ipcRenderer.invoke('vc:shell.openPath', p),
  storageInfo: () => ipcRenderer.invoke('vc:storage.info'),
  pickFolder: () => ipcRenderer.invoke('vc:dialog.pickFolder'),
  changeStorage: (o) => ipcRenderer.invoke('vc:storage.change', o),
  isElectron: true,
});
