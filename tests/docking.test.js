const test = require('node:test');
const assert = require('node:assert/strict');
const { GAP, followersBelow, findVerticalSnap } = require('../src/docking');

function stack() {
  return new Map([
    ['player', { x: 100, y: 50, width: 520, height: 232 }],
    ['equalizer', { x: 100, y: 50 + 232 + GAP, width: 520, height: 154 }],
    ['playlist', { x: 100, y: 50 + 232 + GAP + 154 + GAP, width: 520, height: 330 }]
  ]);
}

test('dragging the top window carries the whole attached stack', () => {
  const bounds = stack();
  assert.deepEqual(followersBelow(bounds, 'player'), ['equalizer', 'playlist']);
  assert.deepEqual(followersBelow(bounds, 'equalizer'), ['playlist']);
  assert.deepEqual(followersBelow(bounds, 'playlist'), []);
  const delta = { x: 31, y: -24 };
  for (const kind of ['player', ...followersBelow(bounds, 'player')]) {
    const old = bounds.get(kind);
    bounds.set(kind, { ...old, x: old.x + delta.x, y: old.y + delta.y });
  }
  assert.deepEqual(followersBelow(bounds, 'player'), ['equalizer', 'playlist']);
  assert.equal(bounds.get('playlist').x, 131);
});

test('dragging the middle window away detaches it and keeps the lower window with it', () => {
  const bounds = stack();
  for (const kind of ['equalizer', ...followersBelow(bounds, 'equalizer')]) {
    const old = bounds.get(kind);
    bounds.set(kind, { ...old, x: old.x + 80 });
  }
  assert.deepEqual(followersBelow(bounds, 'player'), []);
  assert.deepEqual(followersBelow(bounds, 'equalizer'), ['playlist']);
});

test('a detached stack snaps directly under another window', () => {
  const bounds = stack();
  bounds.set('equalizer', { ...bounds.get('equalizer'), x: 113, y: 50 + 232 + GAP + 9 });
  bounds.set('playlist', { ...bounds.get('playlist'), x: 113, y: bounds.get('playlist').y + 9 });
  const snap = findVerticalSnap(bounds, 'equalizer', new Set(bounds.keys()), new Set(['playlist']));
  assert.deepEqual({ x: snap.x, y: snap.y, target: snap.target }, { x: 100, y: 50 + 232 + GAP, target: 'player' });
});
