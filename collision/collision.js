(function(){
const $=id=>document.getElementById(id),cv=$('field'),main=document.querySelector('main');
$('about').onclick=()=>{const o=$('credit').hidden;$('credit').hidden=!o;$('about').setAttribute('aria-expanded',o);main.classList.toggle('open',o)};
$('closeCredit').onclick=()=>$('about').click();
const fail=()=>{$('offline').hidden=false;$('part').textContent=''};
const gl=cv.getContext('webgl2',{alpha:true,antialias:true,premultipliedAlpha:true});
if(!gl)return fail();
const calm=matchMedia('(prefers-reduced-motion:reduce)').matches;

const prog=(v,f)=>{const p=gl.createProgram();for(const[t,s]of[[gl.VERTEX_SHADER,v],[gl.FRAGMENT_SHADER,f]]){
  const o=gl.createShader(t);gl.shaderSource(o,'#version 300 es\nprecision highp float;\n'+s);gl.compileShader(o);
  if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))console.error(gl.getShaderInfoLog(o));gl.attachShader(p,o)}
  gl.linkProgram(p);const u={};return{p,u:n=>u[n]??(u[n]=gl.getUniformLocation(p,n))}};
/* shared camera: detector z is the beam, y is up */
const CAM=`uniform mat3 R;uniform vec3 target;uniform vec2 S,shift;
vec4 project(vec3 p){vec3 v=R*(p-target);float w=(24.-v.z)/24.;return vec4(v.xy*S+shift*w,0.,w);}`;
const lineP=prog(CAM+`layout(location=0) in vec3 a;layout(location=1) in vec3 b;layout(location=2) in vec2 s;
uniform vec2 view;uniform float width;out float vs,side;
void main(){int i=gl_VertexID;float end=float(i&1),k=(i<2?-1.:1.);
 vec4 A=project(a),B=project(b),P=end>.5?B:A;
 vec2 d=(B.xy/B.w-A.xy/A.w)*view;d=length(d)>1e-4?normalize(d):vec2(1,0);
 P.xy+=vec2(-d.y,d.x)*k*(width+1.)/view*P.w;gl_Position=P;vs=end>.5?s.y:s.x;side=k*(width+1.);}`,
`in float vs,side;uniform vec4 color;uniform float reveal,dash,width,soft;out vec4 o;
void main(){if(vs>reveal||(dash>0.&&fract(vs/dash)>.55))discard;
 float e=mix(clamp(width+.5-abs(side),0.,1.),pow(max(1.-abs(side)/(width+1.),0.),2.),soft);
 float a=color.a*e;o=vec4(color.rgb*a,a);}`);
const pointP=prog(CAM+`layout(location=0) in vec3 p;uniform float size;void main(){gl_Position=project(p);gl_PointSize=size;}`,
`uniform vec4 color;out vec4 o;void main(){if(length(gl_PointCoord-.5)>.5)discard;o=vec4(color.rgb*color.a,color.a);}`);
const solidP=prog(CAM+`layout(location=0) in vec3 p;layout(location=1) in float a;out float va,vd;
void main(){gl_Position=project(p);va=a;vd=length(p);}`,
`in float va,vd;uniform vec3 color;uniform float reveal;out vec4 o;void main(){if(vd>reveal*1.3)discard;o=vec4(color*va,va);}`);

/* geometry builders */
function buffer(data,attribs,stride,divisor){const vao=gl.createVertexArray();gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());const b=gl.getParameter(gl.ARRAY_BUFFER_BINDING);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
  attribs.forEach(([n,off],i)=>{gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,n,gl.FLOAT,false,stride*4,off*4);gl.vertexAttribDivisor(i,divisor)});
  gl.bindVertexArray(null);return{vao,buf:b,count:data.length/stride}}
