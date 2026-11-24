/* Auto-scoring: dartboard geometry.
   Board coordinates are millimetres, origin at the centre of the bull, x to the right, y up, 20 at the top.
   Ring radii follow the standard steel-tip board (WDF/PDC dimensions measured to the inside of the wires). */
(function (root) {
  'use strict';

  const R = {
    bullseye: 6.35,     // inner bull (50)
    bull: 15.9,         // outer bull (25)
    trebleIn: 99,
    trebleOut: 107,
    doubleIn: 162,
    doubleOut: 170
  };
  /* clockwise from the top */
  const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

  /* Calibration targets: the bull centre and the outer double wire in the middle of four segments.
     The user taps them on the camera image in this order. */
  const CAL_POINTS = [
    { id: 'bull', x: 0, y: 0 },
    { id: 'd20', x: 0, y: R.doubleOut },
    { id: 'd6', x: R.doubleOut, y: 0 },
    { id: 'd3', x: 0, y: -R.doubleOut },
    { id: 'd11', x: -R.doubleOut, y: 0 }
  ];

  /* sector index (0 = 20) for a board point */
  function sectorIndex(x, y) {
    const deg = Math.atan2(y, x) * 180 / Math.PI;           // 90 = up
    return ((Math.round((90 - deg) / 18) % 20) + 20) % 20;  // clockwise from 20
  }

  /* Score of a board point. Returns the number n and multiplier m used by the app's dart(n, m):
     miss = (0, 1), outer bull = (25, 1), bullseye = (25, 2). */
  function scoreAt(x, y) {
    const r = Math.hypot(x, y);
    let n, m;
    if (r <= R.bullseye) { n = 25; m = 2; }
    else if (r <= R.bull) { n = 25; m = 1; }
    else if (r > R.doubleOut) { n = 0; m = 1; }
    else {
      n = ORDER[sectorIndex(x, y)];
      m = r > R.doubleIn ? 2 : (r >= R.trebleIn && r <= R.trebleOut) ? 3 : 1;
    }
    return { n, m, points: n * m, label: label(n, m), r };
  }

  function label(n, m) {
    if (n === 0) return 'Miss';
    if (n === 25) return m === 2 ? 'Bull' : '25';
    return (m === 3 ? 'T' : m === 2 ? 'D' : '') + n;
  }

  /* How far a board point is from the nearest wire, in mm: small values mean the score is uncertain. */
  function wireDistance(x, y) {
    const r = Math.hypot(x, y);
    let d = Math.min(...[R.bullseye, R.bull, R.trebleIn, R.trebleOut, R.doubleIn, R.doubleOut].map(v => Math.abs(r - v)));
    if (r > R.bull && r <= R.doubleOut) {
      const deg = Math.atan2(y, x) * 180 / Math.PI;
      const off = ((((90 - deg) % 18) + 18) % 18);          // 0..18 inside the segment, wires at 9
      const toWire = Math.abs(off - 9) * Math.PI / 180;     // angle to the nearest radial wire
      d = Math.min(d, r * Math.sin(toWire));
    }
    return d;
  }

  /* Polylines of the wires in board mm, for drawing the overlay after calibration. */
  function wirePaths(steps) {
    steps = steps || 120;
    const circles = [R.bullseye, R.bull, R.trebleIn, R.trebleOut, R.doubleIn, R.doubleOut].map(r => {
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const a = i / steps * Math.PI * 2;
        pts.push([r * Math.cos(a), r * Math.sin(a)]);
      }
      return pts;
    });
    const spokes = [];
    for (let i = 0; i < 20; i++) {
      const a = (90 - (i * 18 + 9)) * Math.PI / 180;
      spokes.push([[R.bull * Math.cos(a), R.bull * Math.sin(a)], [R.doubleOut * Math.cos(a), R.doubleOut * Math.sin(a)]]);
    }
    return { circles, spokes };
  }

  const api = { R, ORDER, CAL_POINTS, sectorIndex, scoreAt, label, wireDistance, wirePaths };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.Autoscore = root.Autoscore || {}).board = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
