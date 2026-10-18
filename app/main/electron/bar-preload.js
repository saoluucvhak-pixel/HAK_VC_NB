'use strict';
/** Cầu nối cho thanh chuyển phân hệ (chỉ 3 thao tác: báo sẵn sàng, đổi tab, nhận trạng thái). */
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('suite', {
  ready: () => ipcRenderer.send('suite:ready'),
  switchTo: (id) => ipcRenderer.send('suite:switch', id),
  onState: (cb) => ipcRenderer.on('suite:state', (_e, s) => cb(s)),
});
