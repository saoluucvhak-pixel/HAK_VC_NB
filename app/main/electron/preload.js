'use strict';
/** Cầu nối an toàn giao diện ↔ main: chỉ lộ đúng 1 hàm api(action, payload, token). */
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('dgvc', { api: (action, payload, token) => ipcRenderer.invoke('api', action, payload, token), platform: process.platform });
