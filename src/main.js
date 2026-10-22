const { app, BrowserWindow, dialog, ipcMain, screen, shell, webUtils } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { GAP, followersBelow, findVerticalSnap } = require('./docking');

const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.opus', '.webm', '.aiff', '.aif']);
const windows = new Map();
const snapTimers = new Map();
const lastBounds = new Map();
const expectedMoves = new Map();
let saveTimer;
let state = {
  tracks: [], current: -1, playing: false, time: 0, duration: 0,
  shuffle: false, repeat: 'off', volume: 80, muted: false,
  eq: [0, 0, 0, 0, 0], eqEnabled: true, error: null
};

function libraryPath() { return path.join(app.getPath('userData'), 'library.json'); }
function isAudio(filePath) { return AUDIO_EXTENSIONS.has(path.extname(filePath).toLowerCase()); }
function parseTrack(filePath) {
  const filename = path.basename(filePath);
  const clean = filename.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
  const divider = clean.indexOf(' - ');
  return {
    path: filePath,
    title: divider > 0 ? clean.slice(divider + 3).trim() : clean,
    artist: divider > 0 ? clean.slice(0, divider).trim() : 'Unknown artist',
    format: path.extname(filePath).slice(1).toUpperCase(),
    duration: null
  };
}
async function collectAudioFiles(inputPaths) {
  const results = [];
  const seen = new Set();
  async function visit(input) {
    const resolved = path.resolve(input);
    if (seen.has(resolved)) return;
    seen.add(resolved);
    let stat;
    try { stat = await fs.stat(resolved); } catch { return; }
    if (stat.isDirectory()) {
      let entries;
      try { entries = await fs.readdir(resolved, { withFileTypes: true }); } catch { return; }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        if (entry.isFile() || entry.isDirectory()) await visit(path.join(resolved, entry.name));
      }
    } else if (stat.isFile() && isAudio(resolved)) results.push(resolved);
  }
  for (const input of inputPaths) if (typeof input === 'string') await visit(input);
  return results;
}
function snapshot() {
  return { ...structuredClone(state), windows: Object.fromEntries([...windows].map(([kind, win]) => [kind, !win.isDestroyed() && win.isVisible()])) };
}
function broadcast() {
  const data = snapshot();
  for (const win of windows.values()) if (!win.isDestroyed()) win.webContents.send('state', data);
}
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const saved = {
      tracks: state.tracks, currentPath: state.tracks[state.current]?.path || null,
      volume: state.volume, shuffle: state.shuffle, repeat: state.repeat,
      eq: state.eq, eqEnabled: state.eqEnabled
    };
    try {
      await fs.mkdir(path.dirname(libraryPath()), { recursive: true });
      await fs.writeFile(libraryPath(), JSON.stringify(saved));
    } catch (error) { console.error('Could not save playlist:', error); }
  }, 250);
}
async function restoreLibrary() {
  const candidates = [libraryPath(), path.join(app.getPath('appData'), 'Riffbox', 'library.json'), path.join(app.getPath('appData'), 'riffbox', 'library.json')];
  for (const candidate of candidates) {
    try {
      const saved = JSON.parse(await fs.readFile(candidate, 'utf8'));
      if (!Array.isArray(saved.tracks)) continue;
      state.tracks = saved.tracks.filter(track => track && typeof track.path === 'string' && typeof track.title === 'string');
      state.current = state.tracks.findIndex(track => track.path === saved.currentPath);
      state.volume = Number.isFinite(saved.volume) ? Math.max(0, Math.min(100, saved.volume)) : 80;
      state.shuffle = Boolean(saved.shuffle);
      state.repeat = ['off', 'all', 'one'].includes(saved.repeat) ? saved.repeat : 'off';
      state.eq = Array.isArray(saved.eq) && saved.eq.length === 5 ? saved.eq.map(value => Math.max(-12, Math.min(12, Number(value) || 0))) : [0, 0, 0, 0, 0];
      state.eqEnabled = saved.eqEnabled !== false;
      state.duration = state.tracks[state.current]?.duration || 0;
      break;
    } catch { /* Try previous app name. */ }
  }
}

