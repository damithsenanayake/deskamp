const api = window.riffbox;
const audio = document.getElementById('audio');
const $ = id => document.getElementById(id);
const state = { tracks: [], current: -1, shuffle: false, repeat: 'off', volume: 80, eq: [0, 0, 0, 0, 0], eqEnabled: true, history: [], audioContext: null, analyser: null, filters: [], saveTimer: null, loadingToken: 0 };
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

function parseTrack(filePath) {
  const filename = filePath.split(/[\\/]/).pop() || 'Unknown track';
  const ext = filename.includes('.') ? filename.split('.').pop().toUpperCase() : 'AUDIO';
  const clean = filename.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
  const separator = clean.indexOf(' - ');
  return {
    path: filePath,
    title: separator > 0 ? clean.slice(separator + 3).trim() : clean,
    artist: separator > 0 ? clean.slice(0, separator).trim() : 'Unknown artist',
    format: ext,
    duration: null
  };
}

function saveSoon() {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => api.writeLibrary({
    tracks: state.tracks,
    currentPath: state.tracks[state.current]?.path || null,
    volume: state.volume,
    shuffle: state.shuffle,
    repeat: state.repeat,
    eq: state.eq,
    eqEnabled: state.eqEnabled
  }), 250);
}

function setStatus(message) { $('topbar-status').textContent = message; }
function setRangeFill(input, percent) { input.style.setProperty('--fill', `${Math.max(0, Math.min(100, percent))}%`); }

function renderCurrent() {
  const track = state.tracks[state.current];
  $('current-title').textContent = track?.title || 'Nothing on the deck';
  $('current-artist').textContent = track?.artist || 'Add a few tracks to get started';
  $('track-number').textContent = track ? `${String(state.current + 1).padStart(2, '0')} / ${String(state.tracks.length).padStart(2, '0')}` : '— / —';
  $('file-type').textContent = track?.format || 'AUDIO';
  $('bitrate').textContent = 'LOCAL FILE';
  $('deck-mode').textContent = !track ? 'STANDBY' : audio.paused ? 'READY' : 'PLAYING';
  $('spectrum-status').textContent = audio.paused ? 'NO SIGNAL' : 'LIVE SIGNAL';
  $('play').querySelector('use').setAttribute('href', audio.paused ? '#i-play' : '#i-pause');
  $('play').setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
  $('display-art').classList.toggle('spinning', Boolean(track) && !audio.paused);
  setStatus(!track ? 'READY TO PLAY' : audio.paused ? 'PAUSED' : 'NOW PLAYING');
}

function createTrackRow(track, index) {
  const row = document.createElement('div');
  row.className = `track-row${index === state.current ? ' current' : ''}`;
  row.setAttribute('role', 'listitem');
  row.tabIndex = 0;
  const number = document.createElement('span');
  number.className = 'track-index';
  number.textContent = String(index + 1).padStart(2, '0');
  const details = document.createElement('div');
  details.className = 'track-details';
  const icon = document.createElement('span');
  icon.className = 'track-icon';
  icon.textContent = index === state.current && !audio.paused ? '▮▮' : '♫';
  const text = document.createElement('span');
  text.className = 'track-text';
  const title = document.createElement('span');
  title.className = 'track-title';
  title.textContent = track.title;
  const artist = document.createElement('span');
  artist.className = 'track-artist';
  artist.textContent = track.artist;
  text.append(title, artist);
  details.append(icon, text);
  const format = document.createElement('span');
  format.className = 'track-format';
  format.textContent = track.format;
  const duration = document.createElement('span');
  duration.className = 'track-time';
  duration.textContent = track.duration ? formatTime(track.duration) : '—:—';
  const remove = document.createElement('button');
  remove.className = 'remove-track';
  remove.title = 'Remove from playlist';
  remove.setAttribute('aria-label', `Remove ${track.title}`);
  remove.innerHTML = '<svg><use href="#i-close"></use></svg>';
  remove.addEventListener('click', event => { event.stopPropagation(); removeTrack(index); });
  row.append(number, details, format, duration, remove);
  row.addEventListener('click', () => { if (index !== state.current) playIndex(index); else togglePlayback(); });
  row.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); playIndex(index); } });
  row.addEventListener('contextmenu', event => { event.preventDefault(); api.revealFile(track.path); });
  return row;
}

