const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('posDesktop', {
  getDisplays: () => ipcRenderer.invoke('system:displays'),
  openCustomerDisplay: (id) => ipcRenderer.invoke('display:open', id),
  closeCustomerDisplay: () => ipcRenderer.invoke('display:close'),
  version: () => ipcRenderer.invoke('app:version'),
  getPrinters: () => ipcRenderer.invoke('printers:list'),
  print: (payload) => ipcRenderer.invoke('printer:print', payload),
  aiKeyStatus: () => ipcRenderer.invoke('ai:key:status'),
  setAIKey: (key) => ipcRenderer.invoke('ai:key:set', key),
  aiCommand: (payload) => ipcRenderer.invoke('ai:command', payload)
});
