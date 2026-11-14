/* AllocFlow — flow-matching visuals.
 * Both the hero animation and the lab integrate the *exact* marginal velocity field of
 * conditional flow matching (linear path z_t = (1-t)·eps + t·a, eps ~ N(0, diag(s0^2)))
 * for a target that is a mixture of axis-aligned Gaussians:
 *   v_k   = (1-t)^2 s0^2 + t^2 s_k^2
 *   u_k   = mu_k + (t s_k^2 - (1-t) s0^2) / v_k · (z - t mu_k)        (= E[a - eps | z_t = z, k])
 *   u     = sum_k  r_k(z,t) u_k,   r_k ∝ w_k N(z; t mu_k, v_k)           (posterior over components)
 * At t = 0 this reduces to u(z,0) = E[a] - z.
 */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = id => document.getElementById(id);
  const css = getComputedStyle(document.documentElement);
  const C = { ink: css.getPropertyValue('--ink').trim() || '#121316', acc: css.getPropertyValue('--acc').trim() || '#2B44D6', long: css.getPropertyValue('--long').trim() || '#15925A', short: css.getPropertyValue('--short').trim() || '#D8452F', quiet: '#8A8E95', line: '#DEDDD6' };
  const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const mix = (a, b, k) => `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`;
  function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // ---------------------------------------------------------------- exact mixture field
  // comps: {mx,my,sx,sy,w}; s0x,s0y: noise std per axis
  function fieldFactory(comps, s0x, s0y) {
    const K = comps.length, MX = new Float64Array(K), MY = new Float64Array(K), SX2 = new Float64Array(K), SY2 = new Float64Array(K), LW = new Float64Array(K);
    comps.forEach((c, k) => { MX[k] = c.mx; MY[k] = c.my; SX2[k] = c.sx * c.sx; SY2[k] = c.sy * c.sy; LW[k] = Math.log(c.w); });
    const vx = new Float64Array(K), vy = new Float64Array(K), cx = new Float64Array(K), cy = new Float64Array(K), lb = new Float64Array(K);
    let tCur = -1;
    function prep(t) {
      if (t === tCur) return; tCur = t;
      const a = (1 - t) * (1 - t);
      for (let k = 0; k < K; k++) {
        vx[k] = a * s0x * s0x + t * t * SX2[k]; vy[k] = a * s0y * s0y + t * t * SY2[k];
        cx[k] = (t * SX2[k] - (1 - t) * s0x * s0x) / vx[k]; cy[k] = (t * SY2[k] - (1 - t) * s0y * s0y) / vy[k];
        lb[k] = LW[k] - .5 * Math.log(vx[k] * vy[k]);
      }
    }
    // returns [ux, uy] (writes into out)
    function u(x, y, t, out) {
      prep(t);
      let m = -Infinity, sw = 0, sx = 0, sy = 0;
      for (let k = 0; k < K; k++) {
        const dx = x - t * MX[k], dy = y - t * MY[k];
        const l = lb[k] - .5 * (dx * dx / vx[k] + dy * dy / vy[k]);
        const ux = MX[k] + cx[k] * dx, uy = MY[k] + cy[k] * dy;
        if (l > m) { const s = Math.exp(m - l); sw = sw * s + 1; sx = sx * s + ux; sy = sy * s + uy; m = l; }
        else { const e = Math.exp(l - m); sw += e; sx += e * ux; sy += e * uy; }
      }
      out[0] = sx / sw; out[1] = sy / sw; return out;
    }
    return u;
  }
  // Euler-integrate n steps; returns Float32Array [(n+1) * N * 2]
  function integrate(u, eps, n) {
    const N = eps.length / 2, S = new Float32Array((n + 1) * N * 2), o = [0, 0];
    S.set(eps, 0);
    for (let i = 0; i < n; i++) {
      const t = i / n, base = i * N * 2, nb = (i + 1) * N * 2;
      for (let p = 0; p < N; p++) {
        const x = S[base + 2 * p], y = S[base + 2 * p + 1];
        u(x, y, t, o);
        S[nb + 2 * p] = x + o[0] / n; S[nb + 2 * p + 1] = y + o[1] / n;
      }
    }
    return S;
  }
  const posAt = (S, N, n, p, tau, out) => {        // piecewise-linear along Euler states
    const f = Math.min(n - 1e-9, Math.max(0, tau * n)), i = Math.floor(f), k = f - i;
    const a = i * N * 2 + 2 * p, b = (i + 1) * N * 2 + 2 * p;
    out[0] = S[a] + (S[b] - S[a]) * k; out[1] = S[a + 1] + (S[b + 1] - S[a + 1]) * k; return out;
  };
  const ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;

  // ================================================================ HERO: noise -> "AllocFlow"
  (function hero() {
    const wrap = document.querySelector('.megawrap'), h1 = $('megaTitle'), cv = $('heroFlow'), btn = $('replayFlow');
    if (!wrap || !h1 || !cv) return;
    const finish = () => wrap.classList.add('done');
    if (reduce) { finish(); if (btn) btn.style.display = 'none'; return; }
    // wrap characters to measure glyph boxes
    const glyphs = [];
    (function split(node, flow) {
      [...node.childNodes].forEach(ch => {
        if (ch.nodeType === 3) {
          const f = document.createDocumentFragment();
          [...ch.textContent].forEach(c => { const s = document.createElement('span'); s.textContent = c; f.appendChild(s); glyphs.push({ el: s, c, flow }); });
          ch.replaceWith(f);
        } else if (ch.nodeType === 1) split(ch, flow || ch.tagName === 'SPAN');
      });
    })(h1, false);
    let S = null, N = 0, n = 40, cols = null, W = 0, H = 0, ox = 0, oy = 0, raf = 0, start = 0;
    function build() {
      const r = wrap.getBoundingClientRect(), hr = h1.getBoundingClientRect();
      const fs = parseFloat(getComputedStyle(h1).fontSize);
      W = Math.min(innerWidth, r.width + 160); H = hr.height * 2.6;
      const dpr = Math.min(2, devicePixelRatio || 1);
      cv.style.width = W + 'px'; cv.style.height = H + 'px'; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
      ox = (r.left + r.width / 2) - W / 2; oy = (hr.top + hr.height / 2) - H / 2;  // canvas top-left in viewport coords
      // rasterize glyphs at their measured positions
      const off = document.createElement('canvas'); off.width = Math.ceil(W); off.height = Math.ceil(H);
      const g = off.getContext('2d'); g.textBaseline = 'alphabetic';
      const fontFor = it => `${it ? 'italic ' : ''}600 ${fs}px Fraunces, Georgia, serif`;
      g.font = fontFor(false);
      const asc = g.measureText('A').fontBoundingBoxAscent || fs * .95;
      const flowMask = document.createElement('canvas'); flowMask.width = off.width; flowMask.height = off.height;
      const fm = flowMask.getContext('2d'); fm.textBaseline = 'alphabetic';
      glyphs.forEach(gl => { const b = gl.el.getBoundingClientRect(); const x = b.left - ox, y = b.top - oy + asc; g.font = fm.font = fontFor(gl.flow); g.fillText(gl.c, x, y); if (gl.flow) fm.fillText(gl.c, x, y); });
      const A = g.getImageData(0, 0, off.width, off.height).data, F = fm.getImageData(0, 0, off.width, off.height).data;
      // mixture components on a coarse grid inside the glyphs
      const G = Math.max(3.5, fs / 14.5), comps = [];
      for (let y = G / 2; y < off.height; y += G) for (let x = G / 2; x < off.width; x += G) {
        const i = ((y | 0) * off.width + (x | 0)) * 4 + 3;
        if (A[i] > 140) comps.push({ mx: x - W / 2, my: y - H / 2, sx: G * .2, sy: G * .2, w: 1, flow: F[i] > 140 });
      }
      if (!comps.length) { finish(); return false; }
      const per = innerWidth < 640 ? 4 : 5;
      N = Math.min(innerWidth < 640 ? 1100 : 2200, comps.length * per);
      n = innerWidth < 640 ? 28 : 40;
      const r0 = rng(7), eps = new Float32Array(N * 2), s0x = W * .2, s0y = H * .24;
      for (let p = 0; p < N; p++) { eps[2 * p] = gauss(r0) * s0x; eps[2 * p + 1] = gauss(r0) * s0y; }
      const u = fieldFactory(comps, s0x, s0y);
      S = integrate(u, eps, n);
      // colour each particle by the component it lands in
      cols = new Uint8Array(N); const last = n * N * 2;
      for (let p = 0; p < N; p++) {
        const x = S[last + 2 * p], y = S[last + 2 * p + 1]; let best = 0, bd = Infinity;
        for (let k = 0; k < comps.length; k++) { const d = (x - comps[k].mx) ** 2 + (y - comps[k].my) ** 2; if (d < bd) { bd = d; best = k; } }
        cols[p] = comps[best].flow ? 1 : 0;
      }
      return true;
    }
    const grey = hex(C.quiet), ink = hex(C.ink), acc = hex(C.acc), o = [0, 0];
    function frame(now) {
      const T = 2600, hold = 350, fade = 650, e = now - start;
      const k = Math.min(1, e / T), tau = ease(k);
      const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, W, H);
      const alpha = e < T + hold ? 1 : Math.max(0, 1 - (e - T - hold) / fade);
      if (e > T + hold * .4) wrap.classList.add('done');
      const cIn = mix(grey, ink, Math.pow(tau, 1.6)), cAc = mix(grey, acc, Math.pow(tau, 1.6));
      const sz = innerWidth < 640 ? 1.5 : 1.9;
      ctx.globalAlpha = alpha * (.25 + .65 * Math.min(1, e / 300));
      for (let c = 0; c < 2; c++) {
        ctx.fillStyle = c ? cAc : cIn;
        for (let p = 0; p < N; p++) { if (cols[p] !== c) continue; posAt(S, N, n, p, tau, o); ctx.fillRect(W / 2 + o[0] - sz / 2, H / 2 + o[1] - sz / 2, sz, sz); }
      }
      if (alpha > 0) raf = requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
    }
    function play() {
      cancelAnimationFrame(raf); wrap.classList.remove('done');
      if (!build()) return;
      start = performance.now(); window.__heroStart = start; raf = requestAnimationFrame(frame);
    }
    // animate only if the display font is ready quickly; otherwise just show the title (replay stays available)
    const ready = document.fonts ? Promise.all([document.fonts.load('600 100px Fraunces'), document.fonts.load('italic 600 100px Fraunces')]).then(() => document.fonts.check('600 100px Fraunces') && document.fonts.check('italic 600 100px Fraunces')) : Promise.resolve(false);
    const timeout = new Promise(r => setTimeout(() => r('late'), 1200));
    Promise.race([ready, timeout]).then(v => { if (v === true) requestAnimationFrame(play); else finish(); }).catch(finish);
    setTimeout(() => { if (!raf) finish(); }, 6000);   // safety net
    if (btn) btn.addEventListener('click', play);
    let rw = innerWidth; addEventListener('resize', () => { if (Math.abs(innerWidth - rw) > 40) { rw = innerWidth; cancelAnimationFrame(raf); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); finish(); } });
  })();

  // ================================================================ LAB
  (function lab() {
    const cv = $('labCanvas'); if (!cv) return;
    const MODES = [
      { name: 'Short A', mx: -.55, my: .12, s: .085, w: .4, R: 1.0, col: C.acc },
      { name: 'Short B', mx: .12, my: -.55, s: .085, w: .4, R: .3, col: C.ink },
      { name: 'Long both', mx: .45, my: .42, s: .10, w: .2, R: -.6, col: C.long },
    ];
    const S0 = .42, NP = innerWidth < 640 ? 520 : 820;
    const st = { policy: 'flow', steps: 4, field: true, trails: true, rl: false, beta: .8, tau: 1, playing: false };
    const r0 = rng(11), eps = new Float32Array(NP * 2);
    for (let p = 0; p < NP; p++) { eps[2 * p] = gauss(r0) * S0; eps[2 * p + 1] = gauss(r0) * S0; }
    let traj = null, nS = 4, lab = null, weights = null, u = null, meanBook = [0, 0], goodShare = 0, flowShare = 0;

    function curWeights() {
      const w = MODES.map(m => m.w * (st.rl ? Math.exp(m.R / st.beta) : 1)); const z = w.reduce((a, b) => a + b, 0);
      return w.map(x => x / z);
    }
    const inMode = (x, y) => { for (let k = 0; k < MODES.length; k++) { const m = MODES[k]; if ((x - m.mx) ** 2 + (y - m.my) ** 2 < (2.6 * m.s) ** 2) return k; } return -1; };
    function recompute() {
      weights = curWeights();
      const comps = MODES.map((m, k) => ({ mx: m.mx, my: m.my, sx: m.s, sy: m.s, w: weights[k] }));
      u = fieldFactory(comps, S0, S0);
      meanBook = [comps.reduce((a, c) => a + c.w * c.mx, 0), comps.reduce((a, c) => a + c.w * c.my, 0)];
      // flow trajectories (also used for the share readout)
      const nFlow = st.steps;
      const flowTraj = integrate(u, eps, nFlow);
      let ok = 0; const L = nFlow * NP * 2; lab = new Int8Array(NP);
      for (let p = 0; p < NP; p++) { const k = inMode(flowTraj[L + 2 * p], flowTraj[L + 2 * p + 1]); lab[p] = k; if (k >= 0) ok++; }
      flowShare = ok / NP;
      if (st.policy === 'flow') { traj = flowTraj; nS = nFlow; goodShare = flowShare; }
      else {
        // diagonal Gaussian fitted to the same (possibly reweighted) mixture by moment matching
        const vx = comps.reduce((a, c) => a + c.w * (c.sx * c.sx + c.mx * c.mx), 0) - meanBook[0] ** 2;
        const vy = comps.reduce((a, c) => a + c.w * (c.sy * c.sy + c.my * c.my), 0) - meanBook[1] ** 2;
        traj = new Float32Array(2 * NP * 2); traj.set(eps, 0); nS = 1; ok = 0;
        for (let p = 0; p < NP; p++) {
          const x = meanBook[0] + Math.sqrt(vx) * eps[2 * p] / S0, y = meanBook[1] + Math.sqrt(vy) * eps[2 * p + 1] / S0;
          traj[NP * 2 + 2 * p] = x; traj[NP * 2 + 2 * p + 1] = y; const k = inMode(x, y); lab[p] = k; if (k >= 0) ok++;
        }
        goodShare = ok / NP;
      }
      readout();
    }
    // ---------------------------------------------------------- drawing
    let W = 0, Sx = 0;
    const X = x => W / 2 + x * Sx, Y = y => W / 2 - y * Sx;
    function draw() {
      const dpr = Math.min(2, devicePixelRatio || 1); W = cv.clientWidth; Sx = W * .44;
      if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(W * dpr); }
      const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, W);
      // grid
      c.strokeStyle = 'rgba(18,19,22,.06)'; c.lineWidth = 1;
      for (let g = -1; g <= 1.001; g += .25) { c.beginPath(); c.moveTo(X(g), Y(-1.1)); c.lineTo(X(g), Y(1.1)); c.stroke(); c.beginPath(); c.moveTo(X(-1.1), Y(g)); c.lineTo(X(1.1), Y(g)); c.stroke(); }
      c.strokeStyle = 'rgba(18,19,22,.45)'; c.beginPath(); c.moveTo(X(-1.1), Y(0)); c.lineTo(X(1.1), Y(0)); c.moveTo(X(0), Y(-1.1)); c.lineTo(X(0), Y(1.1)); c.stroke();
      c.font = '10.5px "JetBrains Mono", ui-monospace, monospace'; c.fillStyle = C.quiet;
      c.textAlign = 'left'; c.fillText('← short A', X(-1.08), Y(0) - 7); c.textAlign = 'right'; c.fillText('long A →', X(1.08), Y(0) - 7);
      c.textAlign = 'left'; c.fillText('long B ↑', X(0) + 7, Y(1.04)); c.fillText('short B ↓', X(0) + 7, Y(-1.06));
      // modes
      MODES.forEach((m, k) => {
        c.strokeStyle = m.col; c.globalAlpha = .55; c.setLineDash([4, 4]); c.lineWidth = 1.3;
        c.beginPath(); c.arc(X(m.mx), Y(m.my), 2.6 * m.s * Sx, 0, 7); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
        c.font = '600 11px "JetBrains Mono", ui-monospace, monospace'; c.fillStyle = m.col; c.textAlign = 'center';
        c.fillText(m.name.toUpperCase() + (st.rl ? `  r=${m.R > 0 ? '+' : ''}${m.R.toFixed(1)}` : ''), X(m.mx), Y(m.my) - 2.6 * m.s * Sx - 7);
      });
      const tau = st.tau, o = [0, 0];
      // velocity field at current tau (flow only)
      if (st.field && st.policy === 'flow' && tau < .96) {
        const n = 15, cell = 2.2 / n;
        c.lineWidth = 1.1;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          const x = -1.1 + cell * (i + .5), y = -1.1 + cell * (j + .5); u(x, y, tau, o);
          const mag = Math.hypot(o[0], o[1]); if (mag < 1e-6) continue;
          const L = Math.min(1, mag / 1.3) * cell * .8, ux = o[0] / mag * L, uy = o[1] / mag * L;
          const x0 = X(x - ux / 2), y0 = Y(y - uy / 2), x1 = X(x + ux / 2), y1 = Y(y + uy / 2);
          c.strokeStyle = `rgba(43,68,214,${(.18 + .3 * Math.min(1, mag / 1.3)).toFixed(3)})`;
          c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
          const a = Math.atan2(y1 - y0, x1 - x0); c.beginPath(); c.moveTo(x1, y1); c.lineTo(x1 - 4 * Math.cos(a - .5), y1 - 4 * Math.sin(a - .5)); c.moveTo(x1, y1); c.lineTo(x1 - 4 * Math.cos(a + .5), y1 - 4 * Math.sin(a + .5)); c.stroke();
        }
      }
      // trajectories
      if (st.trails && tau > 0) {
        c.lineWidth = 1; c.strokeStyle = 'rgba(18,19,22,.12)';
        for (let p = 0; p < NP; p += 5) {
          c.beginPath(); c.moveTo(X(traj[2 * p]), Y(traj[2 * p + 1]));
          const f = tau * nS, last = Math.floor(f);
          for (let i = 1; i <= Math.min(last, nS); i++) c.lineTo(X(traj[i * NP * 2 + 2 * p]), Y(traj[i * NP * 2 + 2 * p + 1]));
          posAt(traj, NP, nS, p, tau, o); c.lineTo(X(o[0]), Y(o[1])); c.stroke();
        }
      }
      // particles
      const grey = hex(C.quiet), bad = hex(C.short), mc = MODES.map(m => hex(m.col));
      for (let p = 0; p < NP; p++) {
        posAt(traj, NP, nS, p, tau, o);
        const k = lab[p], target = k >= 0 ? mc[k] : (st.policy === 'gauss' ? bad : grey);
        c.fillStyle = mix(grey, target, Math.pow(tau, 1.5)); c.globalAlpha = .78;
        c.beginPath(); c.arc(X(o[0]), Y(o[1]), 2, 0, 7); c.fill();
      }
      c.globalAlpha = 1;
      // mean book marker
      const mx = X(meanBook[0]), my = Y(meanBook[1]);
      c.strokeStyle = C.short; c.lineWidth = 2.2; c.beginPath(); c.moveTo(mx - 7, my - 7); c.lineTo(mx + 7, my + 7); c.moveTo(mx + 7, my - 7); c.lineTo(mx - 7, my + 7); c.stroke();
      c.font = '600 11px "JetBrains Mono", ui-monospace, monospace'; c.fillStyle = C.short; c.textAlign = 'left';
      c.fillText('average book 𝔼[a]', mx + 11, my + 16);
      $('labTauVal').textContent = 'τ = ' + tau.toFixed(2);
      $('labTau').value = tau;
    }
    // ---------------------------------------------------------- readout
    function readout() {
      const base = MODES.map(m => m.w), wz = base.reduce((a, b) => a + b, 0);
      $('labMass').innerHTML = MODES.map((m, k) => {
        const b0 = base[k] / wz, b1 = weights[k];
        return `<div class="mr"><span class="dot" style="background:${m.col}"></span><span>${m.name}</span><span class="bar"><i style="width:${(b1 * 100).toFixed(1)}%;background:${m.col}"></i>${st.rl ? `<b style="left:${(b0 * 100).toFixed(1)}%"></b>` : ''}</span><span class="pc">${st.rl ? `${Math.round(b0 * 100)}% → ${Math.round(b1 * 100)}%` : Math.round(b1 * 100) + '%'}</span></div>`;
      }).join('') + `<div class="rw">${st.policy === 'flow' ? 'samples on a good book' : 'Gaussian samples on a good book'}: <b style="color:var(--ink)">${Math.round(goodShare * 100)}%</b>${st.policy === 'gauss' ? ` · flow: ${Math.round(flowShare * 100)}%` : ''}</div>`;
      let t;
      if (st.policy === 'gauss') t = `A diagonal Gaussian centred on the mean book spreads its samples <b>between</b> the clusters: only <b>${Math.round(goodShare * 100)}%</b> land on a good book (flow: ${Math.round(flowShare * 100)}%). Its centre, the average book ✕, is a small short in both coins — neither good trade, and the same bet twice.`;
      else if (st.steps === 1) t = `With <b>one</b> Euler step, every sample lands exactly on 𝔼[a], the average book ✕. Since u(z,0) = 𝔼[a] − z, one-step generation <i>is</i> regression to the mean.`;
      else if (st.steps === 2) t = `<b>Two</b> steps start to split the clusters, but the first step still pulls everything toward the mean: ${Math.round(goodShare * 100)}% of samples reach a good book.`;
      else if (st.steps === 4) t = `<b>Four</b> steps — AllocFlow's setting — already place <b>${Math.round(goodShare * 100)}%</b> of samples on a good book, each cluster in proportion. Straight conditional paths make few steps enough.`;
      else t = `With <b>${st.steps}</b> steps the samples follow the exact ODE (${Math.round(goodShare * 100)}% on a good book). Trajectories curve and split but never cross.`;
      if (st.rl) {
        const k = 0; t += ` <br><b>+ RL</b> (β = ${st.beta.toFixed(2)}): the ideal anchored policy reweights clusters by exp(r/β) — ${MODES[k].name} ${Math.round(MODES[k].w * 100)}% → ${Math.round(weights[k] * 100)}%. It can only reweight books imitation already produces.`;
      }
      $('labNote').innerHTML = t;
    }
    // ---------------------------------------------------------- animation + controls
    let raf = 0, t0 = 0;
    function play() {
      cancelAnimationFrame(raf); st.playing = true; t0 = performance.now();
      const dur = reduce ? 1 : 2300;
      const step = now => { const k = Math.min(1, (now - t0) / dur); st.tau = reduce ? 1 : ease(k); draw(); if (k < 1 && st.playing) raf = requestAnimationFrame(step); else st.playing = false; };
      raf = requestAnimationFrame(step);
    }
    function seg(id, key, parse, multi) {
      const el = $(id);
      el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
        if (multi) { b.classList.toggle('on'); st[b.dataset.v] = b.classList.contains('on'); draw(); return; }
        el.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
        st[key] = parse(b.dataset.v);
        if (key === 'rl') $('labBetaRow').classList.toggle('on', st.rl);
        $('labSteps').style.opacity = st.policy === 'flow' ? 1 : .4;
        recompute(); play();
      }));
    }
    seg('labPolicy', 'policy', v => v);
    seg('labSteps', 'steps', v => +v);
    seg('labShow', null, null, true);
    seg('labRL', 'rl', v => v === 'rl');
    $('labBeta').addEventListener('input', e => { st.beta = +e.target.value; $('labBetaVal').textContent = st.beta.toFixed(2); recompute(); st.tau = 1; draw(); });
    $('labTau').addEventListener('input', e => { st.playing = false; cancelAnimationFrame(raf); st.tau = +e.target.value; draw(); });
    $('labPlay').addEventListener('click', play);
    new ResizeObserver(() => draw()).observe(cv);
    recompute(); st.tau = 0; draw();
    new IntersectionObserver((es, ob) => es.forEach(e => { if (e.isIntersecting) { play(); ob.disconnect(); } }), { threshold: .35 }).observe(cv);
  })();
})();
