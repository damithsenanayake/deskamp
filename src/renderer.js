const api = window.deskamp;
const kind = api.kind;
const $ = id => document.getElementById(id);
document.body.dataset.window = kind;
let state = null;
let loadedPath = null;
let loadToken = 0;
let audioContext = null;
let analyser = null;
let filters = [];
let lastProgress = 0;
let lastPlaylistCurrent = null;
let lastPlaylistQuery = null;
let lastMediaTrack = null;
const audio = $('audio');
const bands = [
  { label: '60 HZ', frequency: 60, type: 'lowshelf' },
  { label: '230 HZ', frequency: 230, type: 'peaking' },
  { label: '910 HZ', frequency: 910, type: 'peaking' },
  { label: '4 KHZ', frequency: 4000, type: 'peaking' },
  { label: '14 KHZ', frequency: 14000, type: 'highshelf' }
];

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
function rangeFill(input, percent) { input.style.setProperty('--fill', `${Math.max(0, Math.min(100, percent))}%`); }
function dispatch(type, value) { return api.dispatch(type, value); }
function bindWheelAdjust(hoverArea, input, amount) {
  let pending = 0;
  let lastWheel = 0;
  hoverArea.addEventListener('wheel', event => {
    event.preventDefault();
    if (!event.deltaY) return;
    const now = performance.now();
    if (now - lastWheel > 250 || Math.sign(pending) === Math.sign(event.deltaY)) pending = 0;
    lastWheel = now;
    const direction = -Math.sign(event.deltaY);
    const wheelTick = event.deltaMode !== 0 || Math.abs(event.deltaY) >= 80;
    pending += wheelTick ? direction : -event.deltaY / 30;
    const steps = Math.trunc(pending);
    pending -= steps;
    if (!steps) return;
    const next = Math.max(Number(input.min), Math.min(Number(input.max), Number(input.value) + steps * amount));
    if (next === Number(input.value)) return;
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, { passive: false });
}

function ensureAudioGraph() {
  if (audioContext) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    audioContext = new AudioContextClass();
    const source = audioContext.createMediaElementSource(audio);
    filters = bands.map(band => {
      const filter = audioContext.createBiquadFilter();
      filter.type = band.type;
      filter.frequency.value = band.frequency;
      filter.Q.value = 1;
      return filter;
    });
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(filters[0]);
    filters.forEach((filter, index) => filter.connect(filters[index + 1] || analyser));
    analyser.connect(audioContext.destination);
    applyEq();
  } catch (error) { console.error('Audio effects unavailable:', error); }
}
function applyEq() {
  if (!state) return;
  filters.forEach((filter, index) => { filter.gain.value = state.eqEnabled ? state.eq[index] : 0; });
}
async function startAudio() {
  if (!audio.src || !state?.playing) return;
  ensureAudioGraph();
  try {
    if (audioContext?.state === 'suspended') await audioContext.resume();
    await audio.play();
  } catch (error) { dispatch('player-error', error.message || 'Unable to play file'); }
}
async function loadAudio(filePath, shouldPlay) {
  const token = ++loadToken;
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  loadedPath = filePath;
  if (!filePath) return;
  const url = await api.mediaUrl(filePath);
  if (token !== loadToken) return;
  if (!url) { dispatch('player-error', 'File missing'); return; }
  audio.src = url;
  audio.load();
  if (shouldPlay) startAudio();
}
function renderPlayer() {
  const track = state.tracks[state.current];
  updateMediaSession(track);
  $('current-title').textContent = (track?.title || 'NO TRACK LOADED').toUpperCase();
  $('current-artist').textContent = (state.error || track?.artist || 'ADD FILES TO BEGIN').toUpperCase();
  $('track-number').textContent = track ? `${String(state.current + 1).padStart(2, '0')} / ${String(state.tracks.length).padStart(2, '0')}` : '— / —';
  $('file-type').textContent = track?.format || 'AUDIO';
  $('deck-mode').textContent = state.playing ? 'PLAYING' : track ? 'PAUSED' : 'STANDBY';
  $('topbar-status').textContent = state.error ? 'ERROR' : state.playing ? 'ON AIR' : 'READY';
  $('spectrum-status').textContent = state.playing ? 'SIGNAL' : 'NO SIGNAL';
  $('duration').textContent = formatTime(state.duration);
  $('footer-summary').textContent = `${state.tracks.length} ${state.tracks.length === 1 ? 'TRACK' : 'TRACKS'}`;
  $('play').querySelector('use').setAttribute('href', state.playing ? '#i-pause' : '#i-play');
  $('play').setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
  $('shuffle').classList.toggle('active', state.shuffle);
  $('shuffle').setAttribute('aria-label', `Shuffle ${state.shuffle ? 'on' : 'off'}`);
  $('repeat').classList.toggle('active', state.repeat !== 'off');
  $('repeat').textContent = state.repeat === 'one' ? 'REP1' : 'REP';
  $('repeat').setAttribute('aria-label', `Repeat ${state.repeat}`);
  $('mute').classList.toggle('active', state.muted);
  $('mute').setAttribute('aria-label', state.muted ? 'Unmute' : 'Mute');
  $('volume').value = state.volume;
  $('volume-value').textContent = state.volume;
  rangeFill($('volume'), state.volume);
  $('show-eq').classList.toggle('active', Boolean(state.windows?.equalizer));
  $('show-playlist').classList.toggle('active', Boolean(state.windows?.playlist));
  audio.volume = state.volume / 100;
  audio.muted = state.muted;
  applyEq();
  const path = track?.path || null;
  if (path !== loadedPath) loadAudio(path, state.playing);
  else if (state.playing && audio.paused && audio.src) startAudio();
  else if (!state.playing && !audio.paused) audio.pause();
}
function updateMediaSession(track) {
  if (!('mediaSession' in navigator)) return;
  const trackPath = track?.path || null;
  if (trackPath !== lastMediaTrack) {
    lastMediaTrack = trackPath;
    navigator.mediaSession.metadata = track ? new MediaMetadata({
      title: track.title,
      artist: track.artist
    }) : null;
  }
  navigator.mediaSession.playbackState = state.playing ? 'playing' : 'paused';
}
function bindMediaSession() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.setActionHandler('play', () => {
    if (!state?.playing) dispatch('play-toggle');
  });
  navigator.mediaSession.setActionHandler('pause', () => {
    if (state?.playing) dispatch('play-toggle');
  });
  navigator.mediaSession.setActionHandler('previoustrack', () => dispatch('previous'));
  navigator.mediaSession.setActionHandler('nexttrack', () => dispatch('next'));
}
function drawVisualizer() {
  const canvas = $('visualizer');
  const ctx = canvas.getContext('2d');
  const data = new Uint8Array(128);
  function frame() {
    ctx.fillStyle = '#0a1717';
    ctx.fillRect(0, 0, 640, 100);
    if (analyser && state?.playing) analyser.getByteFrequencyData(data);
    for (let index = 0; index < 64; index++) {
      const sample = analyser && state?.playing ? data[Math.floor(Math.pow(index / 64, 1.5) * 127)] : 0;
      const height = Math.max(4, Math.round(sample / 255 * 96));
      ctx.fillStyle = sample > 180 ? '#d8e98a' : sample > 70 ? '#a9e26f' : '#4a8150';
      ctx.fillRect(index * 10 + 1, 99 - height, 7, height);
    }
    requestAnimationFrame(frame);
  }
  frame();
}
function bindPlayer() {
  bindMediaSession();
  $('play').addEventListener('click', () => dispatch('play-toggle'));
  $('previous').addEventListener('click', () => dispatch('previous'));
  $('next').addEventListener('click', () => dispatch('next'));
  $('shuffle').addEventListener('click', () => dispatch('toggle-shuffle'));
  $('repeat').addEventListener('click', () => dispatch('toggle-repeat'));
  $('mute').addEventListener('click', () => dispatch('toggle-mute'));
  $('volume').addEventListener('input', event => { rangeFill(event.target, Number(event.target.value)); dispatch('set-volume', Number(event.target.value)); });
  bindWheelAdjust($('volume'), $('volume'), 2);
  $('seek').addEventListener('input', event => { if (audio.duration) { audio.currentTime = Number(event.target.value) / 1000 * audio.duration; dispatch('player-progress', audio.currentTime); } });
  $('show-eq').addEventListener('click', () => dispatch('window', { kind: 'equalizer', command: 'toggle' }));
  $('show-playlist').addEventListener('click', () => dispatch('window', { kind: 'playlist', command: 'toggle' }));
  audio.addEventListener('loadedmetadata', () => { if (Number.isFinite(audio.duration)) dispatch('player-duration', audio.duration); });
  audio.addEventListener('timeupdate', () => {
    $('elapsed').textContent = formatTime(audio.currentTime);
    $('seek').value = audio.duration ? Math.round(audio.currentTime / audio.duration * 1000) : 0;
    rangeFill($('seek'), Number($('seek').value) / 10);
    const now = performance.now();
    if (now - lastProgress > 400) { lastProgress = now; dispatch('player-progress', audio.currentTime); }
  });
  audio.addEventListener('ended', () => dispatch('player-ended'));
  audio.addEventListener('error', () => { if (audio.src) dispatch('player-error', 'Unsupported or damaged audio file'); });
  api.onPlayerCommand(({ command, value }) => {
    if (command === 'seek' && audio.duration) { audio.currentTime = Math.max(0, Math.min(audio.duration, Number(value) || 0)); $('elapsed').textContent = formatTime(audio.currentTime); }
    if (command === 'restart') { audio.currentTime = 0; startAudio(); }
  });
  drawVisualizer();
}

