/* Unit tests for the auto-scoring modules: node --test tests/ */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const board = require('../www/autoscore/board.js');
const hg = require('../www/autoscore/homography.js');
const det = require('../www/autoscore/detector.js');

const polar = (r, deg) => [r * Math.cos(deg * Math.PI / 180), r * Math.sin(deg * Math.PI / 180)];

test('board: rings and sectors', () => {
  const at = (x, y) => board.scoreAt(x, y).label;
  assert.equal(at(0, 0), 'Bull');
  assert.equal(at(0, 10), '25');
  assert.equal(at(0, 103), 'T20');
  assert.equal(at(0, 166), 'D20');
  assert.equal(at(0, 130), '20');
  assert.equal(at(0, 50), '20');
  assert.equal(at(0, 175), 'Miss');
  assert.equal(at(166, 0), 'D6');
  assert.equal(at(0, -103), 'T3');
  assert.equal(at(-130, 0), '11');
  assert.equal(at(...polar(130, 72)), '1');     // one segment clockwise from 20
  assert.equal(at(...polar(130, 108)), '5');    // one segment anticlockwise from 20
  assert.equal(at(...polar(103, 90 - 18 * 11)), 'T19');
  assert.deepEqual([board.scoreAt(0, 3).n, board.scoreAt(0, 3).m], [25, 2]);
  assert.deepEqual([board.scoreAt(0, 200).n, board.scoreAt(0, 200).m], [0, 1]);
});

test('board: every segment centre scores its own number', () => {
  board.ORDER.forEach((n, i) => {
    const [x, y] = polar(130, 90 - i * 18);
    assert.equal(board.scoreAt(x, y).n, n);
  });
});

test('board: distance to the nearest wire', () => {
  assert.ok(board.wireDistance(0, 130) > 20);
  assert.ok(board.wireDistance(0, 107.5) < 1);
  assert.ok(board.wireDistance(...polar(130, 81.2)) < 1);    // close to the 20/1 wire at 81 degrees
});

/* a camera looking at the board from below and to the side: board mm -> image px */
const CAM = [1.1, 0.25, 640, -0.05, -0.75, 360, 0.0002, 0.0009, 1];

test('homography: recovers image -> board from the calibration taps', () => {
  const brd = board.CAL_POINTS.map(p => [p.x, p.y]);
  const img = brd.map(p => hg.apply(CAM, p[0], p[1]));
  const H = hg.fromPoints(img, brd);
  assert.ok(H);
  assert.ok(hg.rms(H, img, brd) < 1e-6);
  for (const [r, a] of [[0, 0], [103, 90], [166, 17], [60, 222], [150, 300]]) {
    const p = polar(r, a), q = hg.apply(CAM, p[0], p[1]), back = hg.apply(H, q[0], q[1]);
    assert.ok(Math.hypot(back[0] - p[0], back[1] - p[1]) < 1e-6);
  }
  const inv = hg.invert(H);
  const q = hg.apply(inv, 0, 170), e = hg.apply(CAM, 0, 170);
  assert.ok(Math.hypot(q[0] - e[0], q[1] - e[1]) < 1e-6);
});

test('homography: small tap errors give small board errors', () => {
  const brd = board.CAL_POINTS.map(p => [p.x, p.y]);
  const noise = [[1.5, -1], [-1, 2], [0.5, 1], [-2, -0.5], [1, 1]];
  const img = brd.map((p, i) => { const q = hg.apply(CAM, p[0], p[1]); return [q[0] + noise[i][0], q[1] + noise[i][1]]; });
  const H = hg.fromPoints(img, brd);
  const q = hg.apply(CAM, 0, 103), b = hg.apply(H, q[0], q[1]);
  assert.ok(Math.hypot(b[0], b[1] - 103) < 3, 'treble 20 stays within 3 mm');
});

test('homography: degenerate points are refused', () => {
  assert.equal(hg.fromPoints([[0, 0], [1, 1], [2, 2], [3, 3]], [[0, 0], [1, 0], [2, 0], [3, 0]]), null);
  assert.equal(hg.fromPoints([[0, 0], [1, 1], [2, 2]], [[0, 0], [1, 0], [2, 0]]), null);
});

/* ---------- detector on synthetic frames ---------- */
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const W = 200, H = 150;
const rand = rng(7);
const BG = Uint8Array.from({ length: W * H }, (_, i) => 90 + ((i % W) >> 3 & 1) * 60 + Math.floor(rand() * 20));
const noisy = (img, r) => Uint8Array.from(img, v => Math.max(0, Math.min(255, v + Math.round((r() - 0.5) * 8))));
function drawDart(img, x0, y0, x1, y1) {
  const out = Uint8Array.from(img), steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) * 2;
  for (let s = 0; s <= steps; s++) {
    const x = x0 + (x1 - x0) * s / steps, y = y0 + (y1 - y0) * s / steps;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) out[Math.round(y + dy) * W + Math.round(x + dx)] = 15;
  }
  return out;
}
function hand(img) { const out = Uint8Array.from(img); for (let y = 20; y < 140; y++) for (let x = 60; x < 190; x++) out[y * W + x] = 230; return out; }
function run(d, frames) { const ev = []; frames.forEach(f => { const e = d.push(f); if (e) ev.push(e); }); return ev; }
const still = (img, n, r) => Array.from({ length: n }, () => noisy(img, r));

