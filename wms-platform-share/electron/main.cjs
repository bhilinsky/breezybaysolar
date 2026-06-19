const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')
const { createQbwcSoapHandler } = require('./qbwc-soap.cjs')

const isDev = !app.isPackaged
let mainWindow = null
let httpServer = null

const DEFAULT_SETTINGS = { username: 'wms', password: 'wms2026', port: 8738, interval: 30, conflict: 'merge', importOpts: {} }

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
    backgroundColor: '#0d3264',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  mainWindow.loadFile(path.join(__dirname, '..', 'app', 'index.html'))
}

app.whenReady().then(() => {
  currentSettings = loadSettings()
  httpServer = startQbwcServer(currentSettings.port)
  createWindow()
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