function renderList() {
  const query = $('search').value.trim().toLowerCase();
  const list = $('track-list');
  list.replaceChildren();
  state.tracks.forEach((track, index) => {
    if (!query || `${track.title} ${track.artist} ${track.format}`.toLowerCase().includes(query)) list.append(createTrackRow(track, index));
  });
  const empty = state.tracks.length === 0;
  $('empty-state').hidden = !empty;
  list.hidden = empty;
  $('library-count').textContent = `${state.tracks.length} ${state.tracks.length === 1 ? 'TRACK' : 'TRACKS'}`;
  $('footer-summary').textContent = `${state.tracks.length} ${state.tracks.length === 1 ? 'TRACK' : 'TRACKS'} IN QUEUE`;
  $('clear-library').hidden = empty;
  renderCurrent();
}

async function addPaths(paths) {
  const existing = new Set(state.tracks.map(track => track.path));
  let added = 0;
  for (const filePath of paths) {
    if (typeof filePath !== 'string' || existing.has(filePath)) continue;
    state.tracks.push(parseTrack(filePath));
    existing.add(filePath);
    added++;
  }
  if (added && state.current < 0) await loadIndex(0, false);
  renderList();
  saveSoon();
}

async function loadIndex(index, autoplay) {
  if (index < 0 || index >= state.tracks.length) return;
  const token = ++state.loadingToken;
  const track = state.tracks[index];
  audio.pause();
  state.current = index;
  $('elapsed').textContent = '0:00';
  $('duration').textContent = track.duration ? formatTime(track.duration) : '0:00';
  $('seek').value = 0;
  setRangeFill($('seek'), 0);
  renderCurrent();
  renderList();
  const url = await api.mediaUrl(track.path);
  if (token !== state.loadingToken) return;
  if (!url) {
    setStatus('FILE NOT FOUND');
    $('current-artist').textContent = 'File missing — remove it or add it again';
    return;
  }
  audio.src = url;
  audio.load();
  saveSoon();
  if (autoplay) play();
}

async function playIndex(index) { await loadIndex(index, true); }

function ensureAudioGraph() {
  if (state.audioContext) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    const context = new AudioContextClass();
    const source = context.createMediaElementSource(audio);
    const filters = bands.map((band, index) => {
      const filter = context.createBiquadFilter();
      filter.type = band.type;
      filter.frequency.value = band.frequency;
      filter.Q.value = 1;
      filter.gain.value = state.eqEnabled ? state.eq[index] : 0;
      return filter;
    });
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    source.connect(filters[0]);
    filters.forEach((filter, index) => filter.connect(filters[index + 1] || analyser));
    analyser.connect(context.destination);
    state.audioContext = context;
    state.analyser = analyser;
    state.filters = filters;
  } catch (error) { console.error('Audio effects unavailable:', error); }
}

async function play() {
  if (state.current < 0 && state.tracks.length) await loadIndex(0, false);
  if (state.current < 0) return;
  ensureAudioGraph();
  if (state.audioContext?.state === 'suspended') await state.audioContext.resume();
  try { await audio.play(); } catch (error) { setStatus('CANNOT PLAY FILE'); console.error(error); }
}

function togglePlayback() { if (audio.paused) play(); else audio.pause(); }

function nextIndex() {
  if (!state.tracks.length) return -1;
  if (state.shuffle && state.tracks.length > 1) {
    let index;
    do { index = Math.floor(Math.random() * state.tracks.length); } while (index === state.current);
    state.history.push(state.current);
    return index;
  }
  return (state.current + 1) % state.tracks.length;
}

function next() { const index = nextIndex(); if (index >= 0) playIndex(index); }
function previous() {
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  const index = state.shuffle && state.history.length ? state.history.pop() : (state.current - 1 + state.tracks.length) % state.tracks.length;
  if (index >= 0) playIndex(index);
}

function removeTrack(index) {
  const wasCurrent = index === state.current;
  state.tracks.splice(index, 1);
  state.history = [];
  if (wasCurrent) {
    ++state.loadingToken;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    state.current = -1;
    if (state.tracks.length) loadIndex(Math.min(index, state.tracks.length - 1), false);
  } else if (index < state.current) state.current--;
  renderList();
  saveSoon();
}