function renderEq() {
  $('eq-toggle').classList.toggle('active', state.eqEnabled);
  $('eq-toggle').textContent = state.eqEnabled ? 'ON' : 'OFF';
  $('eq-toggle').setAttribute('aria-checked', String(state.eqEnabled));
  document.querySelectorAll('.eq-band').forEach((element, index) => {
    element.querySelector('input').value = state.eq[index];
    element.querySelector('output').textContent = `${state.eq[index] > 0 ? '+' : ''}${state.eq[index]} dB`;
  });
}
function bindEq() {
  bands.forEach((band, index) => {
    const element = document.createElement('div');
    element.className = 'eq-band';
    const output = document.createElement('output');
    const input = document.createElement('input');
    input.type = 'range'; input.min = -12; input.max = 12; input.step = 1;
    input.setAttribute('aria-label', `${band.label} equalizer`);
    input.addEventListener('input', () => { output.textContent = `${Number(input.value) > 0 ? '+' : ''}${input.value} dB`; dispatch('eq-set', { index, gain: Number(input.value) }); });
    const label = document.createElement('label'); label.textContent = band.label;
    element.append(output, input, label);
    bindWheelAdjust(element, input, 1);
    $('eq-bands').append(element);
  });
  $('eq-toggle').addEventListener('click', () => dispatch('eq-toggle'));
  $('eq-reset').addEventListener('click', () => dispatch('eq-reset'));
}

