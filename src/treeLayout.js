export const CARD_WIDTH = 200;
export const CARD_HEIGHT = 164;
const SPOUSE_GAP = 48;
const FAMILY_GAP = 80;

export function normalizeMembers(members) {
  const ids = new Set(members.map(m => m.id));
  const normalized = members.map(({ spouseId, spouseIds, ...member }) => ({
    ...member,
    spouseIds: [...new Set([...(Array.isArray(spouseIds) ? spouseIds : []), spouseId].filter(id => id && id !== member.id && ids.has(id)))],
  }));
  const byId = new Map(normalized.map(m => [m.id, m]));
  normalized.forEach(m => m.spouseIds.forEach(id => {
    if (!byId.get(id).spouseIds.includes(m.id)) byId.get(id).spouseIds.push(m.id);
  }));
  return normalized;
}

// Couples are one layout unit, so spacing can never split partners apart.
export function layoutTree(members) {
  members = normalizeMembers(members);
  const byId = new Map(members.map(m => [m.id, m]));
  const units = [];
  const unitOf = new Map();
  const pair = (a, b) => {
    if (!byId.has(a) || !byId.has(b) || a === b) return;
    const first = unitOf.get(a), second = unitOf.get(b);
    if (first && first === second) return;
    const unit = first || second || { ids: [], children: new Set(), parents: new Set(), level: 0 };
    if (!first && !second) units.push(unit);
    const ids = [...new Set([...(first?.ids || [a]), ...(second?.ids || [b])])];
    if (first && second) units.splice(units.indexOf(second), 1);
    unit.ids = ids;
    ids.forEach(id => unitOf.set(id, unit));
  };
  members.forEach(m => m.spouseIds.forEach(id => pair(m.id, id)));
  // Unpartnered co-parents share a layout group without inventing a marriage.
  members.forEach(m => {
    if (!byId.get(m.fatherId)?.spouseIds.length && !byId.get(m.motherId)?.spouseIds.length) pair(m.fatherId, m.motherId);
  });
  members.forEach(m => {
    if (unitOf.has(m.id)) return;
    const unit = { ids: [m.id], children: new Set(), parents: new Set(), level: 0 };
    units.push(unit);
    unitOf.set(m.id, unit);
  });
  members.forEach(m => [m.fatherId, m.motherId].forEach(id => {
    const parent = unitOf.get(id), child = unitOf.get(m.id);
    if (parent && parent !== child) { parent.children.add(child); child.parents.add(parent); }
  }));
  const pending = new Map(units.map(u => [u, u.parents.size]));
  const queue = units.filter(u => !u.parents.size);
  for (let i = 0; i < queue.length; i++) {
    const unit = queue[i];
    unit.children.forEach(child => {
      child.level = Math.max(child.level, unit.level + 1);
      pending.set(child, pending.get(child) - 1);
      if (!pending.get(child)) queue.push(child);
    });
  }
  // Visit each unit once, including disconnected or cyclic imported records.
  const ordered = [], seen = new Set();
  function visit(unit) {
    if (seen.has(unit)) return;
    seen.add(unit); ordered.push(unit); unit.children.forEach(visit);
  }
  units.filter(u => !u.parents.size).forEach(visit);
  units.forEach(visit);
  const rows = new Map();
  ordered.forEach(u => { if (!rows.has(u.level)) rows.set(u.level, []); rows.get(u.level).push(u); });
  [...rows.keys()].sort((a, b) => b - a).forEach(level => {
    let right = 0;
    rows.get(level).forEach(u => {
      u.width = u.ids.length * CARD_WIDTH + (u.ids.length - 1) * SPOUSE_GAP;
      const children = [...u.children].filter(c => c.level > level && Number.isFinite(c.x));
      const desired = children.length ? (Math.min(...children.map(c => c.x)) + Math.max(...children.map(c => c.x + c.width))) / 2 - u.width / 2 : right;
      u.x = Math.max(right, desired);
      right = u.x + u.width + FAMILY_GAP;
    });
  });
  // For ordinary descendant trees reserve the full branch width, including
  // partners, before placing anything. Narrow child branches cannot squeeze
  // neighboring couples or make their connectors cross.
  if (queue.length === units.length && units.every(u => u.parents.size <= 1)) {
    const measure = u => {
      const children = [...u.children];
      u.span = Math.max(u.width, children.reduce((sum, child) => sum + measure(child), 0) + Math.max(0, children.length - 1) * FAMILY_GAP);
      return u.span;
    };
    const place = (u, left) => {
      u.x = left + (u.span - u.width) / 2;
      const children = [...u.children];
      const total = children.reduce((sum, child) => sum + child.span, 0) + Math.max(0, children.length - 1) * FAMILY_GAP;
      let childLeft = left + (u.span - total) / 2;
      children.forEach(child => { place(child, childLeft); childLeft += child.span + FAMILY_GAP; });
    };
    let left = 0;
    units.filter(u => !u.parents.size).forEach(u => {
      measure(u); place(u, left); left += u.span + FAMILY_GAP;
    });
  }
  // Reserve enough space between rows for a separate routing lane per family.
  const rowY = new Map();
  let y = 0;
  [...rows.keys()].sort((a, b) => a - b).forEach(level => {
    rowY.set(level, y);
    y += CARD_HEIGHT + 100 + rows.get(level).reduce((count, u) => count + u.ids.length, 0) * 40;
  });
  return members.map(m => {
    const u = unitOf.get(m.id);
    return { ...m, x: u.x + u.ids.indexOf(m.id) * (CARD_WIDTH + SPOUSE_GAP), y: rowY.get(u.level) };
  });
}

