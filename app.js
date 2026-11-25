(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const canvas = $("field"), ctx = canvas.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W = 0, H = 0, dpr = 1;
  let list = [], cur = 0, cell = null, fade = 0;
  let yaw = 0.6, pitch = -0.25, zoom = 1.75, geom = { cx: 0, cy: 0, R: 1 }, userAt = 0, lastAuto = performance.now(), tPrev = performance.now();
  let segs = null;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect(); W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener("resize", resize); resize();

  // ---- build flat segment arrays from thinned chains ----
  function build(d) {
    const [qx, qr] = d.q; const s = [];
    for (const [type, f] of d.chains) {
      for (let i = 0; i + 7 < f.length; i += 4) {
        s.push(f[i] / qx, f[i+1] / qx, f[i+2] / qx, f[i+4] / qx, f[i+5] / qx, f[i+6] / qx,
               Math.max(f[i+3], f[i+7]) / 2 / qr, type);
      }
    }
    const dist = []; for (let i = 0; i < s.length; i += 8) dist.push(Math.hypot(s[i], s[i+1], s[i+2]));
    dist.sort((p, q) => p - q);
    const ext = Math.max(dist[Math.floor(dist.length * 0.96)] * 1.08, 60);
    return { a: Float32Array.from(s), n: s.length / 8, soma: d.soma, extent: ext, tips: tipPaths(d, qx), pulses: null };
  }

  // root-to-tip paths so light pulses can run outward along real branches
  function tipPaths(d, qx) {
    const ch = d.chains, at = new Map(), par = new Array(ch.length).fill(null), kids = new Uint8Array(ch.length);
    ch.forEach(([, f], ci) => { for (let i = 0; i + 2 < f.length; i += 4) { const k = f[i] + "," + f[i+1] + "," + f[i+2]; let l = at.get(k); if (!l) at.set(k, l = []); l.push([ci, i / 4]); } });
    ch.forEach(([, f], ci) => {
      if (!f.length || (f[0] === 0 && f[1] === 0 && f[2] === 0)) return;
      const l = at.get(f[0] + "," + f[1] + "," + f[2]); const m = l && l.find((e) => e[0] < ci);
      if (m) { par[ci] = m; kids[m[0]] = 1; }
    });
    const out = [];
    ch.forEach(([, f], ci) => {
      if (kids[ci] || f.length < 8) return;
      const parts = []; let c = ci, end = f.length / 4 - 1, guard = 0;
      while (c !== null && guard++ < 400) {
        const cf = ch[c][1], pts = [];
        for (let i = 0; i <= end; i++) pts.push(cf[i*4] / qx, cf[i*4+1] / qx, cf[i*4+2] / qx);
        parts.push(pts);
        const p = par[c]; if (!p) break; c = p[0]; end = p[1];
      }
      const flat = [].concat(...parts.reverse());
      const n = flat.length / 3, cum = new Float32Array(n);
      for (let i = 1; i < n; i++) cum[i] = cum[i-1] + Math.hypot(flat[i*3] - flat[i*3-3], flat[i*3+1] - flat[i*3-2], flat[i*3+2] - flat[i*3-1]);
      if (cum[n-1] > 1) out.push({ p: Float32Array.from(flat), cum, n, len: cum[n-1] });
    });
    return out;
  }
  const spriteC = document.createElement("canvas"); spriteC.width = spriteC.height = 48;
  (() => { const c = spriteC.getContext("2d"), g = c.createRadialGradient(24, 24, 0, 24, 24, 24);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.18, "rgba(225,250,255,0.9)"); g.addColorStop(0.5, "rgba(150,235,255,0.28)"); g.addColorStop(1, "rgba(150,235,255,0)");
    c.fillStyle = g; c.fillRect(0, 0, 48, 48); })();
  function respawn(p, S, first) {
    p.path = S.tips[(Math.random() * S.tips.length) | 0];
    p.speed = S.extent * (0.1 + Math.random() * 0.4);
    p.s = 0; p.wait = first ? Math.random() * 6 : 0.3 + Math.random() * 3.5;
  }
  function pointAt(path, d, o) {
    const cum = path.cum; let lo = 0, hi = path.n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
    const seg = cum[hi] - cum[lo] || 1, t = Math.max(0, Math.min(1, (d - cum[lo]) / seg)), P = path.p;
    o[0] = P[lo*3] + (P[hi*3] - P[lo*3]) * t; o[1] = P[lo*3+1] + (P[hi*3+1] - P[lo*3+1]) * t; o[2] = P[lo*3+2] + (P[hi*3+2] - P[lo*3+2]) * t;
  }

  const fmt = (n) => Math.round(n).toLocaleString("en-US");
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  let updatedText = "";
  function show(i) {
    cur = (i + list.length) % list.length;
    const m = list[cur];
    $("celltype").textContent = m.cell_type.split(", ").slice(0, 2).join(" · ");
    $("length").innerHTML = fmt(m.dendrite_um).replace(/,/g, '<span class="comma">,</span>');
    $("region").textContent = m.region;
    $("count").textContent = (cur + 1) + " / " + list.length;
    renderCredit(m);
    fetch(m.file).then((r) => r.json()).then((d) => {
      if (list[cur] !== m) return;
      cell = build(d); segs = cell; fade = 0;
    });
  }

  function renderCredit(m) {
    const rows = [
      ["Species", "Human"], ["Region", m.region], ["Cell type", m.cell_type], ["Completeness", m.integrity],
    ];
    if (m.tissue) rows.push(["Tissue", m.tissue]);
    rows.push(["Source", esc(m.archive)]);
    rows.push(["Database", m.link ? `<a href="${esc(m.link)}" target="_blank" rel="noopener">${esc(m.source)}</a>` : esc(m.source)]);
    if (m.pub) rows.push(["Publication", `<a href="${esc(m.pub)}" target="_blank" rel="noopener">${esc(m.pub.replace("https://", ""))}</a>`]);
    rows.push(["Cell", esc(m.name)]);
    if (updatedText) rows.push(["Refreshed", esc(updatedText)]);
    $("creditList").innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${/^<a /.test(v) || k === "Source" || k === "Database" || k === "Cell" || k === "Refreshed" ? v : esc(v)}</dd>`).join("");
    $("creditFine").textContent = m.credit + ". Reconstructions are simplified for display; lengths are measured from the original tracing. For illustration, not for clinical use.";
  }

  // ---- drawing ----
  const WB = [1.2, 2.0, 3.2];            // width buckets
  const AB = [0.38, 0.58, 0.8, 1];     // alpha buckets (far -> near)
  function draw(now) {
    const dt = Math.min((now - tPrev) / 1000, 0.1); tPrev = now;
    if (!reduce && now - userAt > 2500) yaw += dt * 0.11;
    if (list.length > 1 && now - userAt > 120000 && now - lastAuto > 55000) { lastAuto = now; show(cur + 1); }
    ctx.clearRect(0, 0, W, H);
    if (segs) {
      fade = Math.min(1, fade + dt / 1.1);
      const wide = W > 700;
      const cx = W * (wide ? 0.62 : 0.5), cy = H * (wide ? 0.58 : 0.42);
      const R = wide ? Math.min(W * 0.345, H * 0.46) : Math.min(W * 0.575, H * 0.3);
      geom = { cx, cy, R };
      const sc = (R / segs.extent) * zoom, D = 4 * segs.extent;
      const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const a = segs.a, n = segs.n;
      const proj = (x, y, z) => {
        const x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw;
        const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
        const f = D / (D + z2);
        return [cx + x1 * sc * f, cy + y2 * sc * f, z2];
      };
      // soma glow
      const [sx, sy] = proj(0, 0, 0), sr = Math.max(segs.soma[3] * sc * 1.6, 5);
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 4.4);
      g.addColorStop(0, `rgba(110,225,252,${0.3 * fade})`); g.addColorStop(0.35, `rgba(110,225,252,${0.26 * fade})`); g.addColorStop(1, "rgba(110,225,252,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, sr * 4.4, 0, 6.2832); ctx.fill();
      // bucketed paths
      const paths = new Map();
      const ext = segs.extent;
      for (let i = 0; i < n; i++) {
        const o = i * 8, type = a[o + 7];
        const p = proj(a[o], a[o+1], a[o+2]), q = proj(a[o+3], a[o+4], a[o+5]);
        const t = Math.max(0, Math.min(1, 0.5 - ((p[2] + q[2]) / 2) / (2 * ext)));
        const ab = t < 0.3 ? 0 : t < 0.5 ? 1 : t < 0.7 ? 2 : 3;
        const r = a[o + 6] * sc;
        const wb = r > 1.6 ? 2 : r > 0.7 ? 1 : 0;
        const k = (type === 2 ? 0 : 1) * 12 + wb * 4 + ab;
        let path = paths.get(k); if (!path) { path = new Path2D(); paths.set(k, path); }
        path.moveTo(p[0], p[1]); path.lineTo(q[0], q[1]);
      }
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.shadowColor = "rgba(0,0,0,0.15)"; ctx.shadowBlur = 5 * dpr; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 2 * dpr;
      for (const [k, path] of paths) {
        const axon = k >= 12, kk = k % 12, wb = (kk / 4) | 0, ab = kk % 4;
        ctx.lineWidth = WB[wb] * (axon ? 0.8 : 1);
        ctx.strokeStyle = `rgba(255,255,255,${AB[ab] * (axon ? 0.55 : 1) * fade})`;
        ctx.stroke(path);
      }
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      if (!reduce && segs.tips.length) {
        if (!segs.pulses) { segs.pulses = []; const N = Math.min(wide ? 38 : 22, Math.max(5, Math.round(segs.tips.length * 0.7))); for (let i = 0; i < N; i++) { const p = {}; respawn(p, segs, true); segs.pulses.push(p); } }
        const K = 8, tl = segs.extent * 0.07, pt = [0, 0, 0], pos = [];
        for (const p of segs.pulses) {
          if (p.wait > 0) { p.wait -= dt; continue; }
          p.s += p.speed * dt;
          if (p.s - tl > p.path.len) { respawn(p, segs, false); continue; }
          pos.length = 0;
          for (let k = 0; k <= K; k++) { const d = Math.min(p.s, p.path.len) - (k / K) * tl; if (d < 0) break; pointAt(p.path, d, pt); pos.push(proj(pt[0], pt[1], pt[2])); }
          if (pos.length < 2) continue;
          const dep = Math.max(0.45, Math.min(1, 0.75 - pos[0][2] / (2 * ext)));
          const head = p.s <= p.path.len, life = Math.min(1, (p.path.len - Math.min(p.s, p.path.len) + tl) / tl);
          ctx.lineCap = "round";
          for (let k = 0; k + 1 < pos.length; k++) {
            const f = 1 - k / K;
            ctx.strokeStyle = `rgba(215,248,255,${0.85 * f * f * dep * fade})`; ctx.lineWidth = 0.8 + 2 * f;
            ctx.beginPath(); ctx.moveTo(pos[k][0], pos[k][1]); ctx.lineTo(pos[k+1][0], pos[k+1][1]); ctx.stroke();
          }
          if (head) { ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = dep * fade * Math.min(1, life + 0.3); const r = 9; ctx.drawImage(spriteC, pos[0][0] - r, pos[0][1] - r, r * 2, r * 2); ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; }
        }
      }
    }
    requestAnimationFrame(draw);
  }

  // ---- interaction ----
  let drag = null, pinch = null;
  canvas.addEventListener("pointerdown", (e) => { canvas.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY }; userAt = performance.now(); });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return; userAt = performance.now();
    yaw += (e.clientX - drag.x) * 0.008; pitch = Math.max(-1.4, Math.min(1.4, pitch + (e.clientY - drag.y) * 0.008));
    drag = { x: e.clientX, y: e.clientY };
  });
  const end = () => { drag = null; };
  canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); zoom = Math.max(0.5, Math.min(4, zoom * Math.exp(-e.deltaY * 0.001))); userAt = performance.now(); }, { passive: false });
  canvas.addEventListener("touchmove", (e) => {
    if (e.touches.length !== 2) return; e.preventDefault();
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    if (pinch) zoom = Math.max(0.5, Math.min(4, zoom * d / pinch)); pinch = d; userAt = performance.now();
  }, { passive: false });
  canvas.addEventListener("touchend", () => { pinch = null; });
  $("next").onclick = () => { userAt = performance.now(); show(cur + 1); };
  $("prev").onclick = () => { userAt = performance.now(); show(cur - 1); };
  addEventListener("keydown", (e) => { if (e.key === "ArrowRight") $("next").click(); else if (e.key === "ArrowLeft") $("prev").click(); else if (e.key === "Escape") closeCredit(); });
  $("fit").onclick = () => { const g = geom; zoom = Math.max(0.5, Math.min(4, Math.min(g.cx, W - g.cx, g.cy, H - g.cy) * 0.85 / g.R)); userAt = performance.now(); };
  const credit = $("credit"), about = $("about");
  function closeCredit() { credit.hidden = true; document.querySelector(".neuron-app").classList.remove("open"); about.setAttribute("aria-expanded", "false"); }
  about.onclick = () => { const open = credit.hidden; credit.hidden = !open; document.querySelector(".neuron-app").classList.toggle("open", open); about.setAttribute("aria-expanded", String(open)); };
  $("closeCredit").onclick = closeCredit;

  fetch("data/index.json", { cache: "no-cache" }).then((r) => r.json()).then((d) => {
    list = d.neurons; updatedText = d.updated;
    cur = Math.floor(Math.random() * list.length); show(cur);
  }).catch(() => { $("offline").hidden = false; $("celltype").textContent = "Unavailable"; });
  requestAnimationFrame(draw);
})();

(function () {
  function fit() {
    var e = document.querySelector("h1 .eyebrow"), r = e && e.parentNode; if (!e) return;
    var h = parseFloat(getComputedStyle(r).fontSize), gap = h * 0.11, pad = h * 0.07;
    e.style.left = gap + "px"; e.style.fontSize = "";
    var fs = parseFloat(getComputedStyle(e).fontSize), n = e.scrollWidth - fs * 0.16;
    var t = r.offsetWidth - gap - pad;
    var k = 0.82; e.style.fontSize = (fs * t * k / n) + "px"; e.style.left = (gap + t * (1 - k) / 2) + "px";
  }
  window.addEventListener("load", fit); window.addEventListener("resize", fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
})();