const lines=d=>buffer(d,[[3,0],[3,3],[2,6]],8,1),points=d=>buffer(d,[[3,0]],3,0),solids=d=>buffer(d,[[3,0],[1,3]],4,0);
const metres=a=>a.map(v=>v/1000);
const triples=a=>{const out=[];for(let i=0;i<a.length;i+=3)out.push([a[i]/1000,a[i+1]/1000,a[i+2]/1000]);return out};
function path(out,pts){let s=Math.hypot(...pts[0]);for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],t=s+Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);out.push(...a,...b,s,t);s=t}}
const seg=(out,a,b)=>out.push(...a,...b,Math.hypot(...a),Math.hypot(...b));
/* corners 0-3 front, 4-7 back */
const EDGES=[0,1,1,2,2,3,3,0,4,5,5,6,6,7,7,4,0,4,1,5,2,6,3,7];
const FACES=[0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0];

const LAYERS=['Tracks','Hits','Energy','Muon system','Jets','Missing'],on=LAYERS.map(()=>true);
LAYERS.forEach((n,i)=>{const b=document.createElement('button');b.textContent=n;b.setAttribute('aria-pressed',true);
  b.onclick=()=>{on[i]=!on[i];b.setAttribute('aria-pressed',on[i]);dirty=true};$('layers').appendChild(b)});

function build(d){
  const g={};
  const L=[];d.tracks.forEach(t=>{t.pts=triples(t.p);path(L,t.pts)});g.tracks=lines(L);
  const strong=[];d.tracks.forEach(t=>{if(t.pt>=2)path(strong,t.pts)});g.strong=lines(strong);
  g.key=['muon','em'].map(k=>{const o=[];d.key.forEach(p=>{p.pts=triples(p.p);if((p.kind==='muon')===(k==='muon'))path(o,p.pts)});return lines(o)});
  const om=[],oe=[];d.others.forEach(p=>{p.pts=triples(p.p);path(p.kind==='muon'?om:oe,p.pts)});g.otherMu=lines(om);g.otherEm=lines(oe);
  g.strip=points(metres(d.strip));g.pixel=points(metres(d.pixel));g.on=points(metres(d.onhits));g.vtx=points(metres(d.vtx));
  const E=[];
  for(const[sys,cells]of Object.entries(d.calo))for(const c of cells){
    const e=c[0]/100;if(e<=0)continue;const P=triples(c.slice(1)),f=P.slice(0,4),b=P.slice(4);
    const mid=q=>[0,1,2].map(i=>(q[0][i]+q[1][i]+q[2][i]+q[3][i])/4),F=mid(f),B=mid(b);
    const dir=[0,1,2].map(i=>B[i]-F[i]),n=Math.hypot(...dir)||1;
    const hadron=sys[0]==='H',len=sys==='ES'?.04:.04+Math.min(e,60)*.022,alpha=Math.min(.85,(.07+Math.sqrt(e)*.13)*(hadron?.6:1));
    const V=[...f,...f.map(p=>[0,1,2].map(i=>p[i]+dir[i]/n*len))];
    for(const i of FACES)E.push(...V[i],alpha*(i<4?.6:1));
  }
  g.energy=solids(E);
  const C=[];d.chambers.forEach(c=>{const P=triples(c);for(let i=0;i<EDGES.length;i+=2)seg(C,P[EDGES[i]],P[EDGES[i+1]])});g.chambers=lines(C);
  const M=[];d.segs.forEach(s=>{const P=triples(s);seg(M,P[0],P[1])});g.segs=lines(M);
  const J=[],JL=[];
  d.jets.forEach(([et,th,ph])=>{const u=[Math.sin(th)*Math.cos(ph),Math.sin(th)*Math.sin(ph),Math.cos(th)],len=Math.min(3,.9+et*.025),
    a=Math.abs(u[2])<.9?[-u[1],u[0],0]:[0,-u[2],u[1]],an=Math.hypot(...a),e1=a.map(v=>v/an),
    e2=[u[1]*e1[2]-u[2]*e1[1],u[2]*e1[0]-u[0]*e1[2],u[0]*e1[1]-u[1]*e1[0]];
    const rim=k=>[0,1,2].map(i=>len*(u[i]+.17*(Math.cos(k*Math.PI/12)*e1[i]+Math.sin(k*Math.PI/12)*e2[i])));
    for(let k=0;k<24;k++){J.push(0,0,0,.2,...rim(k),.05,...rim(k+1),.05);seg(JL,rim(k),rim(k+1))}});
  g.jets=solids(J);g.jetRim=lines(JL);
  const[pt,px,py]=d.met,A=[],ml=Math.min(3.2,.4+pt*.045),ux=px/(pt||1),uy=py/(pt||1),tip=[ux*ml,uy*ml,0];
  seg(A,[0,0,0],tip);g.met=lines(A);const H=[];for(const k of[-1,1])seg(H,tip,[tip[0]-ux*.22-uy*.12*k,tip[1]-uy*.22+ux*.12*k,0]);g.metHead=lines(H);
  d.g=g;return d;
}
/* faint rings at the calorimeter radii, read from the first event's own cells */
let guides=null;
function makeGuides(d){const radius=k=>{const r=d.calo[k].map(c=>Math.hypot(c[1],c[2])/1000).sort((a,b)=>a-b);return r[r.length>>1]};
  const z=Math.max(...d.calo.EB.map(c=>Math.abs(c[3])))/1000,out=[];
  for(const[r,h]of[[radius('EB'),z],[radius('HB'),z*1.4]]){
    for(const s of[-h,0,h])for(let i=0;i<96;i++){const a=i/96*6.2832,b=(i+1)/96*6.2832;out.push(r*Math.cos(a),r*Math.sin(a),s,r*Math.cos(b),r*Math.sin(b),s,0,0)}
    for(let i=0;i<8;i++){const a=i/8*6.2832;out.push(r*Math.cos(a),r*Math.sin(a),-h,r*Math.cos(a),r*Math.sin(a),h,0,0)}}
  out.push(0,0,-7,0,0,7,0,0);return lines(out)}

