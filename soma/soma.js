(function(){
const $=id=>document.getElementById(id),cv=$('field'),main=document.querySelector('main');
$('about').onclick=()=>{const o=$('credit').hidden;$('credit').hidden=!o;$('about').setAttribute('aria-expanded',o);main.classList.toggle('open',o)};
$('closeCredit').onclick=()=>$('about').click();
const fail=()=>{$('offline').hidden=false};
const gl=cv.getContext('webgl2',{antialias:true,premultipliedAlpha:true});if(!gl)return fail();
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],len=a=>Math.hypot(a[0],a[1],a[2]),norm=a=>mul(a,1/(len(a)||1));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const clamp=v=>Math.max(0,Math.min(1,v)),smooth=v=>{v=clamp(v);return v*v*(3-2*v)};

/* ---------- geometry ---------- */
const V=[],I=[];
function vert(p,n,k){V.push(p[0],p[1],p[2],n[0],n[1],n[2],k);return V.length/7-1}
const SIDES=10;
function tube(pts,rad,kind){
  const rings=[];let side=null;
  for(let i=0;i<pts.length;i++){
    const t=norm(sub(pts[Math.min(i+1,pts.length-1)],pts[Math.max(i-1,0)]));
    if(!side)side=norm(cross(t,Math.abs(t[1])<.9?[0,1,0]:[1,0,0]));
    else{const s=sub(side,mul(t,dot(side,t)));side=len(s)>1e-4?norm(s):norm(cross(t,[0,0,1]))}
    const up=cross(t,side),ring=[];
    for(let k=0;k<SIDES;k++){const a=k/SIDES*Math.PI*2,n=add(mul(side,Math.cos(a)),mul(up,Math.sin(a)));ring.push(vert(add(pts[i],mul(n,rad[i])),n,kind))}
    rings.push(ring);
  }
  for(let i=0;i+1<rings.length;i++)for(let k=0;k<SIDES;k++){const a=rings[i][k],b=rings[i][(k+1)%SIDES],c=rings[i+1][k],d=rings[i+1][(k+1)%SIDES];I.push(a,b,c,b,d,c)}
  /* rounded caps close both ends */
  for(const[end,dir]of[[0,-1],[pts.length-1,1]]){
    const t=norm(sub(pts[Math.min(end+1,pts.length-1)],pts[Math.max(end-1,0)])),tip=vert(add(pts[end],mul(t,dir*rad[end])),mul(t,dir),kind),ring=rings[end];
    for(let k=0;k<SIDES;k++)dir>0?I.push(ring[k],ring[(k+1)%SIDES],tip):I.push(ring[(k+1)%SIDES],ring[k],tip);
  }
}
const spline=(a,b,c,d,t)=>.5*(2*b+(c-a)*t+(2*a-5*b+4*c-d)*t*t+(3*b-a-3*c+d)*t*t*t);

function build(data){
  const R=data.soma[3];
  const chains=data.chains.map(([type,a])=>{const p=[],r=[];for(let i=0;i<a.length;i+=4){p.push([a[i]/10,a[i+1]/10,a[i+2]/10]);r.push(a[i+3]/100)}return{type,p,r}});
  /* turn the cell so the apical dendrite points up */
  let ay=0,n=0;for(const c of chains)if(c.type===4)for(const p of c.p){ay+=p[1];n++}
  const flip=n&&ay<0?-1:1;
  for(const c of chains)for(const p of c.p){p[1]*=flip;if(flip<0)p[2]*=-1}
  const roots=[];let lo=[1e9,1e9,1e9],hi=[-1e9,-1e9,-1e9];
  for(const c of chains){
    const atBody=len(c.p[0])<.5;
    if(atBody){c.r[0]=c.r[1]||c.r[0];const far=c.p.find(p=>len(p)>R*.8)||c.p[c.p.length-1];roots.push(norm(far))}
    const P=[],Q=[],last=c.p.length-1;
    /* soften the tracing's zigzag; ends stay put so branches stay joined */
    for(let pass=0;pass<2;pass++){const old=c.p.slice();for(let i=1;i<last;i++)c.p[i]=[0,1,2].map(k=>old[i][k]*.5+(old[i-1][k]+old[i+1][k])*.25)}
    for(let i=0;i<last;i++){
      const a=c.p[Math.max(i-1,0)],b=c.p[i],d=c.p[i+1],e=c.p[Math.min(i+2,last)],steps=Math.max(1,Math.min(10,Math.ceil(len(sub(d,b))/1.6)));
      for(let s=0;s<steps;s++){const t=s/steps;P.push([0,1,2].map(k=>spline(a[k],b[k],d[k],e[k],t)));Q.push(c.r[i]+(c.r[i+1]-c.r[i])*t)}
    }
    P.push(c.p[last]);Q.push(c.r[last]);
    for(let i=0;i<P.length;i++){
      /* widen hairline branches; flare where they leave the body */
      Q[i]=Math.max(Q[i]*1.5,.65)+R*.28*Math.pow(1-smooth((len(P[i])-R*.7)/(R*1.6)),2);
      for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],P[i][k]);hi[k]=Math.max(hi[k],P[i][k])}
    }
    if(P.length>1)tube(P,Q,c.type===2?1:0);
  }
  soma(R,roots);
  return{R,lo,hi};
}
/* cell body: a sphere drawn out toward each branch that leaves it */
function soma(R,roots){
  const t=(1+Math.sqrt(5))/2;
  let P=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]].map(norm);
  let F=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  for(let s=0;s<5;s++){const seen=new Map(),G=[],mid=(a,b)=>{const key=a<b?a+'_'+b:b+'_'+a;let m=seen.get(key);if(m===undefined){m=P.push(norm(add(P[a],P[b])))-1;seen.set(key,m)}return m};
    for(const[a,b,c]of F){const x=mid(a,b),y=mid(b,c),z=mid(c,a);G.push([a,x,z],[b,y,x],[c,z,y],[x,y,z])}F=G}
  const Q=P.map(u=>{let bulge=0;for(const d of roots){bulge+=Math.pow(Math.max(0,dot(u,d)),9)}
    const lumps=Math.sin(u[0]*5.1+u[1]*2.3)*Math.sin(u[1]*4.3-u[2]*3.7)*Math.sin(u[2]*5.9+u[0]*1.7);
    return mul(u,R*(.86+.36*(1-Math.exp(-bulge))+.05*lumps))});
  const N=P.map(()=>[0,0,0]);
  for(const[a,b,c]of F){const f=cross(sub(Q[b],Q[a]),sub(Q[c],Q[a]));for(const i of[a,b,c])N[i]=add(N[i],f)}
  const base=V.length/7;Q.forEach((q,i)=>vert(q,norm(N[i]),0));
  for(const[a,b,c]of F)I.push(base+a,base+b,base+c);
}

