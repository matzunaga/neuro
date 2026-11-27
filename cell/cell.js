(async function(){
const $=id=>document.getElementById(id),cv=$('field'),main=document.querySelector('main');
$('about').onclick=()=>{const o=$('credit').hidden;$('credit').hidden=!o;$('about').setAttribute('aria-expanded',o);main.classList.toggle('open',o)};
$('closeCredit').onclick=()=>$('about').click();
const fail=()=>{$('offline').hidden=false;$('part').textContent=''};
const gl=cv.getContext('webgl2',{alpha:true,antialias:true,premultipliedAlpha:true});
let meta,data;
try{
  if(!gl)throw 0;
  meta=await fetch('data/meta.json?v=2').then(r=>r.json());
  const r=await fetch('data/mesh.bin.gz?v=2');if(!r.ok)throw 0;
  data=await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}catch(e){return fail()}

/* unpack: positions, delta coded triangles, then smooth normals */
let off=0;
const meshes=meta.parts.map(p=>{
  const P=new Int16Array(data,off,p.verts*3);off+=Math.ceil(p.verts*6/4)*4;
  const D=new Int32Array(data,off,p.tris*4);off+=p.tris*16;
  const I=new Uint32Array(p.tris*3),T=p.tris;let a=0;
  for(let i=0;i<T;i++){a+=D[i];I[i*3]=a+D[T+i];I[i*3+1]=a+D[2*T+i];I[i*3+2]=a+D[3*T+i]}
  const N=new Float32Array(p.verts*3);
  for(let i=0;i<I.length;i+=3){const x=I[i]*3,y=I[i+1]*3,z=I[i+2]*3;
    const ux=P[y]-P[x],uy=P[y+1]-P[x+1],uz=P[y+2]-P[x+2],vx=P[z]-P[x],vy=P[z+1]-P[x+1],vz=P[z+2]-P[x+2];
    const nx=(uy*vz-uz*vy)/1e4,ny=(uz*vx-ux*vz)/1e4,nz=(ux*vy-uy*vx)/1e4;
    for(const k of[x,y,z]){N[k]+=nx;N[k+1]+=ny;N[k+2]+=nz}}
  const vao=gl.createVertexArray();gl.bindVertexArray(vao);
  const buf=(t,d)=>{const b=gl.createBuffer();gl.bindBuffer(t,b);gl.bufferData(t,d,gl.STATIC_DRAW)};
  buf(gl.ARRAY_BUFFER,P);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.SHORT,false,0,0);
  buf(gl.ARRAY_BUFFER,N);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,0,0);
  buf(gl.ELEMENT_ARRAY_BUFFER,I);gl.bindVertexArray(null);
  return{vao,count:I.length};
});

const prog=(v,f)=>{const p=gl.createProgram();for(const[t,s]of[[gl.VERTEX_SHADER,v],[gl.FRAGMENT_SHADER,f]]){
  const o=gl.createShader(t);gl.shaderSource(o,'#version 300 es\nprecision highp float;\n'+s);gl.compileShader(o);
  if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))console.error(gl.getShaderInfoLog(o));gl.attachShader(p,o)}
  gl.linkProgram(p);const u={};return{p,u:n=>u[n]??(u[n]=gl.getUniformLocation(p,n))}};
const solid=prog(`layout(location=0) in vec3 p;layout(location=1) in vec3 n;
uniform mat3 R;uniform vec3 target;uniform vec2 S,shift;out vec3 vn;out float vz;
void main(){vec3 v=R*(p/32000.-target);vn=R*n;vz=v.z;gl_Position=vec4(v.xy*S+shift,-v.z*.5,1.);}`,
`in vec3 vn;in float vz;uniform vec3 base;uniform float alpha;uniform int mode;out vec4 o;
void main(){
 if(mode==2){o=vec4(base,1.);return;}
 vec3 n=normalize(vn);if(n.z<0.)n=-n;
 float rim=pow(1.-n.z,2.2);
 if(mode==1){float a=alpha*(.06+rim);o=vec4(base*a,a);return;}
 float key=max(dot(n,normalize(vec3(-.5,.65,.55))),0.),fill=max(dot(n,normalize(vec3(.8,-.2,.4))),0.);
 float spec=pow(max(dot(n,normalize(vec3(-.28,.38,.88))),0.),40.);
 vec3 shade=mix(vec3(.03,.30,.45),vec3(.30,.70,.84),clamp(.35+.5*fill+.3*n.y,0.,1.));
 vec3 c=mix(shade,base,clamp(key*.85+.08,0.,1.));
 c+=rim*.6*mix(vec3(1.),base,.35)+spec*.35;
 c*=mix(.78,1.08,clamp(vz*3.+.5,0.,1.));
 o=vec4(c,1.);}`);