function updateEq() {
  state.filters.forEach((filter, index) => { filter.gain.value = state.eqEnabled ? state.eq[index] : 0; });
  $('eq-toggle').classList.toggle('active', state.eqEnabled);
  $('eq-toggle').setAttribute('aria-checked', String(state.eqEnabled));
  document.querySelectorAll('.eq-band').forEach((element, index) => {
    const value = state.eq[index];
    element.querySelector('input').value = value;
    element.querySelector('output').textContent = `${value > 0 ? '+' : ''}${value} dB`;
  });
  saveSoon();
}

function renderEq() {
  $('eq-bands').replaceChildren();
  bands.forEach((band, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'eq-band';
    const output = document.createElement('output');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = -12;
    input.max = 12;
    input.step = 1;
    input.setAttribute('aria-label', `${band.label} equalizer`);
    input.addEventListener('input', () => { state.eq[index] = Number(input.value); updateEq(); });
    const label = document.createElement('label');
    label.textContent = band.label;
    wrapper.append(output, input, label);
    $('eq-bands').append(wrapper);
  });
  updateEq();
}

function drawVisualizer() {
  const canvas = $('visualizer');
  const context = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const bars = 56;
  const data = state.analyser ? new Uint8Array(state.analyser.frequencyBinCount) : null;
  function frame() {
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#172620';
    for (let line = 0; line < 5; line++) context.fillRect(0, line * 21 + 9, width, 1);
    if (data && !audio.paused) state.analyser.getByteFrequencyData(data);
    for (let i = 0; i < bars; i++) {
      const sample = data && !audio.paused ? data[Math.floor(Math.pow(i / bars, 1.65) * (data.length - 1))] : 0;
      const barHeight = Math.max(3, Math.round(sample / 255 * (height - 8)));
      const x = i * width / bars + 2;
      context.fillStyle = sample > 185 ? '#f5a64f' : sample > 95 ? '#c7f36a' : '#72954b';
      context.fillRect(x, height - barHeight - 2, width / bars - 4, barHeight);
    }
    requestAnimationFrame(frame);
  }
  frame();
}