test('detector: a settled dart is found with its tip', () => {
  const r = rng(1), d = det.createDetector(W, H, { tipMethod: 'axis', tipSide: 'bottom' });
  d.setBaseline(BG);
  const one = drawDart(BG, 100, 80, 125, 55);           // tip at the bottom end (100, 80)
  const ev = run(d, [...still(BG, 3, r), hand(BG), hand(BG), ...still(one, 8, r)]);
  const dart = ev.find(e => e.type === 'dart');
  assert.ok(dart, JSON.stringify(ev));
  assert.ok(Math.hypot(dart.x - 100, dart.y - 81) < 3, `tip ${dart.x},${dart.y}`);
  assert.ok(dart.elong > 3);
  assert.equal(d.darts, 1);
});

test('detector: second dart, no double counting, then takeout', () => {
  const r = rng(2), d = det.createDetector(W, H);
  d.setBaseline(BG);
  const one = drawDart(BG, 100, 80, 125, 55), two = drawDart(one, 50, 110, 70, 90);
  let ev = run(d, [...still(one, 8, r), ...still(one, 8, r)]);
  assert.equal(ev.filter(e => e.type === 'dart').length, 1);
  ev = run(d, [...still(two, 8, r)]);
  const second = ev.filter(e => e.type === 'dart');
  assert.equal(second.length, 1);
  assert.ok(Math.hypot(second[0].x - 50, second[0].y - 111) < 3, `tip ${second[0].x},${second[0].y}`);
  ev = run(d, [hand(two), hand(two), hand(BG), ...still(BG, 8, r)]);
  assert.ok(ev.some(e => e.type === 'takeout'), JSON.stringify(ev));
  assert.equal(d.darts, 0);
});

test('detector: pulling one dart out is not a new dart', () => {
  const r = rng(3), d = det.createDetector(W, H);
  d.setBaseline(BG);
  const one = drawDart(BG, 100, 80, 125, 55), two = drawDart(one, 50, 110, 70, 90);
  run(d, [...still(one, 8, r), ...still(two, 8, r)]);
  assert.equal(d.darts, 2);
  const ev = run(d, [hand(two), ...still(drawDart(BG, 50, 110, 70, 90), 8, r)]);
  assert.equal(ev.filter(e => e.type === 'dart').length, 0, JSON.stringify(ev));
});

test('detector: noise alone never makes a dart', () => {
  const r = rng(4), d = det.createDetector(W, H);
  d.setBaseline(BG);
  const ev = run(d, still(BG, 60, r));
  assert.equal(ev.length, 0, JSON.stringify(ev));
});

test('detector: colour frames see a grey dart on a red ring', () => {
  // red ring (200, 48, 44) and a grey dart (90, 106, 122) have almost the same brightness
  const rgb = (r, g, b) => { const f = new Uint8Array(W * H * 3); for (let i = 0; i < W * H; i++) { f[i * 3] = r; f[i * 3 + 1] = g; f[i * 3 + 2] = b; } return f; };
  const empty = rgb(200, 48, 44), withDart = Uint8Array.from(empty);
  for (let s = 0; s <= 50; s++) {
    const x = Math.round(100 + 25 * s / 50), y = Math.round(80 - 25 * s / 50);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const i = ((y + dy) * W + x + dx) * 3; withDart[i] = 90; withDart[i + 1] = 106; withDart[i + 2] = 122; }
  }
  const grey = f => Uint8Array.from({ length: W * H }, (_, i) => (f[i * 3] * 77 + f[i * 3 + 1] * 150 + f[i * 3 + 2] * 29) >> 8);
  const g = det.createDetector(W, H);
  g.setBaseline(grey(empty));
  assert.equal(run(g, Array(8).fill(grey(withDart))).filter(e => e.type === 'dart').length, 0, 'brightness alone misses it');
  const c = det.createDetector(W, H, { channels: 3 });
  c.setBaseline(empty);
  const ev = run(c, Array(8).fill(withDart)).filter(e => e.type === 'dart');
  assert.equal(ev.length, 1);
  assert.ok(Math.hypot(ev[0].x - 100, ev[0].y - 81) < 3, `tip ${ev[0].x},${ev[0].y}`);
});

test('detector: polygon mask', () => {
  const m = det.maskFromPolygon([[10, 10], [30, 10], [30, 30], [10, 30]], 40, 40);
  let n = 0; for (const v of m) n += v;
  assert.equal(n, 400);
  assert.equal(m[20 * 40 + 20], 1);
  assert.equal(m[5 * 40 + 5], 0);
});
