(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const cv = $("field");
  const gl = cv.getContext("webgl2", { antialias: true, alpha: true, premultipliedAlpha: true });
  if (!gl) { $("offline").hidden = false; $("offline").textContent = "This page needs WebGL."; return; }

  const VS = `#version 300 es
  in vec3 a_pos; in float a_grp;
  uniform mat3 u_rot; uniform vec2 u_scale; uniform vec2 u_pan; uniform float u_time; uniform float u_psz; uniform vec3 u_heart;
  out vec3 v_col; out float v_a; out float v_k; out float v_depth;
  float hs(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  void main(){
    vec3 q = a_pos / 32000.0;
    vec3 p = u_rot * q;
    gl_Position = vec4(p.xy * u_scale + u_pan, p.z * -0.4, 1.0);
    v_depth = p.z * 0.5 + 0.5;
    int g = int(a_grp + 0.5);
    vec3 col = vec3(1.0); float al = 0.5; float sz = 1.0;
    if (g == 0) { col = vec3(1.0, 0.99, 0.96); al = 0.62; }
    else if (g == 1) { col = vec3(0.95, 0.98, 1.0); al = 0.16; sz = 0.9; }
    else if (g == 2) { col = vec3(0.86, 1.0, 1.0); al = 0.2; sz = 0.9; }
    else if (g == 3) { col = vec3(1.0, 0.24, 0.18); al = 0.8; sz = 1.1; }
    else if (g == 4) { col = vec3(1.0, 0.91, 0.42); al = 0.55; }
    else if (g == 5) { col = vec3(1.0, 0.97, 0.72); al = 0.75; }
    else { col = vec3(1.0); al = 0.13; sz = 0.8; }
    float yb = mix(-1.1, 1.1, fract(u_time / 10.0));
    float wv = exp(-pow((q.y - yb) / 0.06, 2.0));
    float r = distance(q, u_heart);
    float rr = fract(u_time * 0.7) * 0.55;
    float ring = exp(-pow((r - rr) / 0.03, 2.0)) * (1.0 - rr / 0.6);
    float k = max(wv * 0.85, ring * (g == 3 ? 1.0 : 0.6));
    if (g == 5) { float f = hs(floor(q * 45.0) + floor(u_time * 2.5)); k = max(k, step(0.985, f)); }
    v_k = k; v_col = col; v_a = al;
    gl_PointSize = u_psz * sz * (1.0 + k * 0.8);
  }`;
  const FS = `#version 300 es
  precision mediump float;
  in vec3 v_col; in float v_a; in float v_k; in float v_depth; uniform float u_alpha;
  out vec4 o;
  void main(){
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float edge = smoothstep(0.5, 0.25, d);
    float k = clamp(v_k, 0.0, 1.0);
    vec3 c = mix(v_col, vec3(1.0, 0.93, 0.35), k);
    float al = clamp((v_a * (0.4 + 0.6 * v_depth) + k * 0.8) * u_alpha, 0.0, 1.0) * edge;
    o = vec4(c * al, al);
  }`;
  function sh(t, s) { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; }
  const pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
  gl.useProgram(pr);
  const U = {}; ["u_rot", "u_scale", "u_pan", "u_time", "u_psz", "u_heart", "u_alpha"].forEach((n) => (U[n] = gl.getUniformLocation(pr, n)));
  const L = { pos: gl.getAttribLocation(pr, "a_pos"), grp: gl.getAttribLocation(pr, "a_grp") };
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  const HEART = [-0.054, 0.098, 0.075];

  async function get(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(url);
    return new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  }
  async function load() {
    const [pos, grp] = await Promise.all([get("data/pos.bin.gz"), get("data/grp.bin.gz")]);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const pa = new Int16Array(pos), ga = new Uint8Array(grp);
    let b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, pa, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(L.pos); gl.vertexAttribPointer(L.pos, 3, gl.SHORT, false, 0, 0);
    b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, ga, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(L.grp); gl.vertexAttribPointer(L.grp, 1, gl.UNSIGNED_BYTE, false, 0, 0);
    return { vao, n: ga.length, pos: pa, grp: ga };
  }

  let body = null;
  let yaw = 0.5, pitch = 0.05, zoom = 1, panx = 0, pany = 0, autoSpin = true;
  let W = 1, H = 1, dpr = 1;
  const wide = () => W > 700;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    gl.viewport(0, 0, cv.width, cv.height);
  }
  window.addEventListener("resize", resize); resize();

  const base = () => Math.min(0.88 * H / Math.min(W, H), 1.7);
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
    const nz = Math.min(40, Math.max(1, zoom * k)); k = nz / zoom; zoom = nz;
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

  let fly = null;
  function easeIO(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function dive() {
    touched();
    if (!body) return;
    let i = 0;
    for (let tries = 0; tries < 400; tries++) { i = Math.floor(Math.random() * body.n); const g = body.grp[i]; if (g === 3 || g === 4 || g === 5 || g === 0) break; }
    const a = [body.pos[i * 3] / 32000, body.pos[i * 3 + 1] / 32000, body.pos[i * 3 + 2] / 32000];
    fly = { t: performance.now(), dur: 4500, a, z0: zoom, z1: 12, px0: panx, py0: pany };
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
    if (!body) return;
    const s = base() * zoom;
    const m = Math.min(W, H), sx = (s * m) / W, sy = (s * m) / H;
    gl.uniformMatrix3fv(U.u_rot, false, rotMat());
    gl.uniform2f(U.u_scale, sx, sy);
    gl.uniform2f(U.u_pan, panx, pany);
    gl.uniform1f(U.u_time, (now - t0) / 1000);
    gl.uniform3f(U.u_heart, HEART[0], HEART[1], HEART[2]);
    gl.uniform1f(U.u_psz, Math.min(7, 1.5 + 0.55 * Math.pow(zoom, 0.8)) * dpr);
    gl.uniform1f(U.u_alpha, 1);
    gl.bindVertexArray(body.vao);
    gl.drawArrays(gl.POINTS, 0, body.n);
  }
  load().then((l) => { body = l; }).catch(() => { $("offline").hidden = false; });
  requestAnimationFrame(draw);
})();

(function () {
  function fit() {
    var e = document.querySelector("h1 .eyebrow"), r = e && e.parentNode; if (!e) return;
    e.textContent = "Human CT scan";
    var h = parseFloat(getComputedStyle(r).fontSize), gap = h * 0.11, pad = h * 0.07;
    e.style.left = gap + "px"; e.style.fontSize = "";
    var fs = parseFloat(getComputedStyle(e).fontSize), n = e.scrollWidth - fs * 0.16;
    var t = r.offsetWidth - gap - pad;
    var k = 0.82; e.style.fontSize = (fs * t * k / n) + "px"; e.style.left = (gap + t * (1 - k) / 2) + "px";
  }
  window.addEventListener("load", fit); window.addEventListener("resize", fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
})();
