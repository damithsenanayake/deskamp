const test = require('node:test');
const assert = require('node:assert/strict');
const { HISTORY_LIMIT, pushHistory, previousIndex, removeFromHistory } = require('../src/history');

test('shuffle: Previous returns to the track that played before, not index - 1', () => {
  const history = pushHistory([], 3, 7);
  assert.deepEqual(previousIndex(history, 7, 10, true), { index: 3, history: [] });
});

test('shuffle: N Next presses then N Previous presses retrace the order in reverse', () => {
  const order = [2, 8, 0, 5, 9, 4];
  let history = [];
  for (let i = 1; i < order.length; i++) history = pushHistory(history, order[i - 1], order[i]);
  let current = order[order.length - 1];
  const visited = [];
  for (let i = 1; i < order.length; i++) {
    ({ index: current, history } = previousIndex(history, current, 10, true));
    visited.push(current);
  }
  assert.deepEqual(visited, order.slice(0, -1).reverse());
  assert.deepEqual(history, []);
});

test('shuffle with an empty history falls back to index - 1', () => {
  assert.equal(previousIndex([], 0, 10, true).index, 9);
  assert.equal(previousIndex([], 4, 10, true).index, 3);
});

test('shuffle off keeps index - 1 and leaves the history alone', () => {
  assert.deepEqual(previousIndex([3], 7, 10, false), { index: 6, history: [3] });
});

test('no tracks gives no previous index', () => {
  assert.equal(previousIndex([1], 0, 0, true).index, -1);
});

test('pushHistory ignores no current track and reselecting the same track', () => {
  assert.deepEqual(pushHistory([], -1, 2), []);
  assert.deepEqual(pushHistory([1], 2, 2), [1]);
});

test('pushHistory keeps at most HISTORY_LIMIT entries', () => {
  let history = [];
  for (let i = 0; i < HISTORY_LIMIT + 10; i++) history = pushHistory(history, i % 7, (i % 7) + 1);
  assert.equal(history.length, HISTORY_LIMIT);
});

test('removing a track drops it from the history and shifts higher indices down', () => {
  assert.deepEqual(removeFromHistory([0, 4, 2, 5, 4], 4), [0, 2, 4]);
});

test('after removing a track in the history, Previous selects the right track', () => {
  // Tracks a..f; play order c(2) -> f(5) -> b(1) -> e(4). Remove f, current e moves to 3.
  let history = [2, 5, 1];
  history = removeFromHistory(history, 5);
  let current = 3;
  ({ index: current, history } = previousIndex(history, current, 5, true));
  assert.equal(current, 1);
  ({ index: current, history } = previousIndex(history, current, 5, true));
  assert.equal(current, 2);
});

test('Previous skips history entries equal to the current or out of range', () => {
  assert.deepEqual(previousIndex([1, 9, 3, 3], 3, 5, true), { index: 1, history: [] });
});
