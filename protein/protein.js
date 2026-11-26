(async function(){
const $=id=>document.getElementById(id),cv=$('field'),g=cv.getContext('2d');
$('about').onclick=()=>{const o=$('credit').hidden;$('credit').hidden=!o;$('about').setAttribute('aria-expanded',o);document.querySelector('main').classList.toggle('open',o)};
$('closeCredit').onclick=()=>$('about').click();
let atoms;
try{
  const r=await fetch('https://files.rcsb.org/download/4HHB.pdb');if(!r.ok)throw 0;
  atoms=(await r.text()).split('\n').filter(l=>/^(ATOM  |HETATM)/.test(l)).map(l=>({
    p:[+l.slice(30,38),+l.slice(38,46),+l.slice(46,54)],res:l.slice(17,20).trim(),el:l.slice(76,78).trim(),het:l[0]==='H'}))
    .filter(a=>!a.het||a.res==='HEM');
  if(!atoms.length)throw 0;
}catch(e){$('offline').hidden=false;$('note').textContent='';return}

/* center, then line up principal axes: longest = x, shortest = slicing axis */
const c=[0,1,2].map(i=>atoms.reduce((s,a)=>s+a.p[i],0)/atoms.length);
atoms.forEach(a=>a.p=a.p.map((v,i)=>v-c[i]));
const M=[0,1,2].map(i=>[0,1,2].map(j=>atoms.reduce((s,a)=>s+a.p[i]*a.p[j],0)/atoms.length));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],norm=v=>{const l=Math.hypot(...v);return v.map(x=>x/l)};
const power=(prev)=>{let v=[.6,.5,.4];for(let k=0;k<300;k++){v=M.map(r=>dot(r,v));if(prev){const d=dot(v,prev);v=v.map((x,i)=>x-d*prev[i])}v=norm(v)}return v};
const e1=power(),e2=power(e1),e3=[e1[1]*e2[2]-e1[2]*e2[1],e1[2]*e2[0]-e1[0]*e2[2],e1[0]*e2[1]-e1[1]*e2[0]];
atoms.forEach(a=>a.p=[dot(a.p,e1),dot(a.p,e2),dot(a.p,e3)]);

const R=Math.max(...atoms.map(a=>Math.hypot(a.p[0],a.p[1])))+4;
const zmin=Math.min(...atoms.map(a=>a.p[2]))-1,zmax=Math.max(...atoms.map(a=>a.p[2]))+1;
const N=150,cell=2*R/(N-1),S=44,dz=(zmax-zmin)/(S-1);

function contour(set,z,level){
  const f=new Float32Array(N*N),reach=4.2;
  for(const a of set){const hz=a.p[2]-z;if(Math.abs(hz)>reach)continue;
    const x0=Math.max(0,Math.ceil((a.p[0]-reach+R)/cell)),x1=Math.min(N-1,Math.floor((a.p[0]+reach+R)/cell));
    const y0=Math.max(0,Math.ceil((a.p[1]-reach+R)/cell)),y1=Math.min(N-1,Math.floor((a.p[1]+reach+R)/cell));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const dx=x*cell-R-a.p[0],dy=y*cell-R-a.p[1];f[y*N+x]+=Math.exp(-(dx*dx+dy*dy+hz*hz)/3.2)}}
  const seg=[];
  for(let y=0;y<N-1;y++)for(let x=0;x<N-1;x++){
    const v=[f[y*N+x],f[y*N+x+1],f[(y+1)*N+x+1],f[(y+1)*N+x]],q=[[x,y],[x+1,y],[x+1,y+1],[x,y+1]],pts=[];
    for(let i=0;i<4;i++){const j=(i+1)%4;if((v[i]>level)!==(v[j]>level)){const t=(level-v[i])/(v[j]-v[i]);
      pts.push((q[i][0]+(q[j][0]-q[i][0])*t)*cell-R,(q[i][1]+(q[j][1]-q[i][1])*t)*cell-R)}}
    for(let i=0;i+3<pts.length;i+=4)seg.push(pts[i],pts[i+1],pts[i+2],pts[i+3])}
  return seg;
}
const heme=atoms.filter(a=>a.res==='HEM'),iron=heme.filter(a=>a.el.toUpperCase()==='FE');
const slices=[...Array(S)].map((_,i)=>{const z=zmin+i*dz;return{z,out:contour(atoms,z,.55),in:contour(atoms,z,1.5),heme:contour(heme,z,.6)}});

