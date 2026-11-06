'use strict';
// node --test test/  (GF_FORGE_SERVER=<path to a gacha-forge-1.27.x server.mjs> also checks the real file)
process.env.GF_OUTFIT_PIN_HOOK_TEST = '1';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const { applyEdits, PICK } = require('../gf-outfit-pin-runtime.cjs');

// The game's picker, same contract as Vp: least-offered first, then unitId; `count` items.
const vp = (offered) => (cands, n) => cands
  .map((c) => ({ unitId: c.unitId, name: c.name, seen: offered[c.unitId] || 0 }))
  .sort((a, b) => a.seen - b.seen || (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0))
  .slice(0, Math.max(0, n));

function makePick(pins) {
  const ctx = { gopGet: () => pins };
  vm.createContext(ctx);
  vm.runInContext(PICK, ctx);
  return ctx.gopPick;
}
// Arrays made inside the vm context have its own Array prototype; copy into this realm before comparing.
const ids = (a) => Array.from(a, (x) => x.unitId);
const roster = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ unitId: id, name: id.toUpperCase() }));

test('no pins: the game picker unchanged', () => {
  assert.deepStrictEqual(ids(makePick([])('r', roster, 3, vp({ a: 2 }))), ['b', 'c', 'd']);
});

test('3 slots, A pinned: A first, then 2 others at random', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const got = ids(makePick(['a'])('r', roster, 3, vp({})));
    assert.strictEqual(got.length, 3);
    assert.strictEqual(got[0], 'a');
    assert.strictEqual(new Set(got).size, 3);
    got.slice(1).forEach((x) => seen.add(x));
  }
  assert.deepStrictEqual([...seen].sort(), ['b', 'c', 'd', 'e', 'f'], 'every other unit can be drawn');
});

test('more pins than slots: pinned only, least offered first', () => {
  assert.deepStrictEqual(ids(makePick(['a', 'b', 'c', 'd'])('r', roster, 2, vp({ a: 3, b: 1, c: 0, d: 2 }))), ['c', 'b']);
});

test('pins already in the rotation are not offered again', () => {
  const remaining = roster.filter((c) => c.unitId !== 'a');
  const got = ids(makePick(['a', 'b'])('r', remaining, 2, vp({})));
  assert.strictEqual(got[0], 'b');
  assert.notStrictEqual(got[1], 'a');
});

test('pins missing from the roster: the slots go to random others', () => {
  assert.strictEqual(ids(makePick(['zz'])('r', roster, 2, vp({}))).length, 2);
});

test('zero slots: nothing', () => {
  assert.deepStrictEqual(ids(makePick(['a'])('r', roster, 0, vp({}))), []);
});

const real = process.env.GF_FORGE_SERVER;
test('applies to the real 1.27 server.mjs and the result parses', { skip: !real }, () => {
  const out = applyEdits(fs.readFileSync(real, 'utf8'));
  assert.ok(out.ok, out.error);
  const tmp = require('node:path').join(require('node:os').tmpdir(), 'gop-check-' + process.pid + '.mjs');
  fs.writeFileSync(tmp, out.source);
  try {
    const r = require('node:child_process').spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr);
  } finally { fs.unlinkSync(tmp); }
  assert.strictEqual(applyEdits(out.source).error, 'already applied');
});
