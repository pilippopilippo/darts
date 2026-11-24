/* Auto-scoring: classic dart detector on a fixed camera (frame differencing), no dependencies.

   Frames are greyscale Uint8Arrays of a fixed size. The detector keeps
   - base: the empty board, captured by the user and slowly adapted to light changes while the board is empty;
   - ref:  the board as it was after the last accepted dart.
   A new dart is a small, elongated change against ref that stays still for a few frames.
   A large change that ends with the board looking like base again means the darts were pulled out.

   push(frame) returns null or an event:
     {type:'motion'}                     something is moving in front of the board (hand, arm, flying dart)
     {type:'dart', x, y, area, elong, n} a dart settled; (x, y) is the estimated tip in image pixels
     {type:'takeout'}                    the darts were pulled out, ready for the next visit
     {type:'changed', area}              a large change that is neither a dart nor a takeout (camera moved, lights) */
(function (root) {
  'use strict';

  const DEFAULTS = {
    threshold: 26,        // grey-level difference that counts as a change
    settleFrames: 5,      // still frames before a change is accepted
    stillFraction: 0.0015,// frame-to-frame changed pixels (fraction of the board) still counted as "not moving"
    minArea: 30,          // smallest dart blob, pixels
    maxFraction: 0.05,    // largest dart blob, fraction of the board area
    tipMethod: 'axis',    // axis | bottom | top | left | right | centroid
    tipSide: 'bottom',    // with "axis": which end of the dart is the tip (bottom when the camera is below the board)
    adapt: 0.05,          // how fast the empty board follows slow light changes
    channels: 1           // 1: grey frames (toGray), 3: RGB frames (toRGB)
  };

  function toGray(data, out) {
    const n = data.length >> 2;
    out = out || new Uint8Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) out[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
    return out;
  }

  /* RGB bytes without alpha: colour differences find a grey dart on a red or green ring, where brightness alone does not */
  function toRGB(data, out) {
    const n = data.length >> 2;
    out = out || new Uint8Array(n * 3);
    for (let i = 0, j = 0, k = 0; i < n; i++, j += 4, k += 3) { out[k] = data[j]; out[k + 1] = data[j + 1]; out[k + 2] = data[j + 2]; }
    return out;
  }

  /* Uint8Array mask (1 inside) of a polygon given as [[x, y], ...] in pixels */
  function maskFromPolygon(poly, w, h) {
    const m = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const xs = [];
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [x1, y1] = poly[i], [x2, y2] = poly[j];
        if ((y1 > y + 0.5) !== (y2 > y + 0.5)) xs.push(x1 + (y + 0.5 - y1) * (x2 - x1) / (y2 - y1));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const a = Math.max(0, Math.ceil(xs[k] - 0.5)), b = Math.min(w - 1, Math.floor(xs[k + 1] - 0.5));
        for (let x = a; x <= b; x++) m[y * w + x] = 1;
      }
    }
    return m;
  }

  function createDetector(w, h, options) {
    const o = Object.assign({}, DEFAULTS, options || {});
    const N = w * h, C = o.channels === 3 ? 3 : 1;
    let mask = new Uint8Array(N).fill(1), maskArea = N;
    let base = null, ref = null, prev = null;
    let settle = 0, handled = false, darts = 0, moving = false;
    const diff = new Uint8Array(N), clean = new Uint8Array(N), label = new Int32Array(N), queue = new Int32Array(N);

    function setMask(m) { mask = m; maskArea = 0; for (let i = 0; i < N; i++) maskArea += m[i]; }
    function setBaseline(frame) { base = new Float32Array(frame); ref = Uint8Array.from(frame); prev = Uint8Array.from(frame); darts = 0; settle = 0; handled = true; }
    /* difference of pixel i between two frames: the largest channel difference */
    const pd = C === 1 ? (a, b, i) => Math.abs(a[i] - b[i]) : (a, b, i) => {
      const j = i * 3;
      return Math.max(Math.abs(a[j] - b[j]), Math.abs(a[j + 1] - b[j + 1]), Math.abs(a[j + 2] - b[j + 2]));
    };
    function count(a, b) {
      const t = o.threshold; let c = 0;
      for (let i = 0; i < N; i++) if (mask[i] && pd(a, b, i) > t) c++;
      return c;
    }

    /* changed pixels against ref, isolated pixels removed, then connected components */
    function components(frame) {
      const t = o.threshold;
      for (let i = 0; i < N; i++) diff[i] = mask[i] && pd(frame, ref, i) > t ? 1 : 0;
      clean.fill(0);
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!diff[i]) continue;
        const nb = diff[i - 1] + diff[i + 1] + diff[i - w] + diff[i + w] + diff[i - w - 1] + diff[i - w + 1] + diff[i + w - 1] + diff[i + w + 1];
        if (nb >= 2) clean[i] = 1;
      }
      label.fill(0);
      const comps = [];
      for (let s = 0; s < N; s++) {
        if (!clean[s] || label[s]) continue;
        const id = comps.length + 1;
        let qh = 0, qt = 0; queue[qt++] = s; label[s] = id;
        const px = [];
        while (qh < qt) {
          const i = queue[qh++], x = i % w, y = (i / w) | 0;
          px.push(x, y);
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const j = ny * w + nx;
            if (clean[j] && !label[j]) { label[j] = id; queue[qt++] = j; }
          }
        }
        comps.push(px);
      }
      return comps;
    }

    /* tip of one blob; px = [x0, y0, x1, y1, ...] */
    function tip(px) {
      const n = px.length / 2;
      let mx = 0, my = 0;
      for (let k = 0; k < px.length; k += 2) { mx += px[k]; my += px[k + 1]; }
      mx /= n; my /= n;
      let sxx = 0, syy = 0, sxy = 0;
      for (let k = 0; k < px.length; k += 2) { const dx = px[k] - mx, dy = px[k + 1] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
      sxx /= n; syy /= n; sxy /= n;
      const tr = sxx + syy, det = sxx * syy - sxy * sxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
      const l1 = tr / 2 + disc, l2 = Math.max(1e-6, tr / 2 - disc);
      const elong = Math.sqrt(l1 / l2);
      const ext = (fx, fy) => {   // mean of the pixels within 1.5 px of the extreme along (fx, fy)
        let best = -Infinity;
        for (let k = 0; k < px.length; k += 2) best = Math.max(best, px[k] * fx + px[k + 1] * fy);
        let sx = 0, sy = 0, c = 0;
        for (let k = 0; k < px.length; k += 2) if (px[k] * fx + px[k + 1] * fy >= best - 1.5) { sx += px[k]; sy += px[k + 1]; c++; }
        return [sx / c, sy / c];
      };
      const dir = { bottom: [0, 1], top: [0, -1], left: [-1, 0], right: [1, 0] };
      let p;
      if (o.tipMethod === 'centroid') p = [mx, my];
      else if (o.tipMethod === 'axis') {
        let vx = l1 - syy, vy = sxy;                 // principal axis
        if (Math.abs(vx) + Math.abs(vy) < 1e-9) { vx = sxy; vy = l1 - sxx; }
        if (Math.abs(vx) + Math.abs(vy) < 1e-9) { vx = 1; vy = 0; }
        const len = Math.hypot(vx, vy); vx /= len; vy /= len;
        const d = dir[o.tipSide] || dir.bottom;
        if (vx * d[0] + vy * d[1] < 0) { vx = -vx; vy = -vy; }
        p = ext(vx, vy);
      } else p = ext.apply(null, dir[o.tipMethod] || dir.bottom);
      return { x: p[0], y: p[1], area: n, elong };
    }

    function push(frame) {
      if (!base) return null;
      const stillPx = Math.max(8, o.stillFraction * maskArea);
      const c = count(frame, prev);
      prev = Uint8Array.from(frame);
      if (c > Math.min(stillPx, o.minArea)) {   // anything changed: wait until it is still again
        settle = 0; handled = false;
        if (c > stillPx && !moving) { moving = true; return { type: 'motion' }; }
        return null;
      }
      moving = false;
      if (handled || ++settle < o.settleFrames) return null;
      handled = true;
      const maxArea = o.maxFraction * maskArea;
      const dRef = count(frame, ref);
      if (darts > 0) {
        let dBase = 0;
        for (let i = 0; i < N; i++) if (mask[i] && pd(frame, base, i) > o.threshold) dBase++;
        if (dBase < o.minArea) { darts = 0; ref = Uint8Array.from(frame); base = new Float32Array(frame); return { type: 'takeout' }; }
      }
      if (dRef < o.minArea) {
        if (darts === 0) for (let i = 0; i < base.length; i++) base[i] += (frame[i] - base[i]) * o.adapt;
        return null;
      }
      if (darts >= 3) return null;                  // visit complete: only a takeout is expected now
      if (dRef > maxArea * Math.max(1, 3 - darts)) return { type: 'changed', area: dRef };
      // a blob where the board now looks empty again is a dart pulled out, not a new one
      const restored = px => {
        let r = 0;
        for (let k = 0; k < px.length; k += 2) { const i = px[k + 1] * w + px[k]; if (pd(frame, base, i) <= o.threshold) r++; }
        return r / (px.length / 2);
      };
      const comps = components(frame).filter(p => p.length / 2 >= o.minArea && restored(p) < 0.6).sort((a, b) => b.length - a.length);
      if (!comps.length) { ref = Uint8Array.from(frame); return null; }
      const big = comps[0].length / 2;
      const found = comps.filter(p => p.length / 2 >= big * 0.3 && p.length / 2 <= maxArea).slice(0, 3 - darts).map(tip);
      if (!found.length) return { type: 'changed', area: dRef };
      ref = Uint8Array.from(frame);
      darts += found.length;
      const t0 = found[0];
      return { type: 'dart', x: t0.x, y: t0.y, area: t0.area, elong: t0.elong, n: darts, more: found.slice(1) };
    }

    return {
      push, setMask, setBaseline,
      get darts() { return darts; },
      get hasBaseline() { return !!base; },
      get options() { return o; },
      set options(v) { Object.assign(o, v); },
      newVisit() { if (ref) { darts = 0; } },
      debugMask() { return diff; }
    };
  }

  const api = { createDetector, toGray, toRGB, maskFromPolygon, DEFAULTS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.Autoscore = root.Autoscore || {}).detector = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