/* view */
const home={yaw:.85,pitch:.3,zoom:1};
let yaw=home.yaw,pitch=home.pitch,zoom=1,target=[0,0,0],goal=null,idle=true,dirty=true,reveal=0,index=0,count=13,ev=null,picked=null,W,H,dpr,t0=0;
const cache=[];
const matrix=()=>{const c=Math.cos(yaw),s=Math.sin(yaw),a=Math.cos(pitch),b=Math.sin(pitch);
  return[[c,0,-s],[-b*s,a,-b*c],[a*s,b,a*c]]};
const scale=()=>{const k=Math.min(W,H*.62)/6.4*zoom;return[2*k/W,2*k/H]};
const shiftY=()=>W<700?.03:0;
function size(){dpr=Math.min(devicePixelRatio||1,2);W=cv.clientWidth;H=cv.clientHeight;cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);dirty=true}
function pan(dx,dy){const M=matrix(),S=scale(),x=-dx*2/W/S[0],y=dy*2/H/S[1];for(let i=0;i<3;i++)target[i]+=M[0][i]*x+M[1][i]*y}
function zoomAt(f,x,y){const z=Math.max(.35,Math.min(40,zoom*f)),r=z/zoom,ox=x-W/2,oy=y-H*(1-shiftY())/2;pan(ox*(1/r-1),oy*(1/r-1));zoom=z;dirty=true}
const touches=new Map();let moved=0,two=false;
let rest=0;
const start=()=>{idle=false;goal=null;clearTimeout(rest);$('hint').classList.add('gone')};
/* spin again a few seconds after the last touch, unless zoomed in to look closely */
const resume=ms=>{clearTimeout(rest);rest=setTimeout(()=>{if(!touches.size&&zoom<2)idle=true},ms)};
const turn=()=>{yaw=home.yaw+Math.atan2(Math.sin(yaw-home.yaw),Math.cos(yaw-home.yaw))};
cv.onpointerdown=e=>{start();cv.setPointerCapture(e.pointerId);touches.set(e.pointerId,[e.clientX,e.clientY,e.shiftKey]);if(touches.size===1){moved=0;two=false}else two=true};
cv.onpointermove=e=>{const o=touches.get(e.pointerId);if(!o)return;const dx=e.clientX-o[0],dy=e.clientY-o[1];moved+=Math.abs(dx)+Math.abs(dy);
  if(touches.size===1){if(o[2])pan(dx,dy);else{yaw+=dx*.008;pitch=Math.max(-1.55,Math.min(1.55,pitch+dy*.006))}}
  else if(touches.size===2){const q=[...touches].find(([id])=>id!==e.pointerId)[1];
    const before=Math.hypot(o[0]-q[0],o[1]-q[1]),after=Math.hypot(e.clientX-q[0],e.clientY-q[1]);
    if(before>10)zoomAt(after/before,(e.clientX+q[0])/2,(e.clientY+q[1])/2);pan(dx/2,dy/2)}
  o[0]=e.clientX;o[1]=e.clientY;dirty=true};
