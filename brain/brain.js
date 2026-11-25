(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const cv = $("field");
  const gl = cv.getContext("webgl2", { antialias: true, alpha: true, premultipliedAlpha: true });
  if (!gl) { $("offline").hidden = false; $("offline").textContent = "This page needs WebGL."; return; }

  const VS = `#version 300 es
  in vec3 a_pos; in float a_dist; in float a_nid; in float a_imp;
  uniform mat3 u_rot; uniform vec2 u_scale; uniform vec2 u_pan; uniform float u_time; uniform float u_ext; uniform vec2 u_off;
  out float v_i; out float v_depth; out float v_imp;
  float h(float n){ return fract(sin(n*12.9898)*43758.5453); }
  void main(){
    vec3 p = u_rot * (a_pos / 32000.0);
    gl_Position = vec4(p.xy * u_scale + u_pan + u_off, p.z * -0.4, 1.0);
    v_imp = a_imp;
    v_depth = p.z * 0.5 + 0.5;
    float sp = (0.10 + 0.22 * h(a_nid + 1.0)) * 0.45;
    float ph = h(a_nid + 7.0);
    float w = 0.045 + 0.05 * h(a_nid + 3.0);
    float t = fract(u_time * sp + ph) * 3.0;
    float t2 = fract(u_time * sp * 0.8 + ph * 3.7) * 3.0;
    float d1 = t - a_dist, d2 = t2 - a_dist;
    float i1 = d1 >= 0.0 ? exp(-d1 / w) : exp(d1 * 40.0);
    float i2 = d2 >= 0.0 ? exp(-d2 / w) : exp(d2 * 40.0);
    v_i = max(i1, i2);
  }`;
  const FS = `#version 300 es
  precision mediump float;
  in float v_i; in float v_depth; in float v_imp; uniform float u_min; uniform float u_glow; uniform float u_alpha; uniform float u_pulse;
  out vec4 o;
  void main(){
    if (v_imp < u_min) discard;
    float a = u_alpha * (0.35 + 0.65 * v_depth);
    vec3 base = vec3(1.0);
    vec3 hot = vec3(1.0, 0.93, 0.35);
    float k = clamp(v_i * u_pulse, 0.0, 1.0);
    vec3 c = mix(base, hot, k);
    float al = clamp(a + k * 0.9, 0.0, 1.0);
    if (u_glow > 0.5) { if (k < 0.55) discard; al = (k - 0.5) * 0.12; c = hot; }
    o = vec4(c * al, al);
  }`;
  function sh(t, s) { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; }
  const pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
  gl.useProgram(pr);
  const U = {}; ["u_rot", "u_scale", "u_pan", "u_time", "u_alpha", "u_pulse", "u_off", "u_min", "u_glow"].forEach((n) => (U[n] = gl.getUniformLocation(pr, n)));
  const L = { pos: gl.getAttribLocation(pr, "a_pos"), dist: gl.getAttribLocation(pr, "a_dist"), nid: gl.getAttribLocation(pr, "a_nid"), imp: gl.getAttribLocation(pr, "a_imp") };
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  async function get(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(url);
    const s = r.body.pipeThrough(new DecompressionStream("gzip"));
    return new Response(s).arrayBuffer();
  }
  async function loadLevel(p) {
    const [pos, dist, nid, idx, imp] = await Promise.all(["pos", "dist", "nid", "idx", "imp"].map((k) => get(`data/${p}_${k}.bin.gz`)));
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const buf = (data, loc, size, type, norm) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, type, norm, 0, 0); };
    const pa = new Int16Array(pos); buf(pa, L.pos, 3, gl.SHORT, false);
    buf(new Uint16Array(dist), L.dist, 1, gl.UNSIGNED_SHORT, true);
    buf(new Uint16Array(nid), L.nid, 1, gl.UNSIGNED_SHORT, false);
    buf(new Uint8Array(imp), L.imp, 1, gl.UNSIGNED_BYTE, true);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);
    return { vao, n: idx.byteLength / 4, pos: pa };
  }

  let coarse = null, detail = null, detailLoading = false;
  let yaw = 0.6, pitch = 0.25, zoom = 1, panx = 0, pany = 0, autoSpin = true;
  let W = 1, H = 1, dpr = 1;
  const wide = () => W > 700;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    gl.viewport(0, 0, cv.width, cv.height);
  }
  window.addEventListener("resize", resize); resize();

  const base = () => wide() ? 1.38 : 1.08; // fraction of half-height used at zoom 1
  function fit() { zoom = 1; panx = 0; pany = 0; }
  $("fit").onclick = () => { fly = null; fit(); hint.classList.remove("gone"); };

  function rotMat() {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    // rotate about Y (yaw) then X (pitch); column-major mat3
    return new Float32Array([cy, sy * sp, -sy * cp, 0, cp, sp, sy, -cy * sp, cy * cp]);
  }

  // input
  const ptrs = new Map(); let last = null, pinch = null, moved = 0;
  const hint = $("hint");
  function touched() { autoSpin = false; fly = null; hint.classList.add("gone"); }
  function zoomAt(k, sx, sy) {
    const nz = Math.min(60, Math.max(1, zoom * k)); k = nz / zoom; zoom = nz;
    const nx = (sx / W) * 2 - 1, ny = 1 - (sy / H) * 2;
    panx = nx - (nx - panx) * k; pany = ny - (ny - pany) * k;
  }
  cv.addEventListener("pointerdown", (e) => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); last = null; pinch = null; touched(); });
  cv.addEventListener("pointermove", (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 1) {
      if (e.shiftKey || e.buttons === 2) { panx += (dx / W) * 2; pany -= (dy / H) * 2; }
      else { yaw += dx * 0.006; pitch = Math.max(-1.5, Math.min(1.5, pitch + dy * 0.006)); }
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (pinch) { zoomAt(d / pinch.d, mx, my); panx += ((mx - pinch.x) / W) * 2; pany -= ((my - pinch.y) / H) * 2; }
      pinch = { d, x: mx, y: my };
    }
  });
  const up = (e) => { ptrs.delete(e.pointerId); pinch = null; };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("contextmenu", (e) => e.preventDefault());
  cv.addEventListener("wheel", (e) => { e.preventDefault(); touched(); zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), e.clientX, e.clientY); }, { passive: false });
  cv.addEventListener("dblclick", (e) => { touched(); zoomAt(2.2, e.clientX, e.clientY); });

  // info box
  const credit = $("credit"), about = $("about"), app = document.querySelector(".neuron-app");
  function closeCredit() { credit.hidden = true; app.classList.remove("open"); about.setAttribute("aria-expanded", "false"); }
  about.onclick = () => { const o = credit.hidden; credit.hidden = !o; app.classList.toggle("open", o); about.setAttribute("aria-expanded", String(o)); };
  $("closeCredit").onclick = closeCredit;
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeCredit(); });

  function pass(l) {
    const px = 0.6 * 2 / W, py = 0.6 * 2 / H;
    const tiers = [[0, 0, 0, 0], [0.6, 1, 0, 0], [0.6, -1, 0, 0], [0.85, 0, 1, 0], [0.85, 0, -1, 0]];
    for (const [mn, ox, oy] of tiers) {
      gl.uniform1f(U.u_min, mn);
      gl.uniform2f(U.u_off, ox * px, oy * py);
      gl.drawElements(gl.LINES, l.n, gl.UNSIGNED_INT, 0);
    }
    if (l === coarse && zoom < 12) {
      gl.uniform1f(U.u_glow, 1); gl.uniform1f(U.u_min, 0);
      for (const [ox, oy] of [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]]) {
        gl.uniform2f(U.u_off, ox * px, oy * py);
        gl.drawElements(gl.LINES, l.n, gl.UNSIGNED_INT, 0);
      }
      gl.uniform1f(U.u_glow, 0);
    }
  }
  let fly = null;
  function easeIO(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  async function dive() {
    touched();
    if (!detail && !detailLoading) { detailLoading = true; try { detail = await loadLevel("d"); } catch (e) { return; } }
    let tries = 0; while (!detail && tries++ < 100) await new Promise((r) => setTimeout(r, 100));
    if (!detail) return;
    const n = detail.pos.length / 3, i = Math.floor(Math.random() * n) * 3;
    const a = [detail.pos[i] / 32000, detail.pos[i + 1] / 32000, detail.pos[i + 2] / 32000];
    fly = { t: performance.now(), dur: 4500, a, z0: zoom, z1: 28, px0: panx, py0: pany };
  }
  $("dive").onclick = dive;
  function flyStep(now) {
    if (!fly) return;
    const e = easeIO(Math.min(1, (now - fly.t) / fly.dur));
    zoom = Math.exp(Math.log(fly.z0) * (1 - e) + Math.log(fly.z1) * e);
    const r = rotMat(), a = fly.a;
    const x = r[0] * a[0] + r[3] * a[1] + r[6] * a[2], y = r[1] * a[0] + r[4] * a[1] + r[7] * a[2];
    const m = Math.min(W, H), s = base() * zoom;
    panx = fly.px0 * (1 - e) + -x * ((s * m) / W) * e;
    pany = fly.py0 * (1 - e) + -y * ((s * m) / H) * e;
    if (now - fly.t > fly.dur) fly = null;
  }
  let t0 = performance.now(), prev = t0;
  function draw(now) {
    requestAnimationFrame(draw);
    const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
    if (autoSpin) yaw += dt * 0.12;
    flyStep(now);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    if (!coarse) return;
    const s = base() * zoom;
    const m = Math.min(W, H), sx = (s * m) / W, sy = (s * m) / H;
    const cyShift = wide() ? -0.06 : 0;
    gl.uniformMatrix3fv(U.u_rot, false, rotMat());
    gl.uniform2f(U.u_scale, sx, sy);
    gl.uniform2f(U.u_pan, panx, pany + cyShift * (1 - 0));
    gl.uniform1f(U.u_time, (now - t0) / 1000);
    // coarse
    const zf = Math.min(1, Math.max(0, (zoom - 2) / 6));
    gl.bindVertexArray(coarse.vao);
    gl.uniform1f(U.u_alpha, (0.15 - 0.05 * zf) * (wide() ? 1 : 0.55));
    gl.uniform1f(U.u_pulse, 1);
    pass(coarse);
    if (zoom > 2.2 && !detail && !detailLoading) {
      detailLoading = true;
      loadLevel("d").then((l) => (detail = l)).catch(() => {});
    }
    if (detail) {
      gl.bindVertexArray(detail.vao);
      gl.uniform1f(U.u_alpha, (wide() ? 0.42 : 0.3) * Math.max(0, Math.min(1, (zoom - 1.8) / 3)));
      pass(detail);
    }
  }
  loadLevel("c").then((l) => { coarse = l; }).catch(() => { $("offline").hidden = false; });
  requestAnimationFrame(draw);
})();

(function () {
  function fit() {
    var e = document.querySelector("h1 .eyebrow"), r = e && e.parentNode; if (!e) return;
    e.textContent = window.innerWidth < 500 ? "Fruit fly" : "Fruit fly connectome";
    var h = parseFloat(getComputedStyle(r).fontSize), gap = h * 0.11, pad = h * 0.07;
    e.style.left = gap + "px"; e.style.fontSize = "";
    var fs = parseFloat(getComputedStyle(e).fontSize), n = e.scrollWidth - fs * 0.16;
    var t = r.offsetWidth - gap - pad;
    var k = 0.82; e.style.fontSize = (fs * t * k / n) + "px"; e.style.left = (gap + t * (1 - k) / 2) + "px";
  }
  window.addEventListener("load", fit); window.addEventListener("resize", fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
})();
