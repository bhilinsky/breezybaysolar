const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')
const { createQbwcSoapHandler } = require('./qbwc-soap.cjs')

const isDev = !app.isPackaged
let mainWindow = null
let httpServer = null

const DEFAULT_SETTINGS = { username: 'wms', password: 'wms2026', port: 8737, interval: 30, conflict: 'merge', importOpts: {} }

function settingsPath() {
  return path.join(app.getPath('userData'), 'qbwc-settings.json')
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8')
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function saveSettings(settings) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2))
}

let currentSettings = DEFAULT_SETTINGS

function run(js) { if (mainWindow) mainWindow.webContents.executeJavaScript(js) }

function qwcXml(settings) {
  const template = fs.readFileSync(path.join(resourcesPath(), 'WMSPlatform.qwc'), 'utf8')
  return template
    .replace(/<AppURL>.*?<\/AppURL>/, `<AppURL>http://localhost:${settings.port}/wms-qbwc</AppURL>`)
    .replace(/<UserName>.*?<\/UserName>/, `<UserName>${settings.username}</UserName>`)
}

function resourcesPath() {
  return isDev ? path.join(__dirname, '..', 'resources') : path.join(process.resourcesPath, 'resources')
}

function startQbwcServer(port) {
  const soap = createQbwcSoapHandler({
    getSettings: () => currentSettings,
    onImportData: (data) => mainWindow && mainWindow.webContents.send('qb-import-data', data),
    onSyncStatus: (status) => mainWindow && mainWindow.webContents.send('qb-sync-status', status),
    appUrl: () => `http://localhost:${currentSettings.port}/wms-qbwc`,
  })

  const server = http.createServer((req, res) => {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' })
      res.end(soap.wsdl())
      return
    }
    if (req.method === 'POST') {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        let result
        try {
          result = soap.handle(body)
        } catch (e) {
          result = null
        }
        if (result == null) {
          res.writeHead(500, { 'Content-Type': 'text/xml; charset=utf-8' })
          res.end('<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultstring>Unrecognized SOAP method</faultstring></soap:Fault></soap:Body></soap:Envelope>')
          return
        }
        res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' })
        res.end(result)
      })
      return
    }
    res.writeHead(405)
    res.end()
  })

  server.on('error', (err) => {
    if (mainWindow) mainWindow.webContents.send('qb-sync-status', { message: `QBWC server error: ${err.message}` })
  })
  server.listen(port, '127.0.0.1')
  return server
}

