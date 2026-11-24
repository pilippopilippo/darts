/* Auto-scoring: plane-to-plane homography (camera image <-> board), no dependencies.
   A 3x3 matrix is stored row-major in an array of 9 numbers. */
(function (root) {
  'use strict';

  /* Hartley normalisation: move the centroid to the origin and scale the mean distance to sqrt(2) */
  function normaliser(pts) {
    let cx = 0, cy = 0;
    pts.forEach(p => { cx += p[0]; cy += p[1]; });
    cx /= pts.length; cy /= pts.length;
    let d = 0;
    pts.forEach(p => { d += Math.hypot(p[0] - cx, p[1] - cy); });
    d /= pts.length;
    const s = d > 0 ? Math.SQRT2 / d : 1;
    return [s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1];
  }

  function mul(a, b) {
    const o = new Array(9);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++)
      o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    return o;
  }

  function invert(m) {
    const [a, b, c, d, e, f, g, h, i] = m;
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C;
    if (!det || !isFinite(det)) return null;
    const inv = [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d];
    return inv.map(v => v / det);
  }

  function apply(H, x, y) {
    const w = H[6] * x + H[7] * y + H[8];
    return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
  }

  /* Solve the square system M x = v (Gaussian elimination with partial pivoting). */
  function solve(M, v) {
    const n = v.length, A = M.map((row, i) => row.concat([v[i]]));
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-12) return null;
      [A[c], A[p]] = [A[p], A[c]];
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const k = A[r][c] / A[c][c];
        for (let j = c; j <= n; j++) A[r][j] -= k * A[c][j];
      }
    }
    return A.map((row, i) => row[n] / row[i]);
  }

  /* Homography H with H * src ~ dst, from 4 or more point pairs (least squares when more than 4).
     src, dst: arrays of [x, y]. Returns null when the points are degenerate. */
  function fromPoints(src, dst) {
    if (src.length < 4 || src.length !== dst.length) return null;
    const Ts = normaliser(src), Td = normaliser(dst);
    const s = src.map(p => apply(Ts, p[0], p[1])), d = dst.map(p => apply(Td, p[0], p[1]));
    // h9 = 1: two equations per pair in 8 unknowns, solved through the normal equations
    const N = Array.from({ length: 8 }, () => new Array(8).fill(0)), b = new Array(8).fill(0);
    const add = (row, rhs) => {
      for (let i = 0; i < 8; i++) {
        b[i] += row[i] * rhs;
        for (let j = 0; j < 8; j++) N[i][j] += row[i] * row[j];
      }
    };
    for (let k = 0; k < s.length; k++) {
      const [x, y] = s[k], [u, v] = d[k];
      add([x, y, 1, 0, 0, 0, -u * x, -u * y], u);
      add([0, 0, 0, x, y, 1, -v * x, -v * y], v);
    }
    const h = solve(N, b);
    if (!h) return null;
    const Hn = h.concat([1]);
    const TdInv = invert(Td);
    if (!TdInv) return null;
    const H = mul(mul(TdInv, Hn), Ts);
    const k = H[8];
    if (!k || !isFinite(k)) return null;
    return H.map(v => v / k);
  }

  /* Root-mean-square reprojection error of H on the pairs, in dst units. */
  function rms(H, src, dst) {
    let e = 0;
    src.forEach((p, i) => { const q = apply(H, p[0], p[1]); e += (q[0] - dst[i][0]) ** 2 + (q[1] - dst[i][1]) ** 2; });
    return Math.sqrt(e / src.length);
  }

  const api = { fromPoints, apply, invert, mul, rms };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.Autoscore = root.Autoscore || {}).homography = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