function bindEvents() {
  $('add-files').addEventListener('click', async () => addPaths(await api.pickFiles()));
  $('empty-add-files').addEventListener('click', async () => addPaths(await api.pickFiles()));
  $('add-folder').addEventListener('click', async () => addPaths(await api.pickFolder()));
  $('empty-add-folder').addEventListener('click', async () => addPaths(await api.pickFolder()));
  $('play').addEventListener('click', togglePlayback);
  $('previous').addEventListener('click', previous);
  $('next').addEventListener('click', next);
  $('shuffle').addEventListener('click', () => { state.shuffle = !state.shuffle; $('shuffle').classList.toggle('active', state.shuffle); $('shuffle').setAttribute('aria-label', `Shuffle ${state.shuffle ? 'on' : 'off'}`); saveSoon(); });
  $('repeat').addEventListener('click', () => { state.repeat = state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off'; $('repeat').classList.toggle('active', state.repeat !== 'off'); $('repeat').title = `Repeat ${state.repeat}`; $('repeat').setAttribute('aria-label', `Repeat ${state.repeat}`); $('repeat').style.color = state.repeat === 'one' ? 'var(--orange)' : ''; saveSoon(); });
  $('mute').addEventListener('click', () => { audio.muted = !audio.muted; $('mute').classList.toggle('active', audio.muted); $('mute').setAttribute('aria-label', audio.muted ? 'Unmute' : 'Mute'); });
  $('volume').addEventListener('input', event => { state.volume = Number(event.target.value); audio.volume = state.volume / 100; $('volume-value').textContent = state.volume; setRangeFill(event.target, state.volume); saveSoon(); });
  $('seek').addEventListener('input', event => { if (audio.duration) audio.currentTime = Number(event.target.value) / 1000 * audio.duration; });
  $('search').addEventListener('input', renderList);
  $('clear-library').addEventListener('click', () => { ++state.loadingToken; audio.pause(); audio.removeAttribute('src'); audio.load(); state.tracks = []; state.current = -1; state.history = []; renderList(); saveSoon(); });
  $('eq-reset').addEventListener('click', () => { state.eq = [0, 0, 0, 0, 0]; updateEq(); });
  $('eq-toggle').addEventListener('click', () => { state.eqEnabled = !state.eqEnabled; updateEq(); });
  audio.addEventListener('play', () => { renderCurrent(); renderList(); });
  audio.addEventListener('pause', () => { renderCurrent(); renderList(); });
  audio.addEventListener('loadedmetadata', () => {
    const track = state.tracks[state.current];
    if (track && Number.isFinite(audio.duration)) { track.duration = audio.duration; $('duration').textContent = formatTime(audio.duration); renderList(); saveSoon(); }
  });
  audio.addEventListener('timeupdate', () => { $('elapsed').textContent = formatTime(audio.currentTime); $('seek').value = audio.duration ? Math.round(audio.currentTime / audio.duration * 1000) : 0; setRangeFill($('seek'), Number($('seek').value) / 10); });
  audio.addEventListener('ended', () => { if (state.repeat === 'one') { audio.currentTime = 0; play(); } else if (state.repeat === 'off' && !state.shuffle && state.current === state.tracks.length - 1) { audio.currentTime = 0; renderCurrent(); } else next(); });
  audio.addEventListener('error', () => { if (audio.src) { setStatus('CANNOT PLAY FILE'); $('current-artist').textContent = 'This format may not be supported on this system'; } });
  document.addEventListener('keydown', event => {
    const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('search').focus(); return; }
    if (typing) return;
    if (event.code === 'Space') { event.preventDefault(); togglePlayback(); }
    if (event.code === 'ArrowRight') { event.preventDefault(); if (audio.duration) audio.currentTime = Math.min(audio.duration, audio.currentTime + 5); }
    if (event.code === 'ArrowLeft') { event.preventDefault(); audio.currentTime = Math.max(0, audio.currentTime - 5); }
    if (event.code === 'ArrowUp') { event.preventDefault(); previous(); }
    if (event.code === 'ArrowDown') { event.preventDefault(); next(); }
  });
  let dragDepth = 0;
  document.addEventListener('dragenter', event => { event.preventDefault(); dragDepth++; $('drop-overlay').classList.add('visible'); });
  document.addEventListener('dragover', event => event.preventDefault());
  document.addEventListener('dragleave', event => { event.preventDefault(); dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('drop-overlay').classList.remove('visible'); });
  document.addEventListener('drop', async event => {
    event.preventDefault(); dragDepth = 0; $('drop-overlay').classList.remove('visible');
    const paths = [...event.dataTransfer.files].map(file => api.pathForFile(file)).filter(Boolean);
    await addPaths(await api.filesFromDrop(paths));
  });
}

async function init() {
  bindEvents();
  const saved = await api.readLibrary();
  if (saved && Array.isArray(saved.tracks)) {
    state.tracks = saved.tracks.filter(track => track && typeof track.path === 'string' && typeof track.title === 'string');
    state.volume = Number.isFinite(saved.volume) ? Math.max(0, Math.min(100, saved.volume)) : 80;
    state.shuffle = Boolean(saved.shuffle);
    state.repeat = ['off', 'all', 'one'].includes(saved.repeat) ? saved.repeat : 'off';
    state.eq = Array.isArray(saved.eq) && saved.eq.length === 5 ? saved.eq.map(value => Math.max(-12, Math.min(12, Number(value) || 0))) : [0, 0, 0, 0, 0];
    state.eqEnabled = saved.eqEnabled !== false;
    state.current = state.tracks.findIndex(track => track.path === saved.currentPath);
  }
  audio.volume = state.volume / 100;
  $('volume').value = state.volume;
  $('volume-value').textContent = state.volume;
  setRangeFill($('volume'), state.volume);
  $('shuffle').classList.toggle('active', state.shuffle);
  $('shuffle').setAttribute('aria-label', `Shuffle ${state.shuffle ? 'on' : 'off'}`);
  $('repeat').classList.toggle('active', state.repeat !== 'off');
  $('repeat').title = `Repeat ${state.repeat}`;
  $('repeat').setAttribute('aria-label', `Repeat ${state.repeat}`);
  $('repeat').style.color = state.repeat === 'one' ? 'var(--orange)' : '';
  renderEq();
  renderList();
  drawVisualizer();
  if (state.current >= 0) await loadIndex(state.current, false);
}

init();