function createTrackRow(track, index) {
  const row = document.createElement('div');
  row.className = `track-row${index === state.current ? ' current' : ''}`;
  row.setAttribute('role', 'listitem'); row.tabIndex = 0;
  if (index === state.current) row.setAttribute('aria-current', 'true');
  const number = document.createElement('span'); number.className = 'track-index'; number.textContent = String(index + 1).padStart(2, '0');
  const details = document.createElement('div'); details.className = 'track-details';
  const icon = document.createElement('span'); icon.className = 'track-icon'; icon.textContent = index === state.current && state.playing ? '▶' : '♪';
  const text = document.createElement('span'); text.className = 'track-text';
  const title = document.createElement('span'); title.className = 'track-title'; title.textContent = track.title;
  const artist = document.createElement('span'); artist.className = 'track-artist'; artist.textContent = track.artist;
  text.append(title, artist); details.append(icon, text);
  const format = document.createElement('span'); format.className = 'track-format'; format.textContent = track.format;
  const duration = document.createElement('span'); duration.className = 'track-time'; duration.textContent = track.duration ? formatTime(track.duration) : '—:—';
  const remove = document.createElement('button'); remove.className = 'remove-track'; remove.setAttribute('aria-label', `Remove ${track.title}`);
  remove.innerHTML = '<svg><use href="#i-close"></use></svg>';
  remove.addEventListener('click', event => { event.stopPropagation(); dispatch('remove-track', index); });
  row.append(number, details, format, duration, remove);
  row.addEventListener('click', () => dispatch('select-track', index));
  row.addEventListener('keydown', event => { if (event.key === 'Enter') dispatch('select-track', index); });
  row.addEventListener('contextmenu', event => { event.preventDefault(); dispatch('reveal-file', index); });
  return row;
}
function renderPlaylist() {
  const query = $('search').value.trim().toLowerCase();
  const list = $('track-list');
  const scrollTop = list.scrollTop;
  const revealCurrent = state.current !== lastPlaylistCurrent || query !== lastPlaylistQuery;
  lastPlaylistCurrent = state.current;
  lastPlaylistQuery = query;
  let currentRow = null;
  list.replaceChildren();
  state.tracks.forEach((track, index) => {
    if (query && !`${track.title} ${track.artist} ${track.format}`.toLowerCase().includes(query)) return;
    const row = createTrackRow(track, index);
    if (index === state.current) currentRow = row;
    list.append(row);
  });
  list.scrollTop = scrollTop;
  if (revealCurrent && currentRow) requestAnimationFrame(() => {
    if (currentRow.isConnected) currentRow.scrollIntoView({ block: 'nearest' });
  });
  const empty = state.tracks.length === 0;
  list.hidden = empty;
  $('empty-state').hidden = !empty;
  $('library-count').textContent = `${state.tracks.length} ${state.tracks.length === 1 ? 'TRACK' : 'TRACKS'}`;
  $('playlist-status').textContent = state.playing ? 'PLAYING' : 'READY';
  $('clear-library').hidden = empty;
}
function bindPlaylist() {
  $('add-files').addEventListener('click', () => dispatch('add-files'));
  $('empty-add-files').addEventListener('click', () => dispatch('add-files'));
  $('add-folder').addEventListener('click', () => dispatch('add-folder'));
  $('empty-add-folder').addEventListener('click', () => dispatch('add-folder'));
  $('clear-library').addEventListener('click', () => dispatch('clear-library'));
  $('search').addEventListener('input', renderPlaylist);
}