/* soft shadow in creases, then blur away from the focus depth */
const post=prog(`out vec2 uv;void main(){vec2 q=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=q;gl_Position=vec4(q*2.-1.,0.,1.);}`,
`in vec2 uv;uniform sampler2D C,D;uniform vec2 px;uniform float zoom;out vec4 o;
float ao(vec2 at){float d=texture(D,at).r;if(d>.99999)return 1.;float s=0.;
 for(int i=0;i<12;i++){float a=float(i)*2.39996,r=(2.+float(i)*1.3);vec2 q=at+vec2(cos(a),sin(a))*r*px;
  float diff=(d-texture(D,q).r)*zoom;s+=smoothstep(.0008,.008,diff)*(1.-smoothstep(.03,.09,diff));}
 return 1.-s/12.*.8;}
void main(){
 float d=texture(D,uv).r;float coc=d>.99999?1.5:clamp((abs(d-.5)*zoom-.012)*26.,0.,4.5);
 vec4 sum=texture(C,uv);float a0=ao(uv);sum.rgb*=a0;float n=1.;
 for(int i=1;i<17;i++){float a=float(i)*2.39996,r=sqrt(float(i)/16.)*coc;
  vec4 c=texture(C,uv+vec2(cos(a),sin(a))*r*px);c.rgb*=a0;sum+=c;n+=1.;}
 o=sum/n;}`);

let fb,ms,colorTex,depthTex,msC,msD,W,H,dpr,cw,ch;
function size(){
  dpr=Math.min(devicePixelRatio||1,2);W=cv.clientWidth;H=cv.clientHeight;cw=cv.width=Math.round(W*dpr);ch=cv.height=Math.round(H*dpr);
  [colorTex,depthTex].forEach(t=>t&&gl.deleteTexture(t));[fb,ms].forEach(f=>f&&gl.deleteFramebuffer(f));[msC,msD].forEach(r=>r&&gl.deleteRenderbuffer(r));
  const tex=(f,filter)=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texStorage2D(gl.TEXTURE_2D,1,f,cw,ch);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t};
  colorTex=tex(gl.RGBA8,gl.LINEAR);depthTex=tex(gl.DEPTH_COMPONENT24,gl.NEAREST);
  fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,colorTex,0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,depthTex,0);
  const s=Math.min(4,gl.getParameter(gl.MAX_SAMPLES));
  const rb=f=>{const r=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,r);gl.renderbufferStorageMultisample(gl.RENDERBUFFER,s,f,cw,ch);return r};
  msC=rb(gl.RGBA8);msD=rb(gl.DEPTH_COMPONENT24);ms=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,ms);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.RENDERBUFFER,msC);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,msD);
  dirty=true;
}

/* view */
const home={yaw:.25,pitch:.85,zoom:1,t:[0,0,0]};
let yaw=home.yaw,pitch=home.pitch,zoom=1,target=[0,0,0],sel=-1,dirty=true,idle=true,goal=null;
const calm=matchMedia('(prefers-reduced-motion:reduce)').matches;
const matrix=()=>{const c=Math.cos(yaw),s=Math.sin(yaw),a=Math.cos(pitch),b=Math.sin(pitch);
  /* data z is the thin axis of the block, pointing up */
  return[[c,-s,0],[s*a,c*a,b],[-s*b,-c*b,a]]};
const col=M=>new Float32Array([M[0][0],M[1][0],M[2][0],M[0][1],M[1][1],M[2][1],M[0][2],M[1][2],M[2][2]]);
const scale=()=>{const k=Math.min(.96,.7*H/W)*zoom;return[k,k*W/H]};
const shiftY=()=>W<700?.08:0;
/* move the pivot by a screen distance in pixels */
function pan(dx,dy){const M=matrix(),S=scale(),x=-dx*2/W/S[0],y=dy*2/H/S[1];for(let i=0;i<3;i++)target[i]+=M[0][i]*x+M[1][i]*y}
function zoomAt(f,x,y){const z=Math.max(.7,Math.min(30,zoom*f)),r=z/zoom;
  const ox=x-W/2,oy=y-H*(1-shiftY())/2;pan(ox*(1/r-1),oy*(1/r-1));zoom=z;dirty=true}

const touches=new Map();let moved=0,two=false;
const start=()=>{idle=false;goal=null;$('hint').classList.add('gone')};
cv.onpointerdown=e=>{start();cv.setPointerCapture(e.pointerId);touches.set(e.pointerId,[e.clientX,e.clientY,e.shiftKey]);if(touches.size===1){moved=0;two=false}else two=true};
cv.onpointermove=e=>{const o=touches.get(e.pointerId);if(!o)return;const dx=e.clientX-o[0],dy=e.clientY-o[1];moved+=Math.abs(dx)+Math.abs(dy);
  if(touches.size===1){if(o[2])pan(dx,dy);else{yaw+=dx*.008;pitch=Math.max(0,Math.min(1.55,pitch+dy*.006))}}
  else if(touches.size===2){const other=[...touches].find(([id])=>id!==e.pointerId)[1];
    const before=Math.hypot(o[0]-other[0],o[1]-other[1]),after=Math.hypot(e.clientX-other[0],e.clientY-other[1]);
    if(before>10)zoomAt(after/before,(e.clientX+other[0])/2,(e.clientY+other[1])/2);pan(dx/2,dy/2)}
  o[0]=e.clientX;o[1]=e.clientY;dirty=true};
