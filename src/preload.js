const { contextBridge, ipcRenderer, webUtils } = require('electron');

const kind = process.argv.find(arg => arg.startsWith('--deskamp-window='))?.split('=')[1] || 'player';
contextBridge.exposeInMainWorld('deskamp', {
  kind,
  getState: () => ipcRenderer.invoke('get-state'),
  dispatch: (type, value) => ipcRenderer.invoke('dispatch', { type, value }),
  onState: callback => ipcRenderer.on('state', (_event, state) => callback(state)),
  onPlayerCommand: callback => ipcRenderer.on('player-command', (_event, command) => callback(command)),
  mediaUrl: filePath => ipcRenderer.invoke('media-url', filePath),
  pathForFile: file => webUtils.getPathForFile(file)
});
