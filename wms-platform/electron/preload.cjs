const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  screenshotPO: (poId) => ipcRenderer.invoke('screenshot-po', poId),
  qbwcDownloadQWC: () => ipcRenderer.invoke('qbwc-download-qwc'),
  qbwcTriggerSync: () => ipcRenderer.invoke('qbwc-trigger-sync'),
  qbwcSaveSettings: (settings) => ipcRenderer.invoke('qbwc-save-settings', settings),
  qbwcGetSettings: () => ipcRenderer.invoke('qbwc-get-settings'),
})

ipcRenderer.on('qb-import-data', (_event, data) => {
  if (typeof window._qbImportData === 'function') window._qbImportData(data)
})
ipcRenderer.on('qb-sync-status', (_event, status) => {
  if (typeof window._qbSyncStatus === 'function') window._qbSyncStatus(status)
})