cv.onpointerup=e=>{if(touches.size===1&&!two&&moved<8)pick(e.clientX,e.clientY);touches.delete(e.pointerId)};
cv.onpointercancel=e=>touches.delete(e.pointerId);
cv.addEventListener('wheel',e=>{e.preventDefault();start();zoomAt(Math.exp(-e.deltaY*.0015),e.clientX,e.clientY)},{passive:false});

const n=meta.parts.length;
function label(){const p=meta.parts[sel];$('part').textContent=p?p.name:'All parts';$('note').textContent=p?p.line:'Tap a part to light it up.';dirty=true}
const step=d=>{start();sel=(sel+1+d+n+1)%(n+1)-1;label()};
$('next').onclick=()=>step(1);$('prev').onclick=()=>step(-1);
$('fit').onclick=()=>{start();sel=-1;label();goal={...home,t:[0,0,0]}};

function use(){const S=scale();gl.useProgram(solid.p);gl.uniformMatrix3fv(solid.u('R'),false,col(matrix()));
  gl.uniform3fv(solid.u('target'),target);gl.uniform2f(solid.u('S'),S[0],S[1]);gl.uniform2f(solid.u('shift'),0,shiftY())}
function mesh(i,mode,c,a){gl.uniform1i(solid.u('mode'),mode);gl.uniform3fv(solid.u('base'),c);gl.uniform1f(solid.u('alpha'),a);
  gl.bindVertexArray(meshes[i].vao);gl.drawElements(gl.TRIANGLES,meshes[i].count,gl.UNSIGNED_INT,0)}
const WHITE=[.96,.99,1],RED=[.86,.13,.16];
const PM=0,ER=2;

function pick(x,y){
  gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.viewport(0,0,cw,ch);gl.clearColor(0,0,0,0);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.disable(gl.BLEND);
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);use();
  for(let i=1;i<n;i++)if(i!==ER)mesh(i,2,[(i+1)/255,0,0],1);
  const b=new Uint8Array(4);gl.readPixels(Math.round(x*dpr),ch-Math.round(y*dpr),1,1,gl.RGBA,gl.UNSIGNED_BYTE,b);
  const hit=b[0]?b[0]-1:-1;sel=hit===sel?-1:hit;label();
}

function render(){
  gl.bindFramebuffer(gl.FRAMEBUFFER,ms);gl.viewport(0,0,cw,ch);gl.clearColor(0,0,0,0);
  gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.disable(gl.BLEND);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);use();
  /* solid forms: everything but the membrane and the folded network, or just the chosen part */
  for(let i=1;i<n;i++){if(sel<0?i!==ER:i===sel)mesh(i,0,i===sel?RED:WHITE,1)}
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER,ms);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,fb);
  gl.blitFramebuffer(0,0,cw,ch,0,0,cw,ch,gl.COLOR_BUFFER_BIT,gl.NEAREST);
  gl.blitFramebuffer(0,0,cw,ch,0,0,cw,ch,gl.DEPTH_BUFFER_BIT,gl.NEAREST);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.disable(gl.DEPTH_TEST);gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(post.p);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,colorTex);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,depthTex);
  gl.uniform1i(post.u('C'),0);gl.uniform1i(post.u('D'),1);gl.uniform2f(post.u('px'),dpr/2/cw*2,dpr/2/ch*2);gl.uniform1f(post.u('zoom'),Math.min(zoom,8));
  gl.bindVertexArray(null);gl.drawArrays(gl.TRIANGLES,0,3);
  gl.activeTexture(gl.TEXTURE0);
  /* see-through layers on top */
  gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);use();
  if(sel<0){mesh(ER,1,WHITE,.045);mesh(PM,1,WHITE,.18)}
  else{for(let i=0;i<n;i++)if(i!==sel)mesh(i,1,WHITE,i===PM?.12:i===ER?.015:.045)}
}
function frame(){
  if(goal){const k=.14;yaw+=(goal.yaw-yaw)*k;pitch+=(goal.pitch-pitch)*k;zoom+=(goal.zoom-zoom)*k;target=target.map((v,i)=>v+(goal.t[i]-v)*k);dirty=true;
    if(Math.abs(zoom-goal.zoom)<.002&&Math.abs(yaw-goal.yaw)<.002)goal=null}
  if(idle&&!calm){yaw+=.0016;dirty=true}
  if(dirty){dirty=false;render();
    const um=meta.um*2/scale()[0];$('depth').textContent=um<10?um.toFixed(1):Math.round(um)}
  requestAnimationFrame(frame);
}
addEventListener('resize',size);size();label();frame();
})();