function bindCommon() {
  document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => dispatch('window', { kind, command: button.dataset.action })));
  document.addEventListener('keydown', event => {
    const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && kind === 'playlist') { event.preventDefault(); $('search').focus(); return; }
    if (typing) return;
    if (event.code === 'Space') { event.preventDefault(); dispatch('play-toggle'); }
    if (event.code === 'ArrowUp') { event.preventDefault(); dispatch('previous'); }
    if (event.code === 'ArrowDown') { event.preventDefault(); dispatch('next'); }
    if (event.code === 'ArrowLeft') { event.preventDefault(); dispatch('seek', Math.max(0, (state?.time || 0) - 5)); }
    if (event.code === 'ArrowRight') { event.preventDefault(); dispatch('seek', Math.min(state?.duration || 0, (state?.time || 0) + 5)); }
  });
  let dragDepth = 0;
  document.addEventListener('dragenter', event => { event.preventDefault(); dragDepth++; $('drop-overlay').classList.add('visible'); });
  document.addEventListener('dragover', event => event.preventDefault());
  document.addEventListener('dragleave', event => { event.preventDefault(); dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('drop-overlay').classList.remove('visible'); });
  document.addEventListener('drop', async event => {
    event.preventDefault(); dragDepth = 0; $('drop-overlay').classList.remove('visible');
    const paths = [...event.dataTransfer.files].map(file => api.pathForFile(file)).filter(Boolean);
    await dispatch('import-paths', paths);
  });
}

function receive(next) {
  state = next;
  if (kind === 'player') renderPlayer();
  if (kind === 'equalizer') renderEq();
  if (kind === 'playlist') renderPlaylist();
}
async function init() {
  bindCommon();
  if (kind === 'player') bindPlayer();
  if (kind === 'equalizer') bindEq();
  if (kind === 'playlist') bindPlaylist();
  api.onState(receive);
  receive(await api.getState());
}
init();
