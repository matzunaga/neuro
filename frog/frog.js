(function(){
const cv=document.getElementById('field'),ctx=cv.getContext('2d');
const shade=document.createElement('canvas'),sx=shade.getContext('2d');
const INK='#0d0d0f',TAU=Math.PI*2;
/* each skin is cut from one real photo: 256x128 back, then five limb strips (right leg left half, left leg right half) */
const MORPHS=[['Yellow-banded poison frog','leu42','Kaden Slone','#e8b400'],['Green and black poison frog','aur27','Roger A. Morales-Flores','#6fae9d'],
  ['Strawberry poison frog','pum32','Roger A. Morales-Flores','#8fb4c8'],['Strawberry poison frog, blue jeans form','pum63','Tom Kennedy','#0e1430']]
  .map(([name,file,by,toe])=>{const img=new Image();img.src=`data/${file}.jpg?v=2`;return{name,by,toe,img}});
let M=MORPHS[0];
const SLIM=.74; /* narrows the whole frog side to side */
const clamp=v=>Math.max(0,Math.min(1,v)),ease=v=>{v=clamp(v);return v*v*(3-2*v)},mix=(a,b,t)=>a+(b-a)*t;
const turnTo=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;

/* The frog faces +x and is about 100 units long. Each limb is a chain of segments: [angle in degrees, length]. */
const HIND={fold:[[42,42],[190,41],[34,30]],long:[[165,43],[188,47],[168,31]]};
const FRONT={sit:[[100,23],[28,21]],tuck:[[140,23],[185,21]],reach:[[55,23],[2,23]]};
function chain(root,A,B,t){let[x,y]=root;const pts=[[x,y]],ang=[];
  for(let i=0;i<A.length;i++){const a=turnTo(A[i][0]*Math.PI/180,B[i][0]*Math.PI/180,t),l=mix(A[i][1],B[i][1],t);
    x+=Math.cos(a)*l;y+=Math.sin(a)*l;pts.push([x,y]);ang.push(a)}
  return{pts,ang}}
function capsule(p,a,r1,b,r2){const t=Math.atan2(b[1]-a[1],b[0]-a[0]),d=Math.hypot(b[0]-a[0],b[1]-a[1]),k=Math.acos(Math.max(-1,Math.min(1,(r1-r2)/(d||1))));
  p.moveTo(a[0]+Math.cos(t+k)*r1,a[1]+Math.sin(t+k)*r1);p.arc(a[0],a[1],r1,t+k,t-k+TAU);p.arc(b[0],b[1],r2,t-k,t+k);p.closePath()}
/* long thin toes ending in round pads, no webbing */
function toes(p,at,heading,list){for(const[off,len]of list){const a=heading+off,e=[at[0]+Math.cos(a)*len,at[1]+Math.sin(a)*len];
  capsule(p,at,2.6,e,1.5);p.moveTo(e[0]+2.8,e[1]);p.arc(e[0],e[1],2.8,0,TAU)}}

function limbs(pose){
  const out=[];
  for(const side of[1,-1]){
    const flip=q=>[q[0],q[1]*side];
    const h=chain([-30,12],HIND.fold,HIND.long,pose.hind);
    const f=pose.reach>0?chain([15,17],FRONT.tuck,FRONT.reach,pose.reach):chain([15,17],FRONT.sit,FRONT.tuck,pose.tuck);
    for(const[limb,radii,foot]of[[h,[14,9.5,6,4],[[-.62,15],[-.3,21],[0,25],[.34,29],[.78,19]]],[f,[8.5,5.5,3.6],[[-.85,11],[-.28,15],[.25,16],[.8,12]]]]){
      /* during a turn a limb keeps its own heading: hip stays on the body, the foot stays planted until it steps */
      const tw=pose.twist?pose.twist[side]:0,lift=pose.lift?pose.lift[side]:0,last=limb.pts.length-1;
      const P=limb.pts.map(flip).map(([x,y],i)=>{if(!i)return[x,y];const w=i/last,c=Math.cos(tw*w),n=Math.sin(tw*w),k=1-.2*lift*w,Y=y*SLIM;
        return[(x*c-Y*n)*k,(x*n+Y*c)*k/SLIM]}),skin=new Path2D(),tip=new Path2D();
      for(let i=0;i<P.length-1;i++)capsule(skin,P[i],radii[i],P[i+1],radii[i+1]);
      const end=P[P.length-1],a=limb.ang[limb.ang.length-1]*side+tw;
      toes(tip,end,a,foot.map(([o,l])=>[o*side,l]));
      out.push({P,skin,tip,front:radii.length===3,side});
    }
  }
  return out;
}
function bodyPath(){const p=new Path2D();
  p.moveTo(52,0);
  p.bezierCurveTo(51,10,41,17,29,21);p.bezierCurveTo(18,24,10,21,0,22);p.bezierCurveTo(-18,24,-38,17,-45,7);
  p.quadraticCurveTo(-48,0,-45,-7);
  p.bezierCurveTo(-38,-17,-18,-24,0,-22);p.bezierCurveTo(10,-21,18,-24,29,-21);p.bezierCurveTo(41,-17,51,-10,52,0);
  p.closePath();return p}
const BODY=bodyPath();
const blob=(c,x,y,rx,ry,rot=0)=>{c.beginPath();c.ellipse(x,y,rx,ry,rot,0,TAU);c.fill()};
/* a wavy band across the back */
function band(c,x0,x1,w){c.beginPath();
  for(let y=-30;y<=30;y+=3)c.lineTo(x1+Math.sin(y*.23+w)*2.6+Math.sin(y*.55+w*2)*1.2,y);
  for(let y=30;y>=-30;y-=3)c.lineTo(x0+Math.sin(y*.2+w+2)*2.8+Math.sin(y*.6+w)*1.1,y);
  c.closePath();c.fill()}

function drawFrog(c,pose){
  const L=limbs(pose);
  const ok=M.img.complete&&M.img.naturalWidth;
  for(const l of L){
    c.fillStyle=INK;c.fill(l.skin);c.fillStyle=M.toe;c.fill(l.tip);
    const P=l.P,R=l.front?[8.5,5.5,3.6]:[14,9.5,6,4];
    if(ok)for(let i=P.length-2;i>=0;i--){const a=P[i],b=P[i+1],len=Math.hypot(b[0]-a[0],b[1]-a[1]),cap=new Path2D();
      capsule(cap,a,R[i],b,R[i+1]);
      c.save();c.clip(cap);c.translate(a[0],a[1]);c.rotate(Math.atan2(b[1]-a[1],b[0]-a[0]));
      c.drawImage(M.img,l.side>0?0:128,128+(l.front?3+i:i)*40,128,40,-R[i]*.7,-R[i],len+R[i]*.7+R[i+1]*.7,2*R[i]);c.restore()}
    c.save();c.clip(l.skin);
    /* rounded form: dark under edge, soft top light */
    c.lineJoin='round';c.strokeStyle='rgba(0,0,0,.45)';c.lineWidth=3;c.stroke(l.skin);
    for(let i=0;i<P.length-1;i++){c.strokeStyle='rgba(255,255,255,.07)';c.lineCap='round';c.lineWidth=l.front?2.4:3.6;
      c.beginPath();c.moveTo(P[i][0]-1.5,P[i][1]-2);c.lineTo(P[i+1][0]-1.5,P[i+1][1]-2);c.stroke()}
    c.restore();
  }
  c.fillStyle=INK;c.fill(BODY);
  c.save();c.clip(BODY);
  if(ok)c.drawImage(M.img,0,0,256,128,-48,-24,100,48);
  const edge=c.createRadialGradient(0,0,8,0,0,52);edge.addColorStop(0,'rgba(0,0,0,0)');edge.addColorStop(1,'rgba(0,0,0,.4)');
  c.save();c.scale(1,.55);c.fillStyle=edge;c.fillRect(-60,-70,120,140);c.restore();
  const gloss=c.createRadialGradient(8,-9,0,8,-9,26);gloss.addColorStop(0,'rgba(255,255,255,.12)');gloss.addColorStop(1,'rgba(255,255,255,0)');
  c.fillStyle=gloss;c.fillRect(-50,-30,105,60);
  c.fillStyle='rgba(255,255,255,.2)';blob(c,15,-8,5,1.7,-.2);blob(c,-19,-9,3,1.2,.15);
  c.strokeStyle='rgba(0,0,0,.28)';c.lineWidth=1.2;c.beginPath();c.moveTo(34,0);c.quadraticCurveTo(0,2,-40,0);c.stroke();
  c.restore();
  for(const s of[1,-1]){
    c.save();c.translate(31,17.5*s);c.scale(.76,.76);c.translate(-31,-17.5*s);
    c.fillStyle=INK;blob(c,31,17.5*s,8.8,7.6,.25*s);
    const g=c.createRadialGradient(33,18*s-2.5,.5,31,18*s,7);g.addColorStop(0,'#5a5148');g.addColorStop(.55,'#161312');g.addColorStop(1,'#000');
    c.fillStyle=g;blob(c,31.5,18.2*s,6.6,5.8,.25*s);
    c.fillStyle='#fff';blob(c,33.5,18.2*s-2.4,1.9,1.5);c.restore();
    c.fillStyle='rgba(0,0,0,.7)';blob(c,48,3.6*s,1.3,1.1);
  }
}
function silhouette(c,pose){c.fillStyle='#003a52';for(const l of limbs(pose)){c.fill(l.skin);c.fill(l.tip)}c.fill(BODY);blob(c,31,17.5,9,8);blob(c,31,-17.5,9,8)}

/* choreography */
const SIT=.55,CROUCH=.2,AIR=.56,LAND=.22,BEAT=SIT+CROUCH+AIR+LAND,GAP=1.4;
let W,H,dpr,S,hops=[],total,start=null;
let side=-1;
/* every run enters from a different edge, at a random spot and angle, and leaves across the screen */
function plan(){
  const m=185*S,e=Math.floor(Math.random()*3);side=side<0?Math.floor(Math.random()*4):(side+1+e)%4; /* 0 left, 1 top, 2 right, 3 bottom; never the same twice */
  const u=.2+Math.random()*.6,v=.2+Math.random()*.6;
  const A=[[-m,H*u],[W*u,-m],[W+m,H*u],[W*u,H+m]][side];
  const Px=W*(.35+Math.random()*.3),Py=H*(.35+Math.random()*.3);
  let dx=Px-A[0],dy=Py-A[1];const d=Math.hypot(dx,dy);dx/=d;dy/=d;
  /* carry the line on until it is fully off screen again */
  const out=Math.min(dx>0?(W+m-A[0])/dx:dx<0?(-m-A[0])/dx:1e9,dy>0?(H+m-A[1])/dy:dy<0?(-m-A[1])/dy:1e9);
  const reach=Math.max(150*S,Math.min(Math.min(W,H)*.36,330*S)),n=Math.max(3,Math.ceil(out/reach));
  const at=i=>{const k=out*i/n,w=i>0&&i<n?Math.sin(i*2.1+u*6)*Math.min(W,H)*.03:0;return[A[0]+dx*k-dy*w,A[1]+dy*k+dx*w]};
  const mid=Math.max(1,Math.min(n-1,Math.round(d/out*n)));
  hops=[];for(let i=0;i<n;i++){const p=at(i),q=at(i+1);hops.push({x0:p[0],y0:p[1],x1:q[0],y1:q[1],sit:i===0?0:i===mid?SIT*2.2:SIT*1.6})}
  let t=.35;for(const h of hops){h.t=t;t+=h.sit+CROUCH+AIR+LAND}total=t+GAP;
}
function next(){M=MORPHS[(MORPHS.indexOf(M)+1)%MORPHS.length];credit();plan()}
function state(t){
  let h=hops[0];for(const q of hops)if(t>=q.t)h=q;
  const k=Math.max(0,t-h.t),dir=Math.atan2(h.y1-h.y0,h.x1-h.x0);
  /* turn in three steps: the legs on the turning side move first, the body follows, then the other side */
  const i=hops.indexOf(h),p=hops[i-1],was=p?Math.atan2(p.y1-p.y0,p.x1-p.x0):dir,delta=Math.atan2(Math.sin(dir-was),Math.cos(dir-was));
  const part=(from,to)=>h.sit?clamp((k/h.sit-from)/(to-from)):1;
  const u1=part(.1,.4),u2=part(.34,.7),u3=part(.64,.96),heading=was+delta*ease(u2),lead=delta<0?-1:1;
  const s={x:h.x0,y:h.y0,a:heading,z:0,sx:1,sy:1,hidden:t<h.t,pose:{hind:0,tuck:0,reach:0,
    twist:{[lead]:was+delta*ease(u1)-heading,[-lead]:was+delta*ease(u3)-heading},
    lift:{[lead]:p?Math.sin(Math.PI*u1):0,[-lead]:p?Math.sin(Math.PI*u3):0}}};
  const a=k-h.sit,b=a-CROUCH,c=b-AIR;
  if(a<0){s.sx=1+Math.sin(t*9)*.008;s.sy=1+Math.sin(t*9)*.018}
  else if(b<0){const u=ease(a/CROUCH);s.sx=1-.08*u;s.sy=1+.07*u}
  else if(c<0){const u=b/AIR,m=u*.8+ease(u)*.2;
    s.x=mix(h.x0,h.x1,m);s.y=mix(h.y0,h.y1,m);s.z=Math.sin(Math.PI*u);
    /* legs fire straight, trail, then fold under before touchdown */
    s.pose.hind=u<.62?1-Math.pow(1-clamp(u/.24),3):1-ease((u-.62)/.38);
    s.pose.tuck=ease(u/.2);s.pose.reach=ease((u-.5)/.38);
    const st=Math.sin(Math.PI*clamp(u/.45));const off=1-ease(u/.14);s.sx=1+.1*st-.08*off;s.sy=1-.07*st+.07*off}
  else{const u=clamp(c/LAND),hit=Math.sin(Math.PI*u)*(1-u*.4);
    s.x=h.x1;s.y=h.y1;s.sx=1-.13*hit;s.sy=1+.12*hit;
    s.pose.reach=1-ease(u*2);s.pose.tuck=1-ease((u-.5)*2)}
  return s;
}
function ring(x,y,r,w,a){if(a<=0||r<=0)return;
  ctx.lineWidth=w;ctx.strokeStyle=`rgba(225,250,255,${a})`;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.stroke();}
function splash(x,y,age,power){
  for(let i=0;i<3;i++){const q=(age-i*.17)/1.25;if(q<=0||q>=1)continue;
    ring(x,y,S*(26+190*power*(1-Math.pow(1-q,2))),(2.6-1.7*q)*(1-i*.18),.22*Math.min(1,power*1.2)*Math.pow(1-q,1.3)*(1-i*.22))}}
function ripples(t){for(const h of hops){const jump=h.t+h.sit+CROUCH;splash(h.x0,h.y0,t-jump,.65);splash(h.x1,h.y1,t-jump-AIR,1)}}
function paint(s,t){
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);if(t!==undefined)ripples(t);if(s.hidden)return;
  /* the shadow slides away, blurs and fades as the frog rises: this is what reads as height.
     Blur uses the canvas drop shadow (phone Safari has no canvas filter): the sharp copy is drawn off screen. */
  const box=420,res=S*dpr,n=Math.max(8,Math.round(box*res));if(shade.width!==n)shade.width=shade.height=n;
  sx.setTransform(1,0,0,1,0,0);sx.clearRect(0,0,n,n);
  sx.setTransform(res,0,0,res,n/2,n/2);sx.rotate(s.a);sx.scale(s.sx,s.sy*SLIM);silhouette(sx,s.pose);
  const x=(s.x+S*(6+75*s.z))*dpr,y=(s.y+S*(9+115*s.z))*dpr,far=cv.width+n*2;
  ctx.save();ctx.setTransform(1,0,0,1,0,0);
  ctx.shadowColor=`rgba(0,45,66,${mix(.5,.3,s.z)})`;ctx.shadowBlur=(1.5+22*s.z)*dpr;ctx.shadowOffsetX=far;
  ctx.drawImage(shade,x-n/2-far,y-n/2);ctx.restore();
  ctx.translate(s.x,s.y);const g=S*(1+.1*s.z);ctx.scale(g,g);ctx.rotate(s.a);ctx.scale(s.sx,s.sy*SLIM);drawFrog(ctx,s.pose);
}
function size(){dpr=Math.min(devicePixelRatio||1,3);W=cv.clientWidth;H=cv.clientHeight;cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
  S=Math.min(W*.0026,H*.0017,1.7)*.34;plan()}
const label=document.getElementById('morph'),by=document.getElementById('by');
function credit(){label.textContent=M.name;by.textContent=M.by}
const frozen=new URLSearchParams(location.search).get('t');
const calm=matchMedia('(prefers-reduced-motion:reduce)').matches;
let playing=!calm;
cv.onpointerdown=()=>{if(playing)next();else plan();playing=true;start=null};
addEventListener('resize',()=>{size();start=null});
size();
function frame(now){
  if(frozen!==null)paint(state(+frozen),+frozen);
  else if(playing){if(start===null)start=now;let t=(now-start)/1000;
    if(t>total){start=now;t=0;next();if(calm)playing=false}paint(state(t),t)}
  else paint({x:W/2,y:H*.52,a:0,z:0,sx:1,sy:1,pose:{hind:0,tuck:0,reach:0}});
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