cv.onpointerup=e=>{if(touches.size===1&&!two&&moved<8)pick(e.clientX,e.clientY);touches.delete(e.pointerId)};
cv.onpointercancel=e=>{touches.delete(e.pointerId);resume(4000)};
cv.addEventListener('pointerup',()=>resume(4000));
cv.addEventListener('wheel',e=>{e.preventDefault();start();zoomAt(Math.exp(-e.deltaY*.0015),e.clientX,e.clientY);resume(4000)},{passive:false});

function screen(p){const M=matrix(),S=scale(),q=p.map((v,i)=>v-target[i]),v=M.map(r=>r[0]*q[0]+r[1]*q[1]+r[2]*q[2]),w=(24-v[2])/24;
  return[(v[0]*S[0]/w+1)*W/2,(1-(v[1]*S[1]/w+shiftY()))*H/2]}
function pick(x,y){
  if(!ev)return;let best=null,bd=18;
  const all=[...ev.key.map(p=>[p,-6]),...ev.others.map(p=>[p,0]),...(on[0]?ev.tracks.map(p=>[p,0]):[])];
  for(const[p,bonus]of all){let a=screen(p.pts[0]);for(let i=1;i<p.pts.length;i++){const b=screen(p.pts[i]),dx=b[0]-a[0],dy=b[1]-a[1],
    t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1))),d=Math.hypot(x-a[0]-dx*t,y-a[1]-dy*t)+bonus;
    if(d<bd){bd=d;best=p}a=b}}
  picked=best===picked?null:best;
  if(picked){const o=[];path(o,picked.pts);if(!ev.pick)ev.pick=lines(o);else{gl.bindBuffer(gl.ARRAY_BUFFER,ev.pick.buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(o),gl.STATIC_DRAW);ev.pick.count=o.length/8}}
  label();
}
const NAMES={muon:'Muon',electron:'Electron',photon:'Photon'};
function label(){
  if(!ev)return;$('mass').textContent=ev.mass.toFixed(1);
  if(picked){const k=picked.kind;
    $('part').textContent=(k?NAMES[k]:'Charged particle')+(ev.key.includes(picked)?' in the group':'');
    $('note').textContent=picked.pt+' GeV sideways momentum'+(picked.q?(picked.q>0?' · positive':' · negative'):' · no charge')}
  else{$('part').textContent=ev.label;$('note').textContent='Event '+(index+1)+' of '+count+' · '+ev.year}
  dirty=true;
}
async function show(i){
  index=(i+count)%count;const want=index;$('part').textContent='Loading';$('note').textContent='';
  try{
    if(!cache[want]){const r=await fetch('data/e'+want+'.json?v=1');if(!r.ok)throw 0;cache[want]=build(await r.json())}
  }catch(e){return fail()}
  if(want!==index)return;$('offline').hidden=true;
  ev=cache[want];picked=null;if(!guides)guides=makeGuides(ev);reveal=calm?99:0;t0=0;label();
}
const go=d=>{start();idle=true;show(index+d)};
$('next').onclick=()=>go(1);$('prev').onclick=()=>go(-1);
$('fit').onclick=()=>{start();turn();goal={...home};idle=true};