function visibleKinds() {
  return new Set([...windows].filter(([, win]) => !win.isDestroyed() && win.isVisible()).map(([kind]) => kind));
}

function syncNativeDocking() {
  if (process.platform !== 'darwin') return;
  const visible = visibleKinds();
  const bounds = new Map([...windows].filter(([kind]) => visible.has(kind)).map(([kind, win]) => [kind, win.getBounds()]));
  for (const [kind, win] of windows) {
    if (win.isDestroyed()) continue;
    const child = bounds.get(kind);
    const above = child && [...bounds].find(([otherKind, parent]) => otherKind !== kind &&
      Math.abs(child.x - parent.x) <= 4 &&
      Math.abs(child.y - (parent.y + parent.height + GAP)) <= 4);
    const parentWindow = above ? windows.get(above[0]) : null;
    if (win.getParentWindow() !== parentWindow) win.setParentWindow(parentWindow);
  }
}

function hidePanel(win) {
  if (process.platform === 'darwin') {
    for (const child of win.getChildWindows()) child.setParentWindow(null);
  }
  win.hide();
  syncNativeDocking();
}

function moveAttached(kind, deltaX, deltaY, includeRoot = false) {
  if (!deltaX && !deltaY) return;
  if (process.platform === 'darwin') {
    if (includeRoot) {
      const win = windows.get(kind);
      const previous = lastBounds.get(kind);
      if (win && previous) {
        const next = { ...previous, x: previous.x + deltaX, y: previous.y + deltaY };
        expectedMoves.set(kind, next);
        win.setPosition(next.x, next.y);
        for (const [member, attached] of windows) if (!attached.isDestroyed()) lastBounds.set(member, attached.getBounds());
      }
    }
    return;
  }
  const group = [...(includeRoot ? [kind] : []), ...followersBelow(lastBounds, kind, visibleKinds())];
  for (const member of group) {
    const win = windows.get(member);
    const previous = lastBounds.get(member);
    if (!win || win.isDestroyed() || !previous) continue;
    const next = { ...previous, x: previous.x + deltaX, y: previous.y + deltaY };
    lastBounds.set(member, next);
    expectedMoves.set(member, next);
    clearTimeout(snapTimers.get(member));
    win.setPosition(next.x, next.y);
  }
}

function handleMove(kind, win) {
  const current = win.getBounds();
  const expected = expectedMoves.get(kind);
  if (expected) {
    expectedMoves.delete(kind);
    if (current.x === expected.x && current.y === expected.y) {
      lastBounds.set(kind, current);
      return;
    }
  }
  const previous = lastBounds.get(kind);
  if (!previous) { lastBounds.set(kind, current); return; }
  const deltaX = current.x - previous.x;
  const deltaY = current.y - previous.y;
  if (!deltaX && !deltaY) return;
  if (process.platform !== 'darwin') moveAttached(kind, deltaX, deltaY);
  lastBounds.set(kind, current);
  clearTimeout(snapTimers.get(kind));
  snapTimers.set(kind, setTimeout(() => snapWindow(kind), 250));
}

function snapWindow(kind) {
  const win = windows.get(kind);
  if (!win || win.isDestroyed() || !win.isVisible()) return;
  const visible = visibleKinds();
  const bounds = new Map([...windows].filter(([name]) => visible.has(name)).map(([name, window]) => [name, window.getBounds()]));
  const followers = new Set(followersBelow(bounds, kind, visible));
  const snap = findVerticalSnap(bounds, kind, visible, followers);
  if (!snap) return;
  const current = bounds.get(kind);
  moveAttached(kind, snap.x - current.x, snap.y - current.y, true);
  syncNativeDocking();
}

