(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const cv = $("field");
  const gl = cv.getContext("webgl2", { antialias: true, alpha: true, premultipliedAlpha: true });
  if (!gl) { $("offline").hidden = false; $("offline").textContent = "This page needs WebGL."; return; }

  const VS = `#version 300 es
  in vec3 a_pos; in float a_dist; in float a_nid;
  uniform mat3 u_rot; uniform vec2 u_scale; uniform vec2 u_pan; uniform float u_time; uniform float u_ext;
  out float v_i; out float v_depth;
  float h(float n){ return fract(sin(n*12.9898)*43758.5453); }
  void main(){
    vec3 p = u_rot * (a_pos / 32000.0);
    gl_Position = vec4(p.xy * u_scale + u_pan, p.z * -0.4, 1.0);
    v_depth = p.z * 0.5 + 0.5;
    float sp = (0.10 + 0.22 * h(a_nid + 1.0)) * 0.75;
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
  in float v_i; in float v_depth; uniform float u_alpha; uniform float u_pulse;
  out vec4 o;
  void main(){
    float a = u_alpha * (0.35 + 0.65 * v_depth);
    vec3 base = vec3(1.0);
    vec3 hot = vec3(1.0, 0.93, 0.35);
    float k = clamp(v_i * u_pulse, 0.0, 1.0);
    vec3 c = mix(base, hot, k);
    float al = clamp(a + k * 0.9, 0.0, 1.0);
    o = vec4(c * al, al);
  }`;
  function sh(t, s) { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; }
  const pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
  gl.useProgram(pr);
  const U = {}; ["u_rot", "u_scale", "u_pan", "u_time", "u_alpha", "u_pulse"].forEach((n) => (U[n] = gl.getUniformLocation(pr, n)));
  const L = { pos: gl.getAttribLocation(pr, "a_pos"), dist: gl.getAttribLocation(pr, "a_dist"), nid: gl.getAttribLocation(pr, "a_nid") };
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  async function get(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(url);
    const s = r.body.pipeThrough(new DecompressionStream("gzip"));
    return new Response(s).arrayBuffer();
  }
  async function loadLevel(p) {
    const [pos, dist, nid, idx] = await Promise.all(["pos", "dist", "nid", "idx"].map((k) => get(`data/${p}_${k}.bin.gz`)));
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const buf = (data, loc, size, type, norm) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, type, norm, 0, 0); };
    buf(new Int16Array(pos), L.pos, 3, gl.SHORT, false);
    buf(new Uint16Array(dist), L.dist, 1, gl.UNSIGNED_SHORT, true);
    buf(new Uint16Array(nid), L.nid, 1, gl.UNSIGNED_SHORT, false);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);
    return { vao, n: idx.byteLength / 4 };
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

  const base = () => wide() ? 1.38 : 1.29; // fraction of half-height used at zoom 1
  function fit() { zoom = 1; panx = 0; pany = 0; }
  $("fit").onclick = () => { fit(); };

  function rotMat() {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    // rotate about Y (yaw) then X (pitch); column-major mat3
    return new Float32Array([cy, sy * sp, -sy * cp, 0, cp, sp, sy, -cy * sp, cy * cp]);
  }

  // input
  const ptrs = new Map(); let last = null, pinch = null, moved = 0;
  const hint = $("hint");
  function touched() { autoSpin = false; hint.classList.add("gone"); }
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

  let t0 = performance.now(), prev = t0;
  function draw(now) {
    requestAnimationFrame(draw);
    const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
    if (autoSpin) yaw += dt * 0.12;
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
    gl.uniform1f(U.u_alpha, 0.15 - 0.05 * zf);
    gl.uniform1f(U.u_pulse, 1);
    gl.drawElements(gl.LINES, coarse.n, gl.UNSIGNED_INT, 0);
    if (zoom > 2.2 && !detail && !detailLoading) {
      detailLoading = true;
      loadLevel("d").then((l) => (detail = l)).catch(() => {});
    }
    if (detail) {
      gl.bindVertexArray(detail.vao);
      gl.uniform1f(U.u_alpha, 0.42 * Math.max(0, Math.min(1, (zoom - 1.8) / 3)));
      gl.drawElements(gl.LINES, detail.n, gl.UNSIGNED_INT, 0);
    }
  }
  loadLevel("c").then((l) => { coarse = l; }).catch(() => { $("offline").hidden = false; });
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