let S,M;
function camera(P){gl.useProgram(P.p);gl.uniformMatrix3fv(P.u('R'),false,M);gl.uniform3fv(P.u('target'),target);gl.uniform2f(P.u('S'),S[0],S[1]);gl.uniform2f(P.u('shift'),0,shiftY())}
function drawLines(o,color,width,opt={}){if(!o.count)return;camera(lineP);gl.uniform2f(lineP.u('view'),cv.width,cv.height);
  gl.uniform4fv(lineP.u('color'),color);gl.uniform1f(lineP.u('width'),width*dpr/2);gl.uniform1f(lineP.u('reveal'),opt.still?1e3:reveal);
  gl.uniform1f(lineP.u('dash'),opt.dash||0);gl.uniform1f(lineP.u('soft'),opt.soft||0);
  gl.bindVertexArray(o.vao);gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,o.count)}
function drawPoints(o,color,size){if(!o.count)return;camera(pointP);gl.uniform4fv(pointP.u('color'),color);gl.uniform1f(pointP.u('size'),size*dpr);gl.bindVertexArray(o.vao);gl.drawArrays(gl.POINTS,0,o.count)}
function drawSolid(o,color){if(!o.count)return;camera(solidP);gl.uniform3fv(solidP.u('color'),color);gl.uniform1f(solidP.u('reveal'),reveal);gl.bindVertexArray(o.vao);gl.drawArrays(gl.TRIANGLES,0,o.count)}
const white=a=>[1,1,1,a],ink=a=>[.07,.07,.09,a],RED=[.86,.13,.16],YEL=[1,.9,0];
function render(){
  const m=matrix();M=new Float32Array([m[0][0],m[1][0],m[2][0],m[0][1],m[1][1],m[2][1],m[0][2],m[1][2],m[2][2]]);S=scale();
  gl.viewport(0,0,cv.width,cv.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  if(!ev)return;const g=ev.g,near=Math.min(2.2,Math.sqrt(zoom));
  drawLines(guides,white(.13),1,{still:1});
  if(on[4]){drawSolid(g.jets,[1,1,1]);drawLines(g.jetRim,white(.3),1)}
  if(on[3]){drawLines(g.chambers,white(.2),1);drawLines(g.segs,ink(.8),2)}
  if(on[2])drawSolid(g.energy,[.97,1,1]);
  if(on[1]){drawPoints(g.strip,white(.28),1.3*near);drawPoints(g.pixel,white(.5),1.5*near);drawPoints(g.on,ink(.35),1.4*near)}
  if(on[0]){drawLines(g.tracks,white(.3),1);drawLines(g.strong,white(.8),1.4)}
  drawLines(g.otherMu,white(.75),1.6);drawLines(g.otherEm,white(.55),1.2);
  if(on[5]){drawLines(g.met,ink(.9),2.5,{dash:.16});drawLines(g.metHead,ink(.9),2.5,{still:1})}
  [RED,YEL].forEach((c,i)=>{drawLines(g.key[i],[...c,.45],14,{soft:1});drawLines(g.key[i],[...c,1],3.2,{dash:i&&ev.label==='Two photons'?.12:0})});
  drawPoints(g.vtx,white(.95),3.5*near);
  if(picked){drawLines(ev.pick,ink(.85),7,{still:1});drawLines(ev.pick,white(1),3,{still:1})}
}
function frame(now){
  if(goal){const k=.14;yaw+=(goal.yaw-yaw)*k;pitch+=(goal.pitch-pitch)*k;zoom+=(goal.zoom-zoom)*k;target=target.map(v=>v*(1-k));dirty=true;
    if(Math.abs(zoom-goal.zoom)<.002&&Math.abs(yaw-goal.yaw)<.002)goal=null}
  if(idle&&!goal&&!calm){yaw+=.0014;dirty=true}
  /* the collision opens outward from the middle */
  if(ev&&reveal<16){if(!t0)t0=now;const t=(now-t0)/1000;reveal=Math.max(reveal,t*t*1.6+t*.8);dirty=true}
  if(dirty){dirty=false;render()}
  requestAnimationFrame(frame);
}
addEventListener('resize',size);size();requestAnimationFrame(frame);show(0);
})();
