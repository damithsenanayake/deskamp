const GAP = 2;
const ATTACHED_TOLERANCE = 4;
const SNAP_HORIZONTAL_DISTANCE = 42;
const SNAP_VERTICAL_DISTANCE = 18;

function followersBelow(bounds, root, visible = new Set(bounds.keys())) {
  const followers = [];
  const visited = new Set([root]);
  const queue = [root];
  while (queue.length) {
    const parent = bounds.get(queue.shift());
    if (!parent) continue;
    for (const [kind, child] of bounds) {
      if (visited.has(kind) || !visible.has(kind)) continue;
      const aligned = Math.abs(child.x - parent.x) <= ATTACHED_TOLERANCE;
      const docked = Math.abs(child.y - (parent.y + parent.height + GAP)) <= ATTACHED_TOLERANCE;
      if (aligned && docked) {
        visited.add(kind);
        followers.push(kind);
        queue.push(kind);
      }
    }
  }
  return followers;
}

function findVerticalSnap(bounds, root, visible = new Set(bounds.keys()), excluded = new Set()) {
  const moving = bounds.get(root);
  if (!moving) return null;
  let best = null;
  for (const [kind, target] of bounds) {
    if (kind === root || !visible.has(kind) || excluded.has(kind)) continue;
    const horizontalGap = Math.abs(moving.x - target.x);
    if (horizontalGap > SNAP_HORIZONTAL_DISTANCE) continue;
    for (const y of [target.y + target.height + GAP, target.y - moving.height - GAP]) {
      const verticalGap = Math.abs(moving.y - y);
      if (verticalGap > SNAP_VERTICAL_DISTANCE) continue;
      const score = horizontalGap + verticalGap;
      if (!best || score < best.score) best = { x: target.x, y, target: kind, score };
    }
  }
  return best;
}

module.exports = { GAP, followersBelow, findVerticalSnap };
