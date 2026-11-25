(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const canvas = $("field"), ctx = canvas.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W = 0, H = 0, dpr = 1;
  let list = [], cur = 0, cell = null, fade = 0;
  let yaw = 0.6, pitch = -0.25, zoom = 1, userAt = 0, lastAuto = performance.now(), tPrev = performance.now();
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
    return { a: Float32Array.from(s), n: s.length / 8, soma: d.soma, extent: ext };
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
      const cx = W * (wide ? 0.62 : 0.5), cy = H * (wide ? 0.5 : 0.3);
      const R = wide ? Math.min(W * 0.3, H * 0.4) : Math.min(W * 0.5, H * 0.26);
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
      g.addColorStop(0, `rgba(110,225,252,${0.34 * fade})`); g.addColorStop(0.35, `rgba(110,225,252,${0.13 * fade})`); g.addColorStop(1, "rgba(110,225,252,0)");
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
      ctx.shadowColor = "rgba(30,90,255,0.7)"; ctx.shadowBlur = 9 * dpr; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      for (const [k, path] of paths) {
        const axon = k >= 12, kk = k % 12, wb = (kk / 4) | 0, ab = kk % 4;
        ctx.lineWidth = WB[wb] * (axon ? 0.8 : 1);
        ctx.strokeStyle = `rgba(255,255,255,${AB[ab] * (axon ? 0.55 : 1) * fade})`;
        ctx.stroke(path);
      }
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
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