function createWindow(kind, bounds) {
  const win = new BrowserWindow({
    ...bounds, minWidth: 520, maxWidth: 520,
    minHeight: kind === 'playlist' ? 260 : bounds.height,
    maxHeight: kind === 'playlist' ? 800 : bounds.height,
    resizable: kind === 'playlist', frame: false, fullscreenable: false,
    show: false, backgroundColor: '#242b35', title: `DeskAmp ${kind}`,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, additionalArguments: [`--deskamp-window=${kind}`] }
  });
  windows.set(kind, win);
  lastBounds.set(kind, { ...bounds });
  win.loadFile(path.join(__dirname, 'index.html'), { query: { window: kind } });
  win.once('ready-to-show', () => { win.show(); syncNativeDocking(); broadcast(); });
  win.on('will-move', () => {
    if (process.platform === 'darwin' && win.getParentWindow()) win.setParentWindow(null);
  });
  win.on('move', () => handleMove(kind, win));
  win.on('resize', () => lastBounds.set(kind, win.getBounds()));
  win.on('close', event => {
    if (kind !== 'player' && !app.isQuitting) { event.preventDefault(); hidePanel(win); broadcast(); }
  });
  win.on('closed', () => { windows.delete(kind); lastBounds.delete(kind); expectedMoves.delete(kind); clearTimeout(snapTimers.get(kind)); snapTimers.delete(kind); if (kind === 'player') app.quit(); });
  return win;
}

function nextIndex() {
  if (!state.tracks.length) return -1;
  if (state.shuffle && state.tracks.length > 1) {
    let index;
    do { index = Math.floor(Math.random() * state.tracks.length); } while (index === state.current);
    return index;
  }
  return (state.current + 1) % state.tracks.length;
}
function selectTrack(index, playing = true) {
  if (!Number.isInteger(index) || index < 0 || index >= state.tracks.length) return;
  const sameTrack = index === state.current;
  state.current = index;
  state.playing = playing;
  state.time = 0;
  state.duration = state.tracks[index].duration || 0;
  state.error = null;
  if (sameTrack) sendPlayerCommand('seek', 0);
  broadcast(); saveSoon();
}
async function addPaths(paths) {
  const files = await collectAudioFiles(paths);
  const seen = new Set(state.tracks.map(track => track.path));
  let added = 0;
  for (const filePath of files) if (!seen.has(filePath)) { state.tracks.push(parseTrack(filePath)); seen.add(filePath); added++; }
  if (added && state.current < 0) selectTrack(0, false);
  else if (added) { broadcast(); saveSoon(); }
  return added;
}
function sendPlayerCommand(command, value) { windows.get('player')?.webContents.send('player-command', { command, value }); }

