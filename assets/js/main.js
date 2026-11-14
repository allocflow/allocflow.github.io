/* AllocFlow project page */
(() => {
  // ---------------------------------------------------------------- links (edit here)
  const CONFIG = {
    paper: 'https://arxiv.org/abs/2611.19937',         // empty shows "soon"
    code: 'https://github.com/allocflow/AllocFlow',
  };
  document.querySelectorAll('.js-paper').forEach(a => {
    if (CONFIG.paper) { a.href = CONFIG.paper; return; }
    a.removeAttribute('href'); a.removeAttribute('target'); a.classList.add('off'); a.classList.remove('pri');
    if (!a.querySelector('.soon')) { const s = document.createElement('span'); s.className = 'soon'; s.textContent = 'soon'; a.appendChild(s); }
  });
  document.querySelectorAll('.js-code').forEach(a => { a.href = CONFIG.code; });

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const io = (cb, opts) => new IntersectionObserver(es => es.forEach(e => e.isIntersecting && cb(e.target, e)), opts);

  // ---------------------------------------------------------------- top bar + active nav
  const top = document.getElementById('top');
  const onScroll = () => top.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  const links = [...document.querySelectorAll('.nav a')];
  const secObs = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    links.forEach(l => l.classList.toggle('on', l.getAttribute('href') === '#' + e.target.id));
  }), { rootMargin: '-45% 0px -50% 0px' });
  links.forEach(l => { const s = document.querySelector(l.getAttribute('href')); if (s) secObs.observe(s); });

  // ---------------------------------------------------------------- reveal
  const rv = io(el => { el.classList.add('in'); rv.unobserve(el); }, { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.rv').forEach(el => rv.observe(el));

  // ---------------------------------------------------------------- count-up
  const fmt = (v, d, s) => v.toFixed(d) + (s || '');
  const cnt = io(el => {
    cnt.unobserve(el);
    const target = +el.dataset.count, d = +(el.dataset.dec || 0), s = el.dataset.suf || '';
    if (reduce) { el.textContent = fmt(target, d, s); return; }
    const t0 = performance.now(), dur = 1500;
    const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 4); el.textContent = fmt(target * e, d, s); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }, { threshold: .4 });
  document.querySelectorAll('[data-count]').forEach(el => cnt.observe(el));

  // ---------------------------------------------------------------- calmar bars
  const bars = document.getElementById('calmarBars');
  if (bars) {
    const fl = [...bars.querySelectorAll('.fl')], mx = Math.max(...fl.map(f => +f.dataset.v));
    io(() => fl.forEach((f, i) => setTimeout(() => { f.style.width = (+f.dataset.v / mx * 100) + '%'; }, reduce ? 0 : i * 90)), { threshold: .3 }).observe(bars);
  }

  // ---------------------------------------------------------------- ablation mini bars
  document.querySelectorAll('.acard .mini').forEach(m => {
    const rows = JSON.parse(m.dataset.rows);
    const mx = Math.max(...rows.map(r => r[1] == null ? 0 : Math.abs(r[1])));
    m.innerHTML = rows.map(([n, v, me, suf]) => {
      const neg = v != null && v < 0, txt = v == null ? 'no trade' : (neg ? '−' : '') + Math.abs(v).toFixed(suf === '%' ? 0 : 2) + (suf || '');
      return `<div class="r${me ? ' me' : ''}${neg ? ' neg' : ''}"><span>${n}</span><div class="t"><div class="f" data-w="${v == null ? 0 : Math.abs(v) / mx * 100}" style="${neg ? 'background:var(--short)' : ''}"></div></div><span class="v">${txt}</span></div>`;
    }).join('');
    io(() => m.querySelectorAll('.f').forEach((f, i) => setTimeout(() => { f.style.width = f.dataset.w + '%'; }, reduce ? 0 : i * 110)), { threshold: .4 }).observe(m);
  });

  // ---------------------------------------------------------------- video: play while visible
  const vid = document.getElementById('teaser');
  if (vid && !reduce) {
    new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting && e.intersectionRatio > .45) { vid.play().catch(() => {}); } else if (!vid.paused) vid.pause();
    }), { threshold: [0, .45, .8] }).observe(vid);
  }

  // ---------------------------------------------------------------- video: subtitles language + sound
  const vs = document.getElementById('vsound');
  if (vid && vs) {
    const lab = vs.querySelector('span');
    const sync = () => { lab.textContent = vid.muted ? 'Sound on' : 'Mute'; };
    vs.addEventListener('click', () => { vid.muted = !vid.muted; if (!vid.muted) vid.play().catch(() => {}); sync(); });
    vid.addEventListener('volumechange', sync);
    document.querySelectorAll('#vlang button').forEach(b => b.addEventListener('click', () => {
      if (b.classList.contains('on')) return;
      document.querySelectorAll('#vlang button').forEach(x => x.classList.toggle('on', x === b));
      const t = vid.currentTime, playing = !vid.paused;
      vid.src = b.dataset.src; vid.load();
      vid.addEventListener('loadedmetadata', () => { vid.currentTime = t; if (playing) vid.play().catch(() => {}); }, { once: true });
    }));
  }

  // ---------------------------------------------------------------- BibTeX copy
  const cb = document.getElementById('copyBib');
  if (cb) cb.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(document.getElementById('bibText').textContent); cb.textContent = 'Copied'; }
    catch { cb.textContent = 'Select & copy'; }
    setTimeout(() => { cb.textContent = 'Copy'; }, 1600);
  });

  // ---------------------------------------------------------------- PnL chart
  const D = window.PNL_DATA, cv = document.getElementById('pnl');
  if (!D || !cv) return;
  const ts = s => Date.parse(s + 'T00:00:00Z');
  const S = { fixed: D.fixed.map(([d, v]) => [ts(d), v]), reinvested: D.reinvested.map(([d, v]) => [ts(d), v]) };
  const SH = D.sharpe.map(([d, v]) => [ts(d), v]);
  const OOS = ts(D.oos);
  const X0 = Math.min(S.fixed[0][0], S.reinvested[0][0]), X1 = ts('2025-12-31');
  let series = 'fixed', prog = reduce ? 1 : 0, hoverX = null;
  const css = getComputedStyle(document.documentElement);
  const col = n => css.getPropertyValue(n).trim();
  const C = { ink: col('--ink'), acc: col('--acc'), long: col('--long'), quiet: col('--quiet'), line: col('--line'), muted: col('--muted') };
  const MONO = '11px "JetBrains Mono", ui-monospace, Menlo, monospace';
  const fmtDate = t => new Date(t).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  function at(arr, x) {
    let lo = 0, hi = arr.length - 1;
    if (x <= arr[0][0]) return arr[0][1]; if (x >= arr[hi][0]) return arr[hi][1];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; arr[m][0] <= x ? lo = m : hi = m; }
    return arr[lo][1] + (arr[hi][1] - arr[lo][1]) * (x - arr[lo][0]) / (arr[hi][0] - arr[lo][0]);
  }
  function draw() {
    const dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    const narrow = W < 560;
    const L = narrow ? 44 : 56, R = W - 12, T = 22, mainB = Math.round(H * .74), sT = mainB + 30, sB = H - 24;
    const data = S[series], ymax = Math.max(...data.map(p => p[1])) * 1.06;
    const step = ymax > 600 ? 200 : 50;
    const X = x => L + (x - X0) / (X1 - X0) * (R - L), Y = v => mainB - v / ymax * (mainB - T), YS = v => sB - Math.max(0, v) / 3 * (sB - sT);
    const xEnd = X0 + (X1 - X0) * prog;
    c.font = MONO; c.textBaseline = 'middle';
    // grid + y labels
    c.textAlign = 'right';
    for (let g = 0; g <= ymax; g += step) { c.strokeStyle = g === 0 ? C.ink : 'rgba(18,19,22,.08)'; c.lineWidth = g === 0 ? 1.2 : 1; c.beginPath(); c.moveTo(L, Y(g)); c.lineTo(R, Y(g)); c.stroke(); c.fillStyle = C.quiet; c.fillText((g ? '+' : '') + g + '%', L - 8, Y(g)); }
    // x labels
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let y = 2021; y <= 2025; y++) { const x = X(Date.UTC(y, 0, 1)); c.fillStyle = C.quiet; c.fillText(String(y), x, sB + 6); c.strokeStyle = 'rgba(18,19,22,.06)'; c.beginPath(); c.moveTo(x, T); c.lineTo(x, sB); c.stroke(); }
    // OOS region
    c.fillStyle = 'rgba(43,68,214,.06)'; c.fillRect(X(OOS), T - 8, R - X(OOS), sB - T + 8);
    c.strokeStyle = C.ink; c.setLineDash([5, 5]); c.lineWidth = 1; c.beginPath(); c.moveTo(X(OOS), T - 8); c.lineTo(X(OOS), sB); c.stroke(); c.setLineDash([]);
    c.textBaseline = 'alphabetic'; c.font = '600 ' + MONO; c.fillStyle = C.quiet; c.textAlign = 'right'; c.fillText(narrow ? 'TRAIN' : 'TRAINING PERIOD', X(OOS) - 8, T + 4);
    c.fillStyle = C.acc; c.textAlign = 'left'; c.fillText(narrow ? 'TEST →' : 'OUT-OF-SAMPLE →', X(OOS) + 8, T + 4);
    // sharpe band
    c.save(); c.beginPath(); c.rect(L, 0, X(xEnd) - L, H); c.clip();
    c.beginPath(); c.moveTo(X(SH[0][0]), YS(0)); SH.forEach(([x, v]) => c.lineTo(X(x), YS(v))); c.lineTo(X(SH[SH.length - 1][0]), YS(0)); c.closePath();
    c.fillStyle = 'rgba(21,146,90,.22)'; c.fill();
    c.beginPath(); SH.forEach(([x, v], i) => i ? c.lineTo(X(x), YS(v)) : c.moveTo(X(x), YS(v))); c.strokeStyle = C.long; c.lineWidth = 1.2; c.stroke();
    // pnl lines
    const path = (from, to) => { c.beginPath(); let f = true; for (const [x, v] of data) { if (x < from || x > to) continue; f ? c.moveTo(X(x), Y(v)) : c.lineTo(X(x), Y(v)); f = false; } };
    c.lineJoin = 'round'; c.lineCap = 'round';
    path(X0, OOS + 864e5 * 3); c.strokeStyle = '#A3A6AD'; c.lineWidth = 2; c.stroke();
    path(OOS - 864e5 * 3, X1); c.strokeStyle = C.acc; c.lineWidth = 2.8; c.stroke();
    c.restore();
    // sharpe axis
    c.font = MONO; c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillStyle = C.quiet;
    c.fillText('0', L - 8, YS(0)); c.fillText('2', L - 8, YS(2));
    c.strokeStyle = 'rgba(18,19,22,.08)'; c.beginPath(); c.moveTo(L, YS(2)); c.lineTo(R, YS(2)); c.stroke();
    c.strokeStyle = C.ink; c.lineWidth = 1; c.beginPath(); c.moveTo(L, YS(0)); c.lineTo(R, YS(0)); c.stroke();
    c.textAlign = 'left'; c.fillText('rolling Sharpe', L + 6, sT - 4);
    // end label
    if (prog >= 1 && !narrow) {
      const v = data[data.length - 1][1]; c.font = '700 13px "Inter Tight", system-ui'; c.fillStyle = C.acc; c.textAlign = 'right'; c.textBaseline = 'bottom';
      c.fillText('+' + Math.round(v) + '%', R - 2, Y(v) - 8);
    }
    // hover
    if (hoverX != null && prog >= 1) {
      const x = Math.min(X1, Math.max(X0, X0 + (hoverX - L) / (R - L) * (X1 - X0))), v = at(data, x), s = at(SH, x);
      c.strokeStyle = 'rgba(18,19,22,.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(X(x), T); c.lineTo(X(x), sB); c.stroke();
      c.fillStyle = x >= OOS ? C.acc : '#7d8088'; c.beginPath(); c.arc(X(x), Y(v), 4.5, 0, 7); c.fill();
      if (x >= SH[0][0]) { c.fillStyle = C.long; c.beginPath(); c.arc(X(x), YS(s), 3.5, 0, 7); c.fill(); }
      readout.innerHTML = `${fmtDate(x)} · PnL <b>+${v.toFixed(1)}%</b>` + (x >= SH[0][0] ? ` · Sharpe <b>${s.toFixed(2)}</b>` : '') + ` · ${x >= OOS ? '<b style="color:var(--acc)">out-of-sample</b>' : 'training'}`;
    }
  }
  const readout = document.getElementById('readout');
  const pos = e => { const r = cv.getBoundingClientRect(); return (e.touches ? e.touches[0].clientX : e.clientX) - r.left; };
  cv.addEventListener('mousemove', e => { hoverX = pos(e); draw(); });
  cv.addEventListener('touchmove', e => { hoverX = pos(e); draw(); }, { passive: true });
  cv.addEventListener('mouseleave', () => { hoverX = null; readout.textContent = 'Hover the chart'; draw(); });
  document.querySelectorAll('.chartcard .seg button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.chartcard .seg button').forEach(x => x.classList.toggle('on', x === b));
    series = b.dataset.series; draw();
  }));
  new ResizeObserver(draw).observe(cv);
  io(() => {
    if (prog >= 1) return;
    const t0 = performance.now(), dur = 2200;
    const step = now => { const k = Math.min(1, (now - t0) / dur); prog = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; draw(); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }, { threshold: .35 }).observe(cv);
  document.fonts && document.fonts.ready.then(draw);
  draw();
})();
