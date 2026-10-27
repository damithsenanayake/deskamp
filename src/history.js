const HISTORY_LIMIT = 500;

function pushHistory(history, current, next) {
  if (current < 0 || current === next) return history;
  return [...history, current].slice(-HISTORY_LIMIT);
}

function previousIndex(history, current, length, shuffle) {
  if (!length) return { index: -1, history };
  if (shuffle) {
    const rest = [...history];
    while (rest.length) {
      const index = rest.pop();
      if (index !== current && index >= 0 && index < length) return { index, history: rest };
    }
    history = rest;
  }
  return { index: (current - 1 + length) % length, history };
}

function removeFromHistory(history, removed) {
  return history.filter(index => index !== removed).map(index => index > removed ? index - 1 : index);
}

module.exports = { HISTORY_LIMIT, pushHistory, previousIndex, removeFromHistory };
