const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('riffbox', {
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  filesFromDrop: paths => ipcRenderer.invoke('files-from-drop', paths),
  pathForFile: file => webUtils.getPathForFile(file),
  readLibrary: () => ipcRenderer.invoke('read-library'),
  writeLibrary: data => ipcRenderer.invoke('write-library', data),
  mediaUrl: path => ipcRenderer.invoke('media-url', path),
  revealFile: path => ipcRenderer.invoke('reveal-file', path)
});
