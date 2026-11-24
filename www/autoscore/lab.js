/* Auto-scoring lab: camera, calibration, live detection and data collection.
   A developer page, reachable from Settings only in test builds. Nothing here touches matches or statistics. */
(function () {
  'use strict';
  const B = Autoscore.board, HG = Autoscore.homography, D = Autoscore.detector;

  const qs = new URLSearchParams(location.search);
  const LANG = (qs.get('lang') || navigator.language || 'en').toLowerCase().startsWith('it') ? 'it' : 'en';
  const S = {
    it: {
      title: 'Autoscoring · laboratorio', back: 'Torna a Darts',
      intro: 'Prova del riconoscimento automatico con la fotocamera. Le partite e le statistiche non vengono toccate.',
      tips: ['Telefono fermo su un supporto, a lato o sotto il bersaglio, a 40–60 cm.', 'Tutto il bersaglio deve essere nell’inquadratura.', 'Luce uniforme: evita una sola lampada dall’alto, fa ombre lunghe.'],
      start: 'Avvia fotocamera', noCam: 'Fotocamera non disponibile su questo dispositivo.', camErr: e => `Fotocamera non avviata (${e}).`,
      camera: 'Fotocamera',
      calTitle: 'Calibrazione', calN: n => `Punto ${n} di 5`,
      cal: ['Tocca il centro del bull.', 'Tocca il filo esterno del doppio 20, a metà del settore.', 'Tocca il filo esterno del doppio 6, a metà del settore.', 'Tocca il filo esterno del doppio 3, a metà del settore.', 'Tocca il filo esterno del doppio 11, a metà del settore.'],
      calDrag: 'Puoi trascinare i punti per correggerli: la lente in alto ti aiuta a essere preciso.',
      calCheck: 'Controlla che i fili disegnati coincidano con quelli del bersaglio.', calErr: v => `Scarto della calibrazione: ${v} mm`, calBad: 'Punti non validi: rifai la calibrazione.',
      undoPt: 'Annulla punto', redo: 'Rifai', confirm: 'Conferma',
      emptyTitle: 'Bersaglio vuoto', emptyTxt: 'Togli tutte le freccette, non muovere il telefono e tocca “Bersaglio vuoto”.', empty: 'Bersaglio vuoto', recal: 'Ricalibra',
      ready: 'Pronto: tira', motion: 'Movimento…', dartN: n => `Freccetta ${n}`, pull: 'Togli le freccette', takeout: 'Freccette tolte: tocca al prossimo',
      changed: 'Cambiamento grande: se hai mosso il telefono o cambiato la luce, tocca “Bersaglio vuoto”.',
      none: '—', fixHint: 'Tocca l’immagine per spostare la freccetta selezionata.', addHint: 'Freccetta non vista? Tocca il punto sull’immagine per aggiungerla.',
      newVisit: 'Nuovo turno', diff: 'Mostra differenze', save: n => `Salva esempi (${n})`,
      saveTxt: 'Con “Salva esempi” ogni freccetta viene salvata (foto + posizione) in Documenti/DartsLab: servirà per addestrare il riconoscimento.',
      saveErr: e => `Salvataggio non riuscito: ${e}`,
      settings: 'Regolazioni', sens: 'Sensibilità', settle: 'Attesa prima di leggere', camPos: 'Posizione della fotocamera',
      pos: { bottom: 'Sotto il bersaglio', top: 'Sopra il bersaglio', left: 'A sinistra', right: 'A destra', centroid: 'Di fronte' },
      lock: 'Blocca esposizione e messa a fuoco', locked: 'Esposizione bloccata', lockNA: 'Questa fotocamera non permette di bloccare l’esposizione.',
      info: (w, h, ms) => `${w}×${h} · elaborazione ${ms} ms`
    },
    en: {
      title: 'Auto-scoring · lab', back: 'Back to Darts',
      intro: 'A trial of automatic scoring with the camera. Matches and statistics are not touched.',
      tips: ['Phone on a stand, beside or below the board, 40–60 cm away.', 'The whole board must be in the picture.', 'Even light: a single lamp above the board casts long shadows.'],
      start: 'Start camera', noCam: 'No camera available on this device.', camErr: e => `The camera did not start (${e}).`,
      camera: 'Camera',
      calTitle: 'Calibration', calN: n => `Point ${n} of 5`,
      cal: ['Tap the centre of the bull.', 'Tap the outer double wire of 20, in the middle of the segment.', 'Tap the outer double wire of 6, in the middle of the segment.', 'Tap the outer double wire of 3, in the middle of the segment.', 'Tap the outer double wire of 11, in the middle of the segment.'],
      calDrag: 'Drag the points to adjust them: the magnifier at the top helps you be precise.',
      calCheck: 'Check that the drawn wires sit on the board’s wires.', calErr: v => `Calibration error: ${v} mm`, calBad: 'These points don’t work: calibrate again.',
      undoPt: 'Undo point', redo: 'Start over', confirm: 'Confirm',
      emptyTitle: 'Empty board', emptyTxt: 'Pull all the darts, keep the phone still and tap “Empty board”.', empty: 'Empty board', recal: 'Calibrate again',
      ready: 'Ready: throw', motion: 'Movement…', dartN: n => `Dart ${n}`, pull: 'Pull the darts', takeout: 'Darts pulled: next player',
      changed: 'Large change: if you moved the phone or the light changed, tap “Empty board”.',
      none: '—', fixHint: 'Tap the picture to move the selected dart.', addHint: 'Dart not seen? Tap its spot on the picture to add it.',
      newVisit: 'New visit', diff: 'Show changes', save: n => `Save samples (${n})`,
      saveTxt: 'With “Save samples” every dart is saved (photo + position) in Documents/DartsLab, to train the recognition later.',
      saveErr: e => `Saving failed: ${e}`,
      settings: 'Adjustments', sens: 'Sensitivity', settle: 'Wait before reading', camPos: 'Camera position',
      pos: { bottom: 'Below the board', top: 'Above the board', left: 'On the left', right: 'On the right', centroid: 'In front' },
      lock: 'Lock exposure and focus', locked: 'Exposure locked', lockNA: 'This camera can’t lock its exposure.',
      info: (w, h, ms) => `${w}×${h} · processing ${ms} ms`
    }
  };
  const t = (k, ...a) => { const v = S[LANG][k] !== undefined ? S[LANG][k] : S.en[k]; return typeof v === 'function' ? v(...a) : v; };
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  document.documentElement.lang = LANG;
  document.title = 'Darts – ' + t('title');
  $('title').textContent = t('title');
  $('back').setAttribute('aria-label', t('back'));

  const video = $('video'), ov = $('ov'), stage = $('stage'), panel = $('panel');
  const octx = ov.getContext('2d');
  const proc = document.createElement('canvas'), pctx = proc.getContext('2d', { willReadFrequently: true });
  const dbg = document.createElement('canvas'), dctx = dbg.getContext('2d');

  let stream = null, track = null, devices = [], deviceId = LS.get('as.device', '');
  let VW = 0, VH = 0, PW = 0, PH = 0, k = 1, dpr = 1;
  let state = 'start', cal = [], H = null, Hinv = null, wires = null, calRms = 0;
  let detector = null, gray = null, timer = 0, procMs = 0;
  let visit = [], sel = -1, status = '', showDiff = false, saving = LS.get('as.save', false), saved = 0, openSettings = false;
  let drag = -1, loupe = null;
  const opts = Object.assign({}, D.DEFAULTS, LS.get('as.opts', {}));

  /* ---------- camera ---------- */
  function stopCamera() {
    clearTimeout(timer);
    if (stream) stream.getTracks().forEach(tr => tr.stop());
    stream = null; track = null;
  }
  async function startCamera() {
    stopCamera();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { status = t('noCam'); render(); return; }
    const size = { width: { ideal: 1280 }, height: { ideal: 720 } };
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: deviceId ? Object.assign({ deviceId: { exact: deviceId } }, size) : Object.assign({ facingMode: { ideal: 'environment' } }, size) });
    } catch (e) {
      if (deviceId) { deviceId = ''; LS.set('as.device', ''); return startCamera(); }
      status = t('camErr', e.name || e.message); render(); return;
    }
    track = stream.getVideoTracks()[0];
    video.srcObject = stream;
    await new Promise(r => { if (video.videoWidth) r(); else video.onloadedmetadata = () => r(); });
    await video.play().catch(() => {});
    VW = video.videoWidth; VH = video.videoHeight;
    PW = Math.min(480, VW); PH = Math.round(VH * PW / VW);
    proc.width = dbg.width = PW; proc.height = dbg.height = PH;
    stage.classList.remove('empty');
    layout();
    try { devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput'); } catch (e) { devices = []; }
    const keep = LS.get('as.cal', null);
    if (keep && keep.w === VW && keep.h === VH && keep.pts && keep.pts.length === 5) { cal = keep.pts; if (computeH()) state = 'empty'; else { cal = []; state = 'calib'; } }
    else { cal = []; H = null; state = 'calib'; }
    status = '';
    awake();
    loop();
    render();
  }
  function awake() {
    try { const K = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.KeepAwake; if (K) K.keepAwake(); } catch (e) { /* optional */ }
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {}); } catch (e) { /* optional */ }
  }
  async function lockExposure() {
    if (!track || !track.getCapabilities) { status = t('lockNA'); render(); return; }
    const c = track.getCapabilities(), s = track.getSettings(), adv = {};
    if ((c.exposureMode || []).includes('manual') && s.exposureTime) { adv.exposureMode = 'manual'; adv.exposureTime = s.exposureTime; }
    if ((c.whiteBalanceMode || []).includes('manual') && s.colorTemperature) { adv.whiteBalanceMode = 'manual'; adv.colorTemperature = s.colorTemperature; }
    if ((c.focusMode || []).includes('manual') && s.focusDistance != null) { adv.focusMode = 'manual'; adv.focusDistance = s.focusDistance; }
    if (!Object.keys(adv).length) { status = t('lockNA'); render(); return; }
    try { await track.applyConstraints({ advanced: [adv] }); status = t('locked'); } catch (e) { status = t('lockNA'); }
    render();
  }

  function layout() {
    if (!VW) return;
    const par = stage.parentElement, cs = getComputedStyle(par);
    const maxW = par.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), maxH = Math.max(220, innerHeight * 0.56);
    let w = maxW, h = w * VH / VW;
    if (h > maxH) { h = maxH; w = h * VW / VH; }
    k = w / VW; dpr = window.devicePixelRatio || 1;
    [stage, video, ov].forEach(el => { el.style.width = w + 'px'; el.style.height = h + 'px'; });
    ov.width = Math.round(w * dpr); ov.height = Math.round(h * dpr);
  }
  addEventListener('resize', layout);

  /* ---------- calibration ---------- */
  function computeH() {
    const brd = B.CAL_POINTS.map(p => [p.x, p.y]);
    H = HG.fromPoints(cal, brd); Hinv = H && HG.invert(H);
    if (!H || !Hinv) { H = Hinv = null; wires = null; return false; }
    calRms = HG.rms(H, cal, brd);
    const toImg = p => HG.apply(Hinv, p[0], p[1]);
    const wp = B.wirePaths(96);
    wires = { circles: wp.circles.map(c => c.map(toImg)), spokes: wp.spokes.map(s => s.map(toImg)) };
    const poly = [];
    for (let i = 0; i < 72; i++) { const a = i / 72 * Math.PI * 2, q = toImg([186 * Math.cos(a), 186 * Math.sin(a)]); poly.push([q[0] * PW / VW, q[1] * PW / VW]); }
    detector = D.createDetector(PW, PH, Object.assign(opts, { channels: 3 }));
    detector.setMask(D.maskFromPolygon(poly, PW, PH));
    return true;
  }

  /* ---------- detection ---------- */
  function grab(out) { pctx.drawImage(video, 0, 0, PW, PH); return D.toRGB(pctx.getImageData(0, 0, PW, PH).data, out); }
  function loop() {
    clearTimeout(timer);
    const tick = () => {
      if (!stream) return;
      if (video.readyState >= 2) {
        if (state === 'play' && detector && detector.hasBaseline) {
          const t0 = performance.now();
          gray = grab(gray);
          const ev = detector.push(gray);
          procMs = Math.round(performance.now() - t0);
          if (ev) onEvent(ev);
        }
        draw();
      }
      timer = setTimeout(tick, 80);
    };
    tick();
  }
  async function captureEmpty() {
    if (!detector) return;
    const acc = new Float32Array(PW * PH * 3);
    for (let i = 0; i < 6; i++) { const g = grab(); for (let j = 0; j < acc.length; j++) acc[j] += g[j]; await sleep(90); }
    detector.setBaseline(Uint8Array.from(acc, v => Math.round(v / 6)));
    visit = []; sel = -1; state = 'play'; status = t('ready');
    render();
  }
  function onEvent(ev) {
    if (ev.type === 'motion') status = t('motion');
    else if (ev.type === 'takeout') { visit = []; sel = -1; status = t('takeout'); }
    else if (ev.type === 'changed') status = t('changed');
    else if (ev.type === 'dart') {
      [ev].concat(ev.more || []).forEach(d => addDart(d.x * VW / PW, d.y * VW / PW, d));
      status = visit.length >= 3 ? t('pull') : t('dartN', visit.length);
    }
    render();
  }
  function scoreDart(d) {
    const b = HG.apply(H, d.ix, d.iy);
    d.bx = b[0]; d.by = b[1]; d.s = B.scoreAt(b[0], b[1]); d.unsure = B.wireDistance(b[0], b[1]) < 2.5;
  }
  function addDart(ix, iy, meta, missed) {
    if (visit.length >= 3 || !H) return;
    const d = { ix, iy, area: meta && meta.area, elong: meta && meta.elong && +meta.elong.toFixed(2), t: Date.now(), missed: !!missed, corrected: false, file: null };
    scoreDart(d);
    visit.push(d); sel = visit.length - 1;
    if (saving) saveSample(d);
  }
  function moveDart(i, ix, iy) {
    const d = visit[i]; if (!d) return;
    d.ix = ix; d.iy = iy; d.corrected = true; scoreDart(d);
    if (saving) visit.slice(i).forEach(x => { if (x.file) writeLabel(x); });
  }

  /* ---------- data collection ---------- */
  function labelOf(d) {
    const i = visit.indexOf(d);
    return {
      version: 1, image: d.file + '.jpg', width: VW, height: VH,
      tip: [+d.ix.toFixed(1), +d.iy.toFixed(1)], board_mm: [+d.bx.toFixed(1), +d.by.toFixed(1)], score: d.s.label,
      all_tips: visit.slice(0, i + 1).map(x => [+x.ix.toFixed(1), +x.iy.toFixed(1)]),
      corrected: d.corrected, missed: d.missed, dart_in_visit: i + 1,
      calibration: { image_points: cal, board_points: B.CAL_POINTS.map(p => [p.x, p.y]), rms_mm: +calRms.toFixed(2) },
      detector: { area: d.area, elong: d.elong, threshold: opts.threshold, tipMethod: opts.tipMethod, tipSide: opts.tipSide },
      time: new Date(d.t).toISOString()
    };
  }
  async function writeFile(path, data, isB64) {
    const C = window.Capacitor, FS = C && C.Plugins && C.Plugins.Filesystem;
    if (FS && C.isNativePlatform && C.isNativePlatform()) {
      try {
        await FS.writeFile(Object.assign({ path: 'DartsLab/' + path, data, directory: 'DOCUMENTS', recursive: true }, isB64 ? {} : { encoding: 'utf8' }));
        return true;
      } catch (e) { status = t('saveErr', e.message || e); render(); return false; }
    }
    const a = document.createElement('a');
    a.href = isB64 ? 'data:image/jpeg;base64,' + data : URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = path; document.body.appendChild(a); a.click(); a.remove();
    return true;
  }
  function writeLabel(d) { return writeFile(d.file + '.json', JSON.stringify(labelOf(d), null, 1), false); }
  async function saveSample(d) {
    d.file = 'dart-' + new Date(d.t).toISOString().replace(/[:.]/g, '-');
    const c = document.createElement('canvas'); c.width = VW; c.height = VH;
    c.getContext('2d').drawImage(video, 0, 0, VW, VH);
    const jpg = c.toDataURL('image/jpeg', 0.92).split(',')[1];
    if (await writeFile(d.file + '.jpg', jpg, true) && await writeLabel(d)) { saved++; render(); }
  }

  /* ---------- drawing ---------- */
  function draw() {
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, ov.width, ov.height);
    octx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);   // video pixels from here on
    const px = 1 / k;
    if (showDiff && detector && state === 'play') {
      const m = detector.debugMask(), img = dctx.createImageData(PW, PH);
      for (let i = 0; i < m.length; i++) if (m[i]) { img.data[i * 4] = 255; img.data[i * 4 + 1] = 70; img.data[i * 4 + 3] = 200; }
      dctx.putImageData(img, 0, 0);
      octx.drawImage(dbg, 0, 0, VW, VH);
    }
    if (wires && (state !== 'calib' || cal.length === 5)) {
      octx.strokeStyle = 'rgba(217,180,76,.85)'; octx.lineWidth = 1.4 * px;
      octx.beginPath();
      wires.circles.forEach(c => c.forEach((p, i) => i ? octx.lineTo(p[0], p[1]) : octx.moveTo(p[0], p[1])));
      wires.spokes.forEach(s => { octx.moveTo(s[0][0], s[0][1]); octx.lineTo(s[1][0], s[1][1]); });
      octx.stroke();
    }
    if (state === 'calib') cal.forEach((p, i) => marker(p[0], p[1], String(i + 1), i === drag ? '#E5493F' : '#D9B44C', px));
    if (state === 'play') visit.forEach((d, i) => marker(d.ix, d.iy, d.s.label, i === sel ? '#E5493F' : '#D9B44C', px));
    if (loupe) drawLoupe(px);
  }
  function marker(x, y, text, color, px) {
    octx.lineWidth = 2.5 * px; octx.strokeStyle = color;
    octx.beginPath(); octx.arc(x, y, 9 * px, 0, Math.PI * 2); octx.stroke();
    octx.beginPath(); octx.moveTo(x - 14 * px, y); octx.lineTo(x - 4 * px, y); octx.moveTo(x + 4 * px, y); octx.lineTo(x + 14 * px, y);
    octx.moveTo(x, y - 14 * px); octx.lineTo(x, y - 4 * px); octx.moveTo(x, y + 4 * px); octx.lineTo(x, y + 14 * px); octx.stroke();
    octx.font = `700 ${16 * px}px FrcCond, sans-serif`; octx.textBaseline = 'bottom';
    const w = octx.measureText(text).width, below = y < 36 * px, ty = below ? y + 32 * px : y - 12 * px;
    const tx = x + 12 * px + w + 10 * px > VW ? x - 22 * px - w : x + 12 * px;
    octx.fillStyle = 'rgba(15,30,23,.85)'; octx.fillRect(tx, ty - 18 * px, w + 10 * px, 20 * px);
    octx.fillStyle = color; octx.fillText(text, tx + 5 * px, ty);
  }
  function drawLoupe(px) {
    const R = 64 * px, Z = 3, src = R / Z, cx = loupe.x < VW / 2 ? VW - R - 10 * px : R + 10 * px, cy = R + 10 * px;
    octx.save();
    octx.beginPath(); octx.arc(cx, cy, R, 0, Math.PI * 2); octx.clip();
    octx.drawImage(video, loupe.x - src, loupe.y - src, src * 2, src * 2, cx - R, cy - R, R * 2, R * 2);
    octx.restore();
    octx.lineWidth = 2 * px; octx.strokeStyle = '#D9B44C';
    octx.beginPath(); octx.arc(cx, cy, R, 0, Math.PI * 2); octx.stroke();
    octx.strokeStyle = '#E5493F'; octx.lineWidth = 1.2 * px;
    octx.beginPath(); octx.moveTo(cx - 12 * px, cy); octx.lineTo(cx + 12 * px, cy); octx.moveTo(cx, cy - 12 * px); octx.lineTo(cx, cy + 12 * px); octx.stroke();
  }

  /* ---------- touch on the picture ---------- */
  function videoPoint(e) { const r = ov.getBoundingClientRect(); return [(e.clientX - r.left) / k, (e.clientY - r.top) / k]; }
  ov.addEventListener('pointerdown', e => {
    if (!VW) return;
    const [x, y] = videoPoint(e);
    if (state === 'calib') {
      let best = -1, bd = 30 / k;
      cal.forEach((p, i) => { const d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = i; } });
      if (best < 0 && cal.length < 5) { cal.push([x, y]); best = cal.length - 1; }
      if (best < 0) return;
      drag = best; loupe = { x, y }; cal[drag] = [x, y];
      ov.setPointerCapture(e.pointerId); e.preventDefault();
    } else if (state === 'play' && H) {
      if (sel >= 0 && visit[sel]) moveDart(sel, x, y);
      else addDart(x, y, null, true);
      render();
    }
  });
  ov.addEventListener('pointermove', e => {
    if (drag < 0) return;
    const [x, y] = videoPoint(e);
    cal[drag] = [x, y]; loupe = { x, y };
  });
  const endDrag = () => {
    if (drag < 0) return;
    drag = -1; loupe = null;
    if (cal.length === 5 && !computeH()) status = t('calBad'); else status = '';
    render();
  };
  ov.addEventListener('pointerup', endDrag);
  ov.addEventListener('pointercancel', endDrag);

  /* ---------- panel ---------- */
  const btn = (a, label, cls) => `<button class="btn ${cls || ''}" data-a="${a}">${esc(label)}</button>`;
  function render() {
    let h = '';
    if (state === 'start') {
      h = `<h2>${esc(t('title'))}</h2><p>${esc(t('intro'))}</p><ul>${t('tips').map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        <div class="row">${btn('start', t('start'), 'primary')}</div>`;
    } else if (state === 'calib') {
      h = `<h2>${esc(t('calTitle'))}</h2>`;
      if (cal.length < 5) h += `<p class="status">${esc(t('calN', cal.length + 1))}</p><p>${esc(t('cal')[cal.length])}</p><p class="small">${esc(t('calDrag'))}</p>`;
      else h += `<p>${esc(t('calCheck'))}</p>${H ? `<p class="small">${esc(t('calErr', calRms.toFixed(1)))}</p>` : ''}<p class="small">${esc(t('calDrag'))}</p>`;
      h += `<div class="row">${cal.length === 5 && H ? btn('calok', t('confirm'), 'primary') : ''}${cal.length ? btn('undopt', t('undoPt')) : ''}${cal.length ? btn('redo', t('redo')) : ''}</div>`;
      if (devices.length > 1) h += `<label>${esc(t('camera'))}<select data-a="device">${devices.map((d, i) => `<option value="${esc(d.deviceId)}"${d.deviceId === deviceId ? ' selected' : ''}>${esc(d.label || t('camera') + ' ' + (i + 1))}</option>`).join('')}</select></label>`;
    } else if (state === 'empty') {
      h = `<h2>${esc(t('emptyTitle'))}</h2><p>${esc(t('emptyTxt'))}</p><div class="row">${btn('empty', t('empty'), 'primary')}${btn('recal', t('recal'))}</div>`;
    } else if (state === 'play') {
      const total = visit.reduce((a, d) => a + d.s.points, 0);
      h = `<div class="visit">${[0, 1, 2].map(i => { const d = visit[i];
          return d ? `<button class="dart${i === sel ? ' sel' : ''}${d.unsure ? ' unsure' : ''}" data-a="sel" data-i="${i}">${esc(d.s.label)}${d.unsure ? '?' : ''}</button>`
                   : `<button class="dart none" disabled>${esc(t('none'))}</button>`; }).join('')}<span class="total">${total}</span></div>
        <p class="small">${esc(sel >= 0 ? t('fixHint') : t('addHint'))}</p>
        <div class="row">${btn('visit', t('newVisit'), 'primary')}${btn('empty', t('empty'))}${btn('recal', t('recal'))}</div>
        <div class="row">${btn('diff', t('diff'), showDiff ? 'on' : '')}${btn('save', t('save', saved), saving ? 'on' : '')}</div>
        <p class="small">${esc(t('saveTxt'))}</p>
        <details${openSettings ? ' open' : ''} data-a="details"><summary>${esc(t('settings'))}</summary>
          <label>${esc(t('sens'))}<input type="range" min="10" max="60" step="1" value="${70 - opts.threshold}" data-a="sens"></label>
          <label>${esc(t('settle'))}<input type="range" min="2" max="12" step="1" value="${opts.settleFrames}" data-a="settle"></label>
          <label>${esc(t('camPos'))}<select data-a="pos">${['bottom', 'top', 'left', 'right', 'centroid'].map(p => `<option value="${p}"${(opts.tipMethod === 'centroid' ? 'centroid' : opts.tipSide) === p ? ' selected' : ''}>${esc(t('pos')[p])}</option>`).join('')}</select></label>
          <div class="row" style="margin-top:10px">${btn('lock', t('lock'))}</div>
          <p class="small" style="margin-top:8px">${esc(t('info', VW, VH, procMs))}</p>
        </details>`;
    }
    if (status) h = `<p class="status">${esc(status)}</p>` + h;
    panel.innerHTML = h;
  }
  panel.addEventListener('click', e => {
    const b = e.target.closest('[data-a]'); if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT' || b.tagName === 'DETAILS') return;
    const a = b.dataset.a;
    if (a === 'start') startCamera();
    else if (a === 'undopt') { cal.pop(); H = null; wires = null; render(); }
    else if (a === 'redo' || a === 'recal') { cal = []; H = null; wires = null; state = 'calib'; status = ''; render(); }
    else if (a === 'calok') { LS.set('as.cal', { w: VW, h: VH, pts: cal }); state = 'empty'; status = ''; render(); }
    else if (a === 'empty') captureEmpty();
    else if (a === 'visit') { visit = []; sel = -1; if (detector) detector.newVisit(); status = t('ready'); render(); }
    else if (a === 'sel') { const i = +b.dataset.i; sel = sel === i ? -1 : i; render(); }
    else if (a === 'diff') { showDiff = !showDiff; render(); }
    else if (a === 'save') { saving = !saving; LS.set('as.save', saving); render(); }
    else if (a === 'lock') lockExposure();
  });
  panel.addEventListener('toggle', e => { if (e.target.tagName === 'DETAILS') openSettings = e.target.open; }, true);
  panel.addEventListener('input', e => {
    const a = e.target.dataset.a;
    if (a === 'sens') opts.threshold = 70 - +e.target.value;
    else if (a === 'settle') opts.settleFrames = +e.target.value;
    if (detector) detector.options = opts;
  });
  panel.addEventListener('change', e => {
    const a = e.target.dataset.a;
    if (a === 'pos') { const v = e.target.value; if (v === 'centroid') opts.tipMethod = 'centroid'; else { opts.tipMethod = 'axis'; opts.tipSide = v; } if (detector) detector.options = opts; }
    if (a === 'device') { deviceId = e.target.value; LS.set('as.device', deviceId); startCamera(); return; }
    LS.set('as.opts', { threshold: opts.threshold, settleFrames: opts.settleFrames, tipMethod: opts.tipMethod, tipSide: opts.tipSide });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopCamera();
    else if (state !== 'start') startCamera();
  });
  window.AutoscoreLab = { get visit() { return visit; }, get options() { return opts; } };   // for tests and debugging
  render();
})();
