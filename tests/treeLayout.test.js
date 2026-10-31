import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutTree, treeConnections, CARD_WIDTH, CARD_HEIGHT, normalizeMembers } from '../src/treeLayout.js';

function check(members) {
  const result = layoutTree(members);
  assert.equal(result.length, members.length);
  result.forEach((a, i) => {
    assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y));
    result.slice(i + 1).forEach(b => assert.ok(
      Math.abs(a.x - b.x) >= CARD_WIDTH || Math.abs(a.y - b.y) >= CARD_HEIGHT,
      `Cards ${a.id} and ${b.id} overlap`,
    ));
    (a.spouseIds || []).forEach(id => {
      const spouse = result.find(b => b.id === id);
      assert.equal(a.y, spouse.y);
      assert.ok(spouse.spouseIds.includes(a.id));
      if (a.spouseIds.length === 1 && spouse.spouseIds.length === 1) {
        assert.equal(Math.abs(a.x - spouse.x), 248);
      }
    });
  });
  assert.deepEqual(layoutTree(result), result);
  return result;
}

test('large families keep spouses adjacent and cards separate across generations', () => {
  const members = [{ id: 'a', spouseId: 'b' }, { id: 'b', spouseId: 'a' }];
  for (let i = 0; i < 12; i++) {
    members.push({ id: `c${i}`, fatherId: 'a', motherId: 'b', spouseId: `s${i}` });
    members.push({ id: `s${i}`, spouseId: `c${i}` });
    for (let j = 0; j < 4; j++) members.push({ id: `g${i}-${j}`, fatherId: `c${i}`, motherId: `s${i}` });
  }
  const result = check(members);
  const connections = treeConnections(result);
  assert.equal(connections.couples.length, 13);
  assert.equal(connections.branches.length, 13);
});

test('single parents, disconnected relatives and one-sided spouses', () => {
  check([{ id: 'child', motherId: 'mother' }, { id: 'mother' }, { id: 'x', spouseId: 'y' }, { id: 'y' }, { id: 'alone' }]);
});

test('both sides of a couple have ancestors and co-parents stay together', () => {
  check([{ id: 'a', fatherId: 'af', motherId: 'am', spouseId: 'b' }, { id: 'b', fatherId: 'bf', motherId: 'bm', spouseId: 'a' }, { id: 'af' }, { id: 'am' }, { id: 'bf' }, { id: 'bm' }, { id: 'c', fatherId: 'a', motherId: 'b' }]);
});

test('missing references, empty trees and cyclic imports terminate', () => {
  check([]);
  check([{ id: 'a', fatherId: 'b' }, { id: 'b', fatherId: 'a' }, { id: 'c', fatherId: 'missing' }]);
});


test('legacy spouse links migrate without losing existing relationships', () => {
  const result = normalizeMembers([
    { id: 'a', spouseId: 'b', spouseIds: ['c', 'c', 'a', 'missing'] },
    { id: 'b' }, { id: 'c' },
  ]);
  assert.deepEqual(result[0].spouseIds, ['c', 'b']);
  assert.deepEqual(result[1].spouseIds, ['a']);
  assert.deepEqual(result[2].spouseIds, ['a']);
  assert.equal('spouseId' in result[0], false);
  assert.deepEqual(normalizeMembers(JSON.parse(JSON.stringify(result))), result);
});

test('multiple spouses stay grouped with distinct connections and child families', () => {
  const result = check([
    { id: 'a', spouseIds: ['b', 'c', 'd'] },
    { id: 'b' }, { id: 'c' }, { id: 'd' },
    { id: 'ab', fatherId: 'a', motherId: 'b' },
    { id: 'ac', fatherId: 'a', motherId: 'c' },
    { id: 'ad', fatherId: 'a', motherId: 'd' },
    { id: 'a-only', fatherId: 'a' },
  ]);
  const { couples, branches } = treeConnections(result);
  assert.equal(couples.length, 3);
  assert.deepEqual(branches.map(b => b.key).sort(), ['a', 'a|b', 'a|c', 'a|d']);
  const routed = couples.filter(c => c.y < result[0].y);
  assert.equal(routed.length, 2);
  assert.notEqual(routed[0].y, routed[1].y);
  const removed = layoutTree(result.filter(m => m.id !== 'c'));
  assert.deepEqual(removed.find(m => m.id === 'a').spouseIds, ['b', 'd']);
});