function restartQbwcServer(port) {
  if (httpServer) httpServer.close()
  httpServer = startQbwcServer(port)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'WMS Platform — XStatic Pro / Pro X Live Lighting',
    backgroundColor: '#0d3264',
    icon: path.join(resourcesPath(), 'icon-512.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  mainWindow.loadFile(path.join(__dirname, '..', 'app', 'index.html'))

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'F12') mainWindow.webContents.toggleDevTools()
    if (input.key === 'F5') mainWindow.webContents.reload()
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(() => {
  currentSettings = loadSettings()
  httpServer = startQbwcServer(currentSettings.port)
  createWindow()

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [
      { label: 'New Invoice', accelerator: 'CmdOrCtrl+I', click() { run(`if(typeof openInvoiceForm==="function")openInvoiceForm(null)`) } },
      { label: 'New Sales Order', accelerator: 'CmdOrCtrl+N', click() { run(`if(typeof openSOForm==="function")openSOForm(null,null)`) } },
      { type: 'separator' },
      { label: 'Export Backup…', accelerator: 'CmdOrCtrl+E', click() {
        run(`(function(){const keys=['wms_items','wms_users','wms_orders','wms_ar','wms_ap','wms_je','wms_gl','wms_bank','wms_sacc','wms_po','wms_picklists','wms_inv','wms_settings','wms_bom','wms_wo','wms_reps','wms_vend','wms_payroll','wms_vp_inquiries'];const d={};keys.forEach(k=>{const v=localStorage.getItem(k);if(v)try{d[k]=JSON.parse(v);}catch(e){d[k]=v;}});if(window.electronAPI?.saveBackup)window.electronAPI.saveBackup(JSON.stringify(d)).then(r=>{if(r?.ok)alert('Backup saved to: '+r.filePath)})})()`)
      }},
      { label: 'Import Backup…', click() {
        if (!mainWindow) return
        dialog.showOpenDialog(mainWindow, { title: 'Import WMS Backup', filters: [{ name: 'JSON Backup', extensions: ['json'] }], properties: ['openFile'] }).then(r => {
          if (!r.canceled && r.filePaths.length) {
            const content = fs.readFileSync(r.filePaths[0], 'utf8')
            run(`(function(){try{const d=JSON.parse(${JSON.stringify(content)});Object.keys(d).forEach(k=>localStorage.setItem(k,JSON.stringify(d[k])));alert('Backup restored. Reloading…');location.reload()}catch(e){alert('Import failed: '+e.message)}})()`)
          }
        })
      }},
      { type: 'separator' },
      { label: 'Print', accelerator: 'CmdOrCtrl+P', click() { run(`window.print()`) } },
      { type: 'separator' },
      { label: 'Quit', accelerator: 'Alt+F4', click() { app.quit() } },
    ]},
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
    ]},
    { label: 'View', submenu: [
      { role: 'reload' }, { role: 'forceReload' }, { type: 'separator' },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' },
      { role: 'togglefullscreen' },
      { label: 'Developer Tools', accelerator: 'F12', click() { mainWindow?.webContents.toggleDevTools() } },
    ]},
    { label: 'Company', submenu: [
      { label: 'Settings', click() { run(`showAdm('cfg')`) } },
      { label: 'Users', click() { run(`showAdm('usr')`) } },
      { label: 'QuickBooks Sync', click() { run(`showAdm('cfg')`) } },
    ]},
    { label: 'Customers', submenu: [
      { label: 'Customer Center', accelerator: 'CmdOrCtrl+J', click() { run(`showAdm('cst')`) } },
      { label: 'New Invoice', click() { run(`openInvoiceForm&&openInvoiceForm(null)`) } },
      { label: 'New Sales Order', click() { run(`openSOForm&&openSOForm(null,null)`) } },
      { label: 'A/R Aging', click() { run(`rRpt('ar_aging')`) } },
    ]},
    { label: 'Vendors', submenu: [
      { label: 'Vendor Center', click() { run(`showAdm('vnd')`) } },
      { label: 'Vendor Portal', click() { run(`showAdm('vp')`) } },
      { label: 'A/P Aging', click() { run(`rRpt('ap_aging')`) } },
    ]},
    { label: 'Inventory', submenu: [
      { label: 'Item Catalog', click() { run(`showAdm('cat')`) } },
      { label: 'Inventory', click() { run(`showAdm('inv')`) } },
      { label: 'Receiving', click() { run(`showAdm('rcv')`) } },
      { label: 'Inventory Valuation', click() { run(`rRpt('inv_val')`) } },
    ]},
    { label: 'Warehouse', submenu: [
      { label: '3D Warehouse', click() { run(`showAdm('wh')`) } },
      { label: 'Pick Station', click() { run(`showAdm('pck')`) } },
      { label: 'Scan Station', click() { run(`showAdm('scn')`) } },
      { label: 'Transfer Orders', click() { run(`showAdm('trf')`) } },
    ]},
    { label: 'Reports', submenu: [
      { label: 'Report Center', click() { run(`showAdm('rpt')`) } },
      { type: 'separator' },
      { label: 'Profit & Loss', click() { run(`rRpt('pl')`) } },
      { label: 'Balance Sheet', click() { run(`rRpt('bs')`) } },
      { label: 'A/R Aging', click() { run(`rRpt('ar_aging')`) } },
      { label: 'A/P Aging', click() { run(`rRpt('ap_aging')`) } },
      { label: 'Sales by Customer', click() { run(`rRpt('sales_cust')`) } },
      { label: 'Sales by Item', click() { run(`rRpt('sales_item')`) } },
      { label: 'Inventory Valuation', click() { run(`rRpt('inv_val')`) } },
    ]},
    { label: 'Help', submenu: [
      { label: 'About WMS Platform v1.0.0', click() {
        dialog.showMessageBox(mainWindow, { type: 'info', title: 'About', message: 'WMS Platform v1.0.0', detail: 'XStatic Pro / Pro X Live Lighting\n2807 Arthur Kill Road\nStaten Island, NY 10309\n718-237-2299\n\n© 2026 XStatic Pro Inc', buttons: ['OK'] })
      }},
    ]},
  ]))
})

app.on('window-all-closed', () => {
  if (httpServer) httpServer.close()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

ipcMain.handle('qbwc-get-settings', () => currentSettings)

ipcMain.handle('qbwc-save-settings', (_event, settings) => {
  const portChanged = settings.port && settings.port !== currentSettings.port
  currentSettings = { ...currentSettings, ...settings }
  saveSettings(currentSettings)
  if (portChanged) restartQbwcServer(currentSettings.port)
  return true
})

ipcMain.handle('qbwc-download-qwc', () => qwcXml(currentSettings))

ipcMain.handle('qbwc-trigger-sync', () => {
  // QBWC itself owns the sync trigger (its tray app polls/runs on its own
  // schedule, or the user clicks "Update Selected"); there is no public,
  // silent way to invoke it from outside. We just reset local sync state
  // so the UI shows "waiting" until QBWC next calls in.
  return true
})

ipcMain.handle('screenshot-po', async (_event, _poId) => {
  if (!mainWindow) return null
  const image = await mainWindow.webContents.capturePage()
  return image.toDataURL()
})

ipcMain.handle('save-backup', async (_event, jsonString) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save WMS Backup',
    defaultPath: `wms-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON Backup', extensions: ['json'] }],
  })
  if (result.canceled || !result.filePath) return { ok: false }
  fs.writeFileSync(result.filePath, jsonString, 'utf8')
  return { ok: true, filePath: result.filePath }
})

ipcMain.handle('load-backup', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import WMS Backup',
    filters: [{ name: 'JSON Backup', extensions: ['json'] }],
    properties: ['openFile'],
  })
  if (result.canceled || !result.filePaths.length) return { ok: false }
  return { ok: true, content: fs.readFileSync(result.filePaths[0], 'utf8') }
})
