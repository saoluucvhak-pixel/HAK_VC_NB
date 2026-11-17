'use strict';
/** Cầu nối an toàn giao diện ↔ main: chỉ lộ api(action, payload, token) và logError(msg) — gửi lỗi của giao diện về nhật ký, không trả dữ liệu. */
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('dgvc', { api: (action, payload, token) => ipcRenderer.invoke('api', action, payload, token), logError: (msg) => ipcRenderer.send('client-log', String(msg).slice(0, 2000)), platform: process.platform });