export function treeConnections(members) {
  members = normalizeMembers(members);
  const byId = new Map(members.map(m => [m.id, m]));
  const couples = [], seen = new Set(), families = new Map();
  const spouseLanes = new Map();
  members.forEach(m => m.spouseIds.forEach(id => {
    const spouse = byId.get(id);
    if (!spouse) return;
    const key = [m.id, spouse.id].sort().join('|');
    if (seen.has(key)) return;
    seen.add(key);
    const [left, right] = [m, spouse].sort((a, b) => a.x - b.x);
    const adjacent = right.x - left.x === CARD_WIDTH + SPOUSE_GAP;
    const lane = spouseLanes.get(left.y) || 0;
    if (!adjacent) spouseLanes.set(left.y, lane + 1);
    const x1 = adjacent ? left.x + CARD_WIDTH : left.x + 30 + lane * 4;
    const x2 = adjacent ? right.x : right.x + CARD_WIDTH / 2;
    const y = adjacent ? left.y + CARD_HEIGHT / 2 : left.y - 28 - lane * 20;
    const d = adjacent ? `M ${x1} ${y} H ${x2}` : `M ${x1} ${left.y} V ${y} H ${x2} V ${right.y}`;
    couples.push({ key, x1, x2, y, d });
  }));
  members.forEach(child => {
    const parents = [...new Set([child.fatherId, child.motherId])].map(id => byId.get(id)).filter(Boolean).sort((a, b) => a.x - b.x);
    if (!parents.length) return;
    const key = parents.map(p => p.id).sort().join('|');
    if (!families.has(key)) families.set(key, { key, parents, children: [] });
    families.get(key).children.push(child);
  });
  const lanes = new Map();
  const branches = [...families.values()].map(({ key, parents, children }) => {
    const bottom = Math.max(...parents.map(p => p.y + CARD_HEIGHT));
    const lane = lanes.get(bottom) || 0;
    lanes.set(bottom, lane + 1);
    const busY = bottom + 36 + lane * 20;
    const points = children.map(c => c.x + CARD_WIDTH / 2);
    const adjacent = parents.length === 2 && parents[0].y === parents[1].y && parents[1].x - parents[0].x === CARD_WIDTH + SPOUSE_GAP;
    const sourceX = adjacent ? (parents[0].x + CARD_WIDTH + parents[1].x) / 2 : parents[0].x + CARD_WIDTH / 2;
    const sourceY = adjacent ? parents[0].y + CARD_HEIGHT / 2 : bottom;
    const starts = adjacent ? [[sourceX, sourceY]] : parents.map(p => [p.x + CARD_WIDTH / 2, p.y + CARD_HEIGHT]);
    const xs = [...points, ...starts.map(p => p[0])];
    const d = starts.map(([x, y]) => `M ${x} ${y} V ${busY}`).join(' ') +
      ` M ${Math.min(...xs)} ${busY} H ${Math.max(...xs)}` +
      children.map(c => ` M ${c.x + CARD_WIDTH / 2} ${busY} V ${c.y}`).join(' ');
    return { key, d };
  });
  return { couples, branches };
}
