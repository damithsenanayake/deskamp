const { app, BrowserWindow, dialog, ipcMain, webUtils } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');

const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.opus', '.webm', '.aiff', '.aif']);
let mainWindow;

function isAudio(filePath) {
  return AUDIO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

async function collectAudioFiles(inputPaths) {
  const results = [];
  const seen = new Set();
  async function visit(filePath) {
    let stat;
    try { stat = await fs.stat(filePath); } catch { return; }
    const resolved = path.resolve(filePath);
    if (seen.has(resolved)) return;
    seen.add(resolved);
    if (stat.isDirectory()) {
      let entries;
      try { entries = await fs.readdir(resolved, { withFileTypes: true }); } catch { return; }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        if (entry.isFile() || entry.isDirectory()) await visit(path.join(resolved, entry.name));
      }
    } else if (stat.isFile() && isAudio(resolved)) {
      results.push(resolved);
    }
  }
  for (const filePath of inputPaths) await visit(filePath);
  return results;
}

function libraryPath() {
  return path.join(app.getPath('userData'), 'library.json');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1160,
    height: 760,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0b1012',
    title: 'Riffbox',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  if (process.argv.includes('--dev')) mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  ipcMain.handle('pick-files', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio', extensions: [...AUDIO_EXTENSIONS].map(ext => ext.slice(1)) }]
    });
    return result.canceled ? [] : collectAudioFiles(result.filePaths);
  });
  ipcMain.handle('pick-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    return result.canceled ? [] : collectAudioFiles(result.filePaths);
  });
  ipcMain.handle('files-from-drop', (_event, paths) =>
    collectAudioFiles(Array.isArray(paths) ? paths.filter(value => typeof value === 'string') : [])
  );
  ipcMain.handle('read-library', async () => {
    try {
      return JSON.parse(await fs.readFile(libraryPath(), 'utf8'));
    } catch { return null; }
  });
  ipcMain.handle('write-library', async (_event, data) => {
    if (!data || typeof data !== 'object' || JSON.stringify(data).length > 10_000_000) return false;
    try {
      await fs.mkdir(path.dirname(libraryPath()), { recursive: true });
      await fs.writeFile(libraryPath(), JSON.stringify(data));
      return true;
    } catch { return false; }
  });
  ipcMain.handle('media-url', async (_event, filePath) => {
    if (typeof filePath !== 'string' || !isAudio(filePath)) return null;
    try {
      const stat = await fs.stat(filePath);
      return stat.isFile() ? pathToFileURL(filePath).href : null;
    } catch { return null; }
  });
  ipcMain.handle('reveal-file', async (_event, filePath) => {
    if (typeof filePath !== 'string') return;
    const { shell } = require('electron');
    shell.showItemInFolder(filePath);
  });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  createWindow();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
