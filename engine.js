/* Clay Club — self-contained original tennis simulation, metres and seconds. */
(function(root){
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
class Tennis {
 constructor(seed=420){this.seed=seed;this.listeners=[];this.reset();}
 rand(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
 on(fn){this.listeners.push(fn);} emit(type,data={}){for(const fn of this.listeners)fn({type,...data});}
 reset(){this.score=[0,0];this.total=0;this.server=0;this.state='ready';this.timer=0;this.faults=0;this.rally=0;this.bestRally=0;this.paused=false;this.assist=true;this.difficulty=1;this.aim=0;this.charge=0;this.charging=false;this.queued=0;this.time=0;this.players=[{x:1.6,y:10.5,swing:0,run:0},{x:-1.5,y:-9.4,swing:0,run:0}];this.ball={x:1.6,y:10.5,z:1,vx:0,vy:0,vz:0,active:false};this.last=0;this.bounces=0;this.serveShot=false;this.trail=[];this.message='準備發球';this.reason='';this.matchWinner=null;this.aiDelay=0;this.input={x:0,y:0};this.emit('reset');}
 begin(){this.state='serve';this.prepare();}
 prepare(){this.server=this.total===0?0:(Math.floor((this.total-1)/2)+1)%2;let s=this.total%2===0?1:-1;this.players[0].x=this.server===0?s*1.65:-s*1.4;this.players[1].x=this.server===1?-s*1.65:s*1.4;this.players[0].y=10.6;this.players[1].y=-10.6;this.ball={x:this.players[this.server].x,y:this.players[this.server].y,z:1.1,vx:0,vy:0,vz:0,active:false};this.state='serve';this.timer=0;this.charging=false;this.queued=0;this.rally=0;this.trail=[];this.message=this.faults?'第二發球':this.server===0?'你的發球':'對手發球';this.emit('serve',{server:this.server});}
 press(){if(this.paused||this.state==='ready'||this.state==='match')return;if(this.state==='serve'&&this.server!==0)return;this.charging=true;this.charge=0;}
 release(){if(this.paused||!this.charging||!['play','serve'].includes(this.state))return;this.charging=false;let p=clamp(this.charge/.78,0,1);this.shotPower=p;this.queued=.65;if(this.state==='serve'&&this.server===0)this.serve(p);}
 serve(power=.45){if(this.state!=='serve')return;let who=this.server,p=this.players[who],side=who===0?1:-1;this.ball.x=p.x;this.ball.y=p.y;this.ball.z=2.45;let tx=-Math.sign(p.x)*(1.15+power*.8)+(who===0?this.aim*.4:0);let ty=-side*(3.4+power*1.1);this.launch(who,tx,ty,.95-power*.1,true);this.state='play';this.queued=0;this.message='';}
 launch(who,tx,ty,T,serve=false){let b=this.ball;b.vx=(tx-b.x)/T;b.vy=(ty-b.y)/T;b.vz=(6*T*T-b.z)/T;b.active=true;this.last=who;this.bounces=0;this.serveShot=serve;if(serve)this.serviceOriginX=this.players[who].x;this.aiReaction=serve?.05:.30-this.difficulty*.02;this.aiTargetOffset=(this.rand()-.5)*(.8-this.difficulty*.2);this.aiFumble=who===0&&this.rand()<(.07-this.difficulty*.018+Math.min(.13,Math.max(0,this.rally-4)*.006));this.landing={x:tx,y:ty};this.players[who].swing=1;this.aiDelay=.13+this.rand()*.14;this.rally++;this.bestRally=Math.max(this.bestRally,this.rally);this.emit('hit',{who,serve});}
 strike(who,power=.5,aim=0){let b=this.ball,side=who===0?1:-1;let accuracy=1;let tx=clamp(aim,-1,1)*(3.2+power*.45);let ty=-side*(7.8+power*2);let T=1.34-power*.35; // Enough arc to clear the net and land inside singles.
 if(who===1){tx=clamp(-this.players[0].x*.48+(this.rand()-.5)*5.7,-3.65,3.65);ty=7.5+this.rand()*2.55;T=1.2-this.difficulty*.08;if(this.rand()<(.065-this.difficulty*.022)+Math.min(.055,this.rally*.002))tx=(tx<0?-1:1)*(4.5+this.rand()*.5);}
 this.launch(who,tx,ty,T,false);this.queued=0;this.emit('quality',{text:power>.72?'強力抽球':Math.abs(aim)>.58?'斜線回擊':'穩定回擊'});}
 canHit(who){let b=this.ball,p=this.players[who];return !this.paused&&this.state==='play'&&this.last!==who&&(!this.serveShot||this.bounces>0)&&b.z>.16&&b.z<2.8&&Math.abs(b.y-p.y)<1.85&&Math.abs(b.x-p.x)<(who===0?1.65:1.45)&& (who===0?b.y>0:b.y<0);}
 point(winner,reason){if(this.state!=='play')return;this.ball.active=false;this.score[winner]++;this.total++;this.faults=0;this.state='point';this.timer=0;this.message=winner===0?'你拿下這一分':'對手得分';this.reason=reason;this.charging=false;this.queued=0;this.emit('point',{winner,reason});if(Math.max(...this.score)>=7&&Math.abs(this.score[0]-this.score[1])>=2){this.state='match';this.matchWinner=winner;this.message=winner===0?'漂亮！贏下比賽':'下次再挑戰';this.emit('match',{winner});}}
 fault(reason){this.ball.active=false;this.faults++;this.charging=false;this.queued=0;if(this.faults>=2){this.point(1-this.server,'雙發失誤');return;}this.state='fault';this.timer=0;this.message='發球失誤';this.reason=reason+' · 還有一次機會';this.emit('fault');}
 step(dt){if(this.paused||this.state==='ready'||this.state==='match')return;dt=Math.min(dt,.025);this.time+=dt;this.timer+=dt;for(let p of this.players)p.swing=Math.max(0,p.swing-dt*3.2);if(this.charging)this.charge=Math.min(1.1,this.charge+dt);this.queued=Math.max(0,this.queued-dt);
 if(this.state==='point'||this.state==='fault'){if(this.timer>1.75)this.prepare();return;}
 if(this.state==='serve'){if(this.server===1&&this.timer>1.25)this.serve(.35+this.rand()*.3);return;}
 this.aiDelay-=dt;this.aiReaction-=dt;const b=this.ball;
 for(let who=0;who<2;who++){let p=this.players[who],side=who===0?1:-1,tx=p.x,ty=p.y;
 if(who===1||this.assist){if(this.last!==who){tx=clamp(this.landing.x+(who===1?this.aiTargetOffset:0),-4.6,4.6);ty=clamp(Math.abs(this.landing.y)+1.35,3,11.25)*side;}else {tx=p.x*.97;ty=side*9.8;}}
 if(who===1&&this.last===0&&this.aiReaction>0){tx=p.x;ty=p.y;}let speed=who===0?7.4:(this.serveShot?5.5:3.5+this.difficulty*.2);if(who===0&&(Math.abs(this.input.x)+Math.abs(this.input.y)>.05)){tx=p.x+this.input.x*3;ty=p.y+this.input.y*3;}
 let dx=tx-p.x,dy=ty-p.y,d=Math.hypot(dx,dy),step=Math.min(d,speed*dt);if(d>.02){p.x+=dx/d*step;p.y+=dy/d*step;p.run+=dt*12;}p.moving=d>.12;p.x=clamp(p.x,-5.7,5.7);p.y=clamp(p.y*side,1,12.7)*side;}
 if(this.queued>0&&this.canHit(0)){this.strike(0,this.shotPower,this.aim);}
 if(this.canHit(1)&&this.aiDelay<=0&&b.vy<0&&b.z<1.9){if(this.aiFumble){this.players[1].swing=1;this.aiFumble=false;this.aiDelay=.45;}else this.strike(1,.5,0);}
 let oldY=b.y,oldZ=b.z;b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt-6*dt*dt;b.vz-=12*dt;
 if(oldY*b.y<=0&&oldY!==b.y){let f=Math.abs(oldY)/(Math.abs(oldY)+Math.abs(b.y));let z=oldZ+(b.z-oldZ)*f;if(z<.94){if(this.serveShot)this.fault('觸網');else this.point(1-this.last,'球沒越過球網');return;}}
 if(b.z<=.07){b.z=.07;this.bounces++;this.emit('bounce',{x:b.x,y:b.y});if(this.bounces===1){let valid=Math.abs(b.x)<=4.115&&Math.abs(b.y)<=11.885&&(this.last===0?b.y<0:b.y>0);if(this.serveShot)valid=valid&&Math.abs(b.y)<=6.4&&b.x*this.serviceOriginX<0;if(!valid){if(this.serveShot)this.fault('出界');else this.point(1-this.last,'出界');return;}b.vz=Math.abs(b.vz)*.74;b.vx*=.78;b.vy*=.78;}else{this.point(this.last,'落地兩次');return;}}
 if(Math.abs(b.y)>17||Math.abs(b.x)>10){this.point(this.bounces?this.last:1-this.last,this.bounces?'未能回擊':'出界');return;}
 this.trail.push({x:b.x,y:b.y,z:b.z});if(this.trail.length>10)this.trail.shift();
 }
}
if(typeof module!=='undefined')module.exports={Tennis,clamp};else root.Tennis=Tennis;
})(typeof window!=='undefined'?window:globalThis);