/* ---------- drawing ---------- */
function program(vs,fs){const p=gl.createProgram();for(const[t,src]of[[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]]){const s=gl.createShader(t);gl.shaderSource(s,'#version 300 es\nprecision highp float;\n'+src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw gl.getShaderInfoLog(s);gl.attachShader(p,s)}gl.linkProgram(p);return p}
const CAMERA=`uniform mat3 rot;uniform vec3 target;uniform float dist,focal;uniform vec2 view;
vec4 project(vec3 q){float z=dist-q.z;return vec4(q.x*focal/view.x*2.,q.y*focal/view.y*2.,(z-dist)/1200.*z,z);}`;
const solid=program(CAMERA+`layout(location=0) in vec3 p;layout(location=1) in vec3 n;layout(location=2) in float k;
out vec3 vn,vq;out float vk;uniform float time;
/* slow drift that depends only on position, so joined branches stay joined; the body stays still */
vec3 sway(vec3 w){float a=smoothstep(10.,220.,length(w));
 return a*(vec3(sin(time*.80+w.y*.021+w.z*.013),sin(time*.63+w.x*.019+2.1),sin(time*.71+w.y*.017+w.x*.011+4.2))*9.
 +vec3(sin(time*1.15+w.y*.055),sin(time*.97+w.x*.050),0.)*2.5);}
void main(){vq=rot*(p+sway(p)-target);vn=rot*n;vk=k;gl_Position=project(vq);}`,
`in vec3 vn,vq;in float vk;uniform float dist,span;out vec4 o;
void main(){vec3 n=normalize(vn),eye=normalize(vec3(0.,0.,dist)-vq),key=normalize(vec3(-.5,.7,.6));
 vec3 base=vk>.5?vec3(1.,.87,.08):vec3(.96,.95,.91),shade=vk>.5?vec3(.50,.40,.02):vec3(.13,.40,.55);
 float d=dot(n,key)*.5+.5,rim=pow(1.-max(dot(n,eye),0.),2.5),spec=pow(max(dot(reflect(-key,n),eye),0.),24.);
 vec3 c=mix(shade,base,d*d*1.15)+rim*vec3(.35,.75,.9)*.6+spec*.35;
 float haze=smoothstep(-.2,1.,-vq.z/span)*.75;
 o=vec4(mix(c,vec3(.06,.68,.85),haze),1.);}`);
const specks=program(CAMERA+`layout(location=0) in vec4 p;uniform float time,scale;out float a;
void main(){vec3 w=p.xyz+vec3(sin(time*.13+p.w*9.),cos(time*.11+p.w*7.),sin(time*.09+p.w*5.))*9.;vec3 q=rot*(w-target);gl_Position=project(q);
 float f=.5+.5*sin(time*(1.2+p.w*2.)+p.w*40.);a=f*f*f*.85;gl_PointSize=clamp(scale*(2.+p.w*4.)*dist/max(dist-q.z,1.),1.,14.);}`,
`in float a;out vec4 o;void main(){float d=length(gl_PointCoord-.5)*2.;float v=a*smoothstep(1.,0.,d);o=vec4(vec3(1.,.93,.55)*v,v);}`);
const U=(p,n)=>gl.getUniformLocation(p,n);
let count=0,nSpecks=170,vao,svao,box;
function upload(){
  vao=gl.createVertexArray();gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(V),gl.STATIC_DRAW);
  [[0,3,0],[1,3,12],[2,1,24]].forEach(([i,n,o])=>{gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,n,gl.FLOAT,false,28,o)});
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint32Array(I),gl.STATIC_DRAW);count=I.length;
  let s=7;const rnd=()=>(s=s*16807%2147483647)/2147483647,P=[];
  for(let i=0;i<nSpecks;i++)P.push((rnd()-.5)*800,(rnd()-.5)*800,(rnd()-.5)*500,rnd());
  svao=gl.createVertexArray();gl.bindVertexArray(svao);gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(P),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,4,gl.FLOAT,false,0,0);
}
/* camera: zooming in moves the aim from the middle of the tree to the cell body */
let yaw=-.35,pitch=.1,zoom=1.15,goal=null,idle=true,timer,last=0;
function render(now){
  const dt=last?Math.min(.05,(now-last)/1000):0;last=now;
  const dpr=Math.min(devicePixelRatio||1,2),W=cv.clientWidth,H=cv.clientHeight,w=Math.round(W*dpr),h=Math.round(H*dpr);
  if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h}
  if(goal){zoom+=(goal-zoom)*.06;if(Math.abs(goal-zoom)<.02){zoom=goal;goal=null}}
  if(idle)yaw=(yaw+dt*.16)%(Math.PI*2);
  const size=[0,1,2].map(k=>box.hi[k]-box.lo[k]),mid=[0,1,2].map(k=>(box.hi[k]+box.lo[k])/2);
  const wide=Math.max(size[0],size[2])*.92,fit=Math.min(W/wide,H*.68/size[1]),lean=smooth((zoom-1)/3);
  const target=mid.map(v=>v*(1-lean)),span=Math.max(40,Math.max(...size)*.55/Math.pow(zoom,.7));
  const dist=1400/zoom+box.R*4,focal=fit*zoom*dist*dpr;
  const cy=Math.cos(yaw),sy=Math.sin(yaw),cx=Math.cos(pitch),sx=Math.sin(pitch);
  const rot=[cy,sx*sy,-cx*sy, 0,cx,sx, sy,-sx*cy,cx*cy];
  gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  const set=p=>{gl.useProgram(p);gl.uniformMatrix3fv(U(p,'rot'),false,rot);gl.uniform3fv(U(p,'target'),target);gl.uniform1f(U(p,'dist'),dist);gl.uniform1f(U(p,'focal'),focal);gl.uniform2f(U(p,'view'),w,h)};
  gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.disable(gl.BLEND);
  set(solid);gl.uniform1f(U(solid,'span'),span);gl.uniform1f(U(solid,'time'),now/1000);gl.bindVertexArray(vao);gl.drawElements(gl.TRIANGLES,count,gl.UNSIGNED_INT,0);
  gl.depthMask(false);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  set(specks);gl.uniform1f(U(specks,'time'),now/1000);gl.uniform1f(U(specks,'scale'),dpr);gl.bindVertexArray(svao);gl.drawArrays(gl.POINTS,0,nSpecks);
  requestAnimationFrame(render);
}
const touches=new Map();let pinch=0;
const resume=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(!touches.size)idle=true},4000)};
const setZoom=z=>{zoom=Math.max(.8,Math.min(16,z));goal=null};
cv.onpointerdown=e=>{cv.setPointerCapture(e.pointerId);touches.set(e.pointerId,[e.clientX,e.clientY]);idle=false;goal=null;pinch=0};
cv.onpointermove=e=>{const p=touches.get(e.pointerId);if(!p)return;const q=[e.clientX,e.clientY];touches.set(e.pointerId,q);
  if(touches.size===1){yaw=(yaw+(q[0]-p[0])*.008)%(Math.PI*2);pitch=Math.max(-1.4,Math.min(1.4,pitch+(q[1]-p[1])*.008))}
  else{const[a,b]=[...touches.values()],d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(pinch)setZoom(zoom*d/pinch);pinch=d}};
cv.onpointerup=cv.onpointercancel=e=>{touches.delete(e.pointerId);pinch=0;if(!touches.size)resume()};
cv.addEventListener('wheel',e=>{e.preventDefault();idle=false;setZoom(zoom*Math.exp(-e.deltaY*.0015));resume()},{passive:false});
$('close').onclick=()=>{goal=9;idle=true};
$('fit').onclick=()=>{goal=1;idle=true};
fetch('data/cell.json?v=1').then(r=>{if(!r.ok)throw 0;return r.json()}).then(d=>{box=build(d);upload();
  const z=+new URLSearchParams(location.search).get('z');if(z){zoom=z;idle=false}
  requestAnimationFrame(render)}).catch(e=>{console.error(e);fail()});
})();
