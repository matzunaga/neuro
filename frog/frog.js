(function(){
const cv=document.getElementById('field'),ctx=cv.getContext('2d');
const shade=document.createElement('canvas'),sx=shade.getContext('2d');
const YEL='#ffe21a',INK='#0d0d0f',TAU=Math.PI*2;
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
      const P=limb.pts.map(flip),skin=new Path2D(),tip=new Path2D();
      for(let i=0;i<P.length-1;i++)capsule(skin,P[i],radii[i],P[i+1],radii[i+1]);
      const end=P[P.length-1],a=limb.ang[limb.ang.length-1]*side;
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
  for(const l of L){
    c.fillStyle=INK;c.fill(l.skin);c.fill(l.tip);
    c.save();c.clip(l.skin);
    const P=l.P,spot=(i,t,rx,ry,col,off=0)=>{const a=P[i],b=P[i+1],r=Math.atan2(b[1]-a[1],b[0]-a[0]);
      c.fillStyle=col;blob(c,mix(a[0],b[0],t)-Math.sin(r)*off,mix(a[1],b[1],t)+Math.cos(r)*off,rx,ry,r)};
    if(l.front){spot(0,.7,10,7,YEL);spot(1,.4,7,4.5,YEL);spot(0,.75,3.2,2.6,INK,1)}
    else{spot(0,.55,18,12,YEL);spot(1,.5,17,7,YEL);spot(2,.35,8,4,YEL);
      spot(0,.45,5,4,INK,3);spot(0,.75,3,3.4,INK,-5);spot(1,.38,4.5,3.6,INK,1);spot(1,.68,3,2.6,INK,-2)}
    /* rounded form: dark under edge, soft top light */
    c.lineJoin='round';c.strokeStyle='rgba(0,0,0,.45)';c.lineWidth=3;c.stroke(l.skin);
    for(let i=0;i<P.length-1;i++){c.strokeStyle='rgba(255,255,255,.16)';c.lineCap='round';c.lineWidth=l.front?2.4:3.6;
      c.beginPath();c.moveTo(P[i][0]-1.5,P[i][1]-2);c.lineTo(P[i+1][0]-1.5,P[i+1][1]-2);c.stroke()}
    c.restore();
  }
  c.fillStyle=INK;c.fill(BODY);
  c.save();c.clip(BODY);
  c.fillStyle=YEL;band(c,17,34,1);band(c,-13,5,3.1);band(c,-41,-27,5);
  c.fillStyle=YEL;blob(c,46,0,3.6,5);
  c.fillStyle=INK;
  for(const[x,y,rx,ry,r]of[[27,7,4.6,3.6,.5],[24,-9,3.6,3,-.4],[-3,10,5.4,4,.2],[-6,-8,4.2,4.8,1],[1,-1,2,2.4,0],[-34,5,3.8,3,-.6],[-33,-7,2.8,2.4,.3]])blob(c,x,y,rx,ry,r);
  const edge=c.createRadialGradient(0,0,8,0,0,52);edge.addColorStop(0,'rgba(0,0,0,0)');edge.addColorStop(1,'rgba(0,0,0,.5)');
  c.save();c.scale(1,.55);c.fillStyle=edge;c.fillRect(-60,-70,120,140);c.restore();
  const gloss=c.createRadialGradient(8,-9,0,8,-9,26);gloss.addColorStop(0,'rgba(255,255,255,.34)');gloss.addColorStop(1,'rgba(255,255,255,0)');
  c.fillStyle=gloss;c.fillRect(-50,-30,105,60);
  c.fillStyle='rgba(255,255,255,.75)';blob(c,15,-8,5,1.7,-.2);blob(c,-19,-9,3,1.2,.15);
  c.strokeStyle='rgba(0,0,0,.28)';c.lineWidth=1.2;c.beginPath();c.moveTo(34,0);c.quadraticCurveTo(0,2,-40,0);c.stroke();
  c.restore();
  for(const s of[1,-1]){
    c.fillStyle=INK;blob(c,31,17.5*s,8.8,7.6,.25*s);
    const g=c.createRadialGradient(33,18*s-2.5,.5,31,18*s,7);g.addColorStop(0,'#5a5148');g.addColorStop(.55,'#161312');g.addColorStop(1,'#000');
    c.fillStyle=g;blob(c,31.5,18.2*s,6.6,5.8,.25*s);
    c.fillStyle='#fff';blob(c,33.5,18.2*s-2.4,1.9,1.5);
    c.fillStyle='rgba(0,0,0,.7)';blob(c,48,3.6*s,1.3,1.1);
  }
}
function silhouette(c,pose){c.fillStyle='#003a52';for(const l of limbs(pose)){c.fill(l.skin);c.fill(l.tip)}c.fill(BODY);blob(c,31,17.5,9,8);blob(c,31,-17.5,9,8)}

/* choreography */
const SIT=.55,CROUCH=.2,AIR=.56,LAND=.22,BEAT=SIT+CROUCH+AIR+LAND,GAP=1.4;
let W,H,dpr,S,hops=[],total,start=null;
function plan(){
  const reach=Math.max(150*S,Math.min(W*.36,330*S)),from=-175*S,to=W+185*S,n=Math.ceil((to-from)/reach),step=(to-from)/n;
  const ys=i=>H*.52+Math.sin(i*2.1)*H*.045;
  hops=[];for(let i=0;i<n;i++)hops.push({x0:from+i*step,y0:ys(i),x1:from+(i+1)*step,y1:ys(i+1),sit:i===0?0:i===Math.ceil(n/2)?SIT*2.2:SIT*.7});
  let t=.35;for(const h of hops){h.t=t;t+=h.sit+CROUCH+AIR+LAND}total=t+GAP;
}
function state(t){
  let h=hops[0];for(const q of hops)if(t>=q.t)h=q;
  const k=Math.max(0,t-h.t),dir=Math.atan2(h.y1-h.y0,h.x1-h.x0);
  const s={x:h.x0,y:h.y0,a:dir,z:0,sx:1,sy:1,pose:{hind:0,tuck:0,reach:0},hidden:t<h.t};
  const a=k-h.sit,b=a-CROUCH,c=b-AIR;
  if(a<0){s.sx=1+Math.sin(t*9)*.008;s.sy=1+Math.sin(t*9)*.018}
  else if(b<0){const u=ease(a/CROUCH);s.sx=1-.08*u;s.sy=1+.07*u}
  else if(c<0){const u=b/AIR,m=u*.8+ease(u)*.2;
    s.x=mix(h.x0,h.x1,m);s.y=mix(h.y0,h.y1,m);s.z=Math.sin(Math.PI*u);
    /* legs fire straight, trail, then fold under before touchdown */
    s.pose.hind=u<.62?1-Math.pow(1-clamp(u/.24),3):1-ease((u-.62)/.38);
    s.pose.tuck=ease(u/.2);s.pose.reach=ease((u-.5)/.38);
    const st=Math.sin(Math.PI*clamp(u/.45));s.sx=1+.1*st;s.sy=1-.07*st}
  else{const u=clamp(c/LAND),hit=Math.sin(Math.PI*u)*(1-u*.4);
    s.x=h.x1;s.y=h.y1;s.sx=1-.13*hit;s.sy=1+.12*hit;s.pose.reach=1-ease(u);s.pose.tuck=0;
    if(u<.5){s.pose.reach=1-ease(u*2)*.6}else{s.pose.reach=0;s.pose.tuck=.4*(1-ease((u-.5)*2))}}
  return s;
}
function paint(s){
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);if(s.hidden)return;
  /* the shadow slides away, shrinks and softens as the frog rises: this is what reads as height */
  const res=mix(.3,.09,s.z)*S*2,box=420;shade.width=shade.height=Math.max(8,Math.round(box*res));
  sx.setTransform(res,0,0,res,shade.width/2,shade.height/2);sx.rotate(s.a);sx.scale(s.sx,s.sy);silhouette(sx,s.pose);
  const k=S*(1-.12*s.z),size=box*k;
  ctx.globalAlpha=mix(.46,.2,s.z);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(shade,s.x+S*(6+62*s.z)-size/2,s.y+S*(9+96*s.z)-size/2,size,size);ctx.globalAlpha=1;
  ctx.translate(s.x,s.y);const g=S*(1+.42*s.z);ctx.scale(g,g);ctx.rotate(s.a);ctx.scale(s.sx,s.sy);drawFrog(ctx,s.pose);
}
function size(){dpr=Math.min(devicePixelRatio||1,3);W=cv.clientWidth;H=cv.clientHeight;cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
  S=Math.min(W*.0026,H*.0017,1.7);plan()}
const frozen=new URLSearchParams(location.search).get('t');
const calm=matchMedia('(prefers-reduced-motion:reduce)').matches;
let playing=!calm;
cv.onpointerdown=()=>{playing=true;start=null};
addEventListener('resize',()=>{size();start=null});
size();
function frame(now){
  if(frozen!==null)paint(state(+frozen));
  else if(playing){if(start===null)start=now;let t=(now-start)/1000;
    if(t>total){start=now;t=0;if(calm)playing=false}paint(state(t))}
  else paint({x:W/2,y:H*.52,a:0,z:0,sx:1,sy:1,pose:{hind:0,tuck:0,reach:0}});
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