async function dispatch(action, sender) {
  const { type, value } = action || {};
  if (type === 'add-files' || type === 'add-folder') {
    const owner = BrowserWindow.fromWebContents(sender);
    const options = type === 'add-files'
      ? { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Audio', extensions: [...AUDIO_EXTENSIONS].map(ext => ext.slice(1)) }] }
      : { properties: ['openDirectory'] };
    const choice = await dialog.showOpenDialog(owner, options);
    return choice.canceled ? 0 : addPaths(choice.filePaths);
  }
  if (type === 'import-paths') return addPaths(Array.isArray(value) ? value : []);
  if (type === 'select-track') return selectTrack(value, true);
  if (type === 'play-toggle') {
    if (!state.tracks.length) return;
    if (state.current < 0) return selectTrack(0, true);
    state.playing = !state.playing;
  } else if (type === 'next') {
    return selectTrack(nextIndex(), true);
  } else if (type === 'previous') {
    if (state.time > 3) { sendPlayerCommand('seek', 0); return; }
    return selectTrack((state.current - 1 + state.tracks.length) % state.tracks.length, true);
  } else if (type === 'seek') {
    sendPlayerCommand('seek', Number(value) || 0); return;
  } else if (type === 'set-volume') {
    state.volume = Math.max(0, Math.min(100, Number(value) || 0));
  } else if (type === 'toggle-mute') {
    state.muted = !state.muted;
  } else if (type === 'toggle-shuffle') {
    state.shuffle = !state.shuffle;
  } else if (type === 'toggle-repeat') {
    state.repeat = state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off';
  } else if (type === 'eq-set') {
    const index = Number(value?.index);
    if (index < 0 || index >= 5) return;
    state.eq[index] = Math.max(-12, Math.min(12, Number(value.gain) || 0));
  } else if (type === 'eq-toggle') {
    state.eqEnabled = !state.eqEnabled;
  } else if (type === 'eq-reset') {
    state.eq = [0, 0, 0, 0, 0];
  } else if (type === 'remove-track') {
    const index = Number(value);
    if (!Number.isInteger(index) || index < 0 || index >= state.tracks.length) return;
    state.tracks.splice(index, 1);
    if (!state.tracks.length) { state.current = -1; state.playing = false; state.time = 0; state.duration = 0; }
    else if (index === state.current) { state.current = Math.min(index, state.tracks.length - 1); state.time = 0; state.duration = state.tracks[state.current].duration || 0; }
    else if (index < state.current) state.current--;
  } else if (type === 'clear-library') {
    state.tracks = []; state.current = -1; state.playing = false; state.time = 0; state.duration = 0;
  } else if (type === 'player-progress') {
    if (sender !== windows.get('player')?.webContents) return;
    state.time = Number(value) || 0; return;
  } else if (type === 'player-duration') {
    if (sender !== windows.get('player')?.webContents || state.current < 0) return;
    state.duration = Number(value) || 0;
    state.tracks[state.current].duration = state.duration;
  } else if (type === 'player-ended') {
    if (sender !== windows.get('player')?.webContents) return;
    if (state.repeat === 'one') { sendPlayerCommand('restart'); state.playing = true; }
    else if (state.repeat === 'off' && !state.shuffle && state.current === state.tracks.length - 1) { state.playing = false; sendPlayerCommand('seek', 0); }
    else return selectTrack(nextIndex(), true);
  } else if (type === 'player-error') {
    state.error = String(value || 'Unable to play file'); state.playing = false;
  } else if (type === 'reveal-file') {
    const track = state.tracks[Number(value)];
    if (track) shell.showItemInFolder(track.path);
    return;
  } else if (type === 'window') {
    const kind = String(value?.kind || '');
    const target = windows.get(kind);
    if (!target) return;
    if (value?.command === 'toggle') { if (target.isVisible()) hidePanel(target); else { target.show(); target.focus(); syncNativeDocking(); } }
    if (value?.command === 'minimize') target.minimize();
    if (value?.command === 'close') { if (kind === 'player') app.quit(); else hidePanel(target); }
    broadcast(); return;
  } else return;
  broadcast(); saveSoon();
}

app.on('before-quit', () => { app.isQuitting = true; });
app.whenReady().then(async () => {
  await restoreLibrary();
  ipcMain.handle('get-state', () => snapshot());
  ipcMain.handle('dispatch', (event, action) => dispatch(action, event.sender));
  ipcMain.handle('media-url', async (_event, filePath) => {
    if (!state.tracks.some(track => track.path === filePath) || !isAudio(filePath)) return null;
    try { return (await fs.stat(filePath)).isFile() ? pathToFileURL(filePath).href : null; } catch { return null; }
  });
  const area = screen.getPrimaryDisplay().workArea;
  const x = Math.round(area.x + (area.width - 520) / 2);
  const totalHeight = 232 + 154 + 330 + 2 * GAP;
  const y = Math.max(area.y + 8, Math.round(area.y + (area.height - totalHeight) / 2));
  createWindow('player', { x, y, width: 520, height: 232 });
  createWindow('equalizer', { x, y: y + 232 + GAP, width: 520, height: 154 });
  createWindow('playlist', { x, y: y + 232 + GAP + 154 + GAP, width: 520, height: 330 });
  app.on('activate', () => { for (const win of windows.values()) win.show(); });
});
