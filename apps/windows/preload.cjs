const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kotobudDesktop', {
  isPortable: () => ipcRenderer.invoke('kotobud:is-portable'),
  createDesktopShortcut: () => ipcRenderer.invoke('kotobud:create-desktop-shortcut'),
  getStartupMetrics: () => ipcRenderer.invoke('kotobud:get-startup-metrics')
});