let yaw=.5,cut=S>>1,target=cut,whole=false,W,H,drag=null,idle=true;
const calm=matchMedia('(prefers-reduced-motion:reduce)').matches;
function size(){const d=Math.min(devicePixelRatio||1,2);W=cv.clientWidth;H=cv.clientHeight;cv.width=W*d;cv.height=H*d;g.setTransform(d,0,0,d,0,0)}
addEventListener('resize',size);size();
cv.onpointerdown=e=>{drag=[e.clientX,e.clientY];idle=false;whole=false;$('hint').classList.add('gone');cv.setPointerCapture(e.pointerId)};
cv.onpointermove=e=>{if(!drag)return;yaw+=(e.clientX-drag[0])*.008;target=Math.max(0,Math.min(S-1,target-(e.clientY-drag[1])*S/(H*.55)));drag=[e.clientX,e.clientY]};
cv.onpointerup=cv.onpointercancel=()=>drag=null;
$('fit').onclick=()=>{whole=!whole;idle=false};

function draw(t){
  cut+=(target-cut)*.2;
  if(idle&&!calm)target=(S-1)*(.5+.32*Math.sin(t/4200));
  g.clearRect(0,0,W,H);
  const k=Math.min(W*.86/(2*R*.9),H*.6/(zmax-zmin+R*1.1)),cx=W/2,cy=H*(W<700?.44:.5);
  const ca=Math.cos(yaw),sa=Math.sin(yaw),tilt=.5,lift=.95;
  const pr=(x,y,z)=>[cx+(x*ca-y*sa)*k,cy+((x*sa+y*ca)*tilt-z*lift)*k];
  const path=(seg,z)=>{g.beginPath();for(let i=0;i<seg.length;i+=4){const a=pr(seg[i],seg[i+1],z),b=pr(seg[i+2],seg[i+3],z);g.moveTo(a[0],a[1]);g.lineTo(b[0],b[1])}};
  const now=Math.round(cut);g.lineCap='round';
  slices.forEach((s,i)=>{
    const on=!whole&&i===now;
    const al=whole?.42:on?1:i<now?.13:.035;
    g.strokeStyle=`rgba(255,255,255,${al})`;g.lineWidth=on?1.8:.8;path(s.out,s.z);g.stroke();
    if(on){g.strokeStyle='rgba(255,255,255,.6)';g.lineWidth=.9;path(s.in,s.z);g.stroke()}
    if(s.heme.length){g.strokeStyle=`rgba(214,31,38,${whole?.8:on?1:i<now?.35:.12})`;g.lineWidth=on?2.6:1;path(s.heme,s.z);g.stroke()}
  });
  const z=zmin+cut*dz;let near=0;
  for(const a of iron){const d=Math.abs(a.p[2]-z),hot=!whole&&d<1.8;if(hot)near++;
    const [x,y]=pr(...a.p);g.beginPath();g.arc(x,y,hot?6.5:3,0,7);g.fillStyle='#d61f26';
    g.shadowColor='#d61f26';g.shadowBlur=hot?22:0;g.fill();g.shadowBlur=0;
    if(hot){g.strokeStyle='#fff';g.lineWidth=1.5;g.stroke()}}
  $('depth').textContent=whole?Math.round(zmax-zmin):Math.round(z-zmin);
  $('note').textContent=whole?'Whole molecule, four iron atoms':near?'Iron in this slice: where oxygen binds':'Red marks the heme groups';
  document.querySelector('.location').textContent=whole?'Total depth':'Slice depth';
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
})();
