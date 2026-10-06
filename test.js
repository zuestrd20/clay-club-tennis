'use strict';
// Run: node --test test.js
// Deterministic rules, physics, input, and long-session playability coverage.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Tennis } = require('./engine.js');
const DT = 1 / 120;
function runUntil(game, predicate, seconds = 8, control = () => {}) {
  for (let i = 0; i < Math.ceil(seconds / DT); i++) {
    if (predicate(game)) return i * DT;
    control(game);
    game.step(DT);
  }
  assert.ok(predicate(game), `Condition timed out after ${seconds}s; state=${game.state}, rally=${game.rally}, ball=${JSON.stringify(game.ball)}`);
  return seconds;
}
function fresh(seed = 420) { const g = new Tennis(seed); g.begin(); return g; }
function noReceiver(g) { g.canHit = () => false; return g; }
function snapshot(g) { return JSON.stringify({state:g.state,score:g.score,total:g.total,ball:g.ball,players:g.players,timer:g.timer,time:g.time,rally:g.rally,charge:g.charge,queued:g.queued}); }
function netBall(g, serve) {
  g.state='play'; g.last=g.server; g.serveShot=serve; g.bounces=0;
  const direction=g.server===0?-1:1;
  Object.assign(g.ball,{x:0,y:-direction*.05,z:.4,vx:0,vy:direction*20,vz:0,active:true});
  g.landing={x:0,y:direction*5};
}
function bounceBall(g, {x=0,y=-6,serve=false,who=0}={}) {
  g.state='play';g.last=who;g.serveShot=serve;g.bounces=0;g.landing={x,y};
  Object.assign(g.ball,{x,y,z:.075,vx:0,vy:0,vz:-1,active:true});
}
function controlPlayer(g, {aim='away',skip=false}={}) {
  if (g.state==='serve'&&g.server===0) {
    if (!g.charging) g.press();
    else if(g.charge>=.40) g.release();
  }
  if (g.state==='play'&&g.last===1&&!skip) {
    if(!g.charging)g.press();
    if(g.canHit(0)) {
      g.aim=aim==='away'?(g.players[1].x>=0?-1:1):0;
      g.release();
    }
  }
}
function simulation({points=120,maxSeconds=3600,seed=420,perfect=false,difficulty=1,aim='away',reactionJitter=0}={}) {
  const g=new Tennis(seed);
  const stats={points:0,wins:[0,0],hits:0,maxRally:0,reasons:{},matches:0,seconds:0};
  let pointAge=0, delayedUntil=-1, rng=seed;
  const random=()=>((rng=(Math.imul(rng,1664525)+1013904223)>>>0)/4294967296);
  g.on(ev=>{
    if(ev.type==='hit'){stats.hits++;if(ev.who===1)delayedUntil=-1;}
    if(ev.type==='point') {
      stats.points++;stats.wins[ev.winner]++;stats.maxRally=Math.max(stats.maxRally,g.rally);
      stats.reasons[ev.reason]=(stats.reasons[ev.reason]||0)+1;pointAge=0;
    }
  });
  g.difficulty=difficulty;g.begin();
  for(let i=0;i<maxSeconds/DT&&stats.points<points;i++) {
    if(g.state==='match'){stats.matches++;g.reset();g.difficulty=difficulty;g.begin();}
    const skip=!perfect&&(stats.points%4===0||g.rally>=12);
    if(reactionJitter&&g.state==='play'&&g.last===1&&!skip){
      if(!g.charging)g.press();
      if(g.canHit(0)){
        if(delayedUntil<0)delayedUntil=g.time+random()*reactionJitter;
        if(g.time>=delayedUntil){g.aim=aim==='away'?(g.players[1].x>=0?-1:1):0;g.release();}
      }
    }else controlPlayer(g,{aim,skip});
    g.step(DT);pointAge+=DT;stats.seconds+=DT;
    for(const v of Object.values(g.ball))if(typeof v==='number')assert.ok(Number.isFinite(v),'Finite ball physics');
    assert.ok(g.players.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)),'Finite player positions');
    if(!perfect)assert.ok(pointAge<40,`Point stalled: ${JSON.stringify(stats)}`);
  }
  return stats;
}

test('Tiebreak service order is 1, 2, 2, 2, 2 points; ends alternate each point',()=>{
  const g=fresh(); const expected=[0,1,1,0,0,1,1,0,0,1,1,0,0,1,1];
  expected.forEach((server,total)=>{
    g.total=total;g.prepare();assert.equal(g.server,server,`point ${total+1}`);
    assert.equal(Math.sign(g.players[server].x),(server===0?1:-1)*(total%2===0?1:-1));
    assert.equal(g.state,'serve');
  });
});

test('First to 7, win by 2; no premature completion at 7-6 or 8-7',()=>{
  const g=fresh();g.score=[6,6];g.total=12;
  const award=who=>{g.state='play';g.point(who,'test');};
  award(0);assert.deepEqual(g.score,[7,6]);assert.equal(g.state,'point');
  award(1);assert.deepEqual(g.score,[7,7]);assert.equal(g.state,'point');
  award(0);assert.equal(g.state,'point');award(0);
  assert.equal(g.state,'match');assert.equal(g.matchWinner,0);assert.deepEqual(g.score,[9,7]);
  const before=snapshot(g);g.step(1);g.point(1,'duplicate');assert.equal(snapshot(g),before);
});

test('All standard serve powers/aims clear net and land in opposite service box',()=>{
  for(let total=0;total<8;total++)for(const power of[0,.25,.5,.75,1])for(const aim of[-1,0,1]) {
    const g=noReceiver(fresh());g.total=total;g.prepare();g.aim=aim;
    const servingX=g.players[g.server].x;g.serve(power);
    runUntil(g,x=>x.bounces>0||x.state!=='play');
    assert.equal(g.state,'play',`total ${total}, power ${power}, aim ${aim}: ${g.reason}`);
    assert.equal(g.bounces,1);assert.ok(Math.abs(g.ball.x)<=4.115);
    assert.ok(Math.abs(g.ball.y)<=6.4);assert.ok(g.ball.x*servingX<0);
  }
});

test('Serve legality uses original serving side even if server runs across center',()=>{
  const g=noReceiver(fresh());g.serve(.5);g.input.x=-1;
  runUntil(g,x=>x.bounces>0||x.state!=='play');
  assert.ok(g.players[0].x<0,'Server crossed center during flight');
  assert.equal(g.state,'play',`A legal service-box bounce was called ${g.reason}`);
});

test('Net serve faults twice then awards one point to receiver and resets faults',()=>{
  const g=noReceiver(fresh());
  g.serve(.5);netBall(g,true);g.step(DT);
  assert.equal(g.state,'fault');assert.equal(g.faults,1);assert.deepEqual(g.score,[0,0]);
  runUntil(g,x=>x.state==='serve');assert.equal(g.server,0);assert.equal(g.faults,1);
  g.serve(.5);netBall(g,true);g.step(DT);
  assert.equal(g.state,'point');assert.deepEqual(g.score,[0,1]);assert.equal(g.total,1);assert.equal(g.faults,0);
  assert.equal(g.reason,'雙發失誤');
});

test('Serve wrong box and long service box are faults, including AI second-serve scoring',()=>{
  for(const total of[0,1,2,3])for(const kind of['same-side','long']) {
    const g=noReceiver(fresh());g.total=total;g.prepare();g.serve(.5);
    const who=g.server,side=who===0?-1:1;
    bounceBall(g,{x:kind==='same-side'?Math.sign(g.players[who].x):-Math.sign(g.players[who].x),y:side*(kind==='long'?7:4),serve:true,who});
    g.step(DT);assert.equal(g.state,'fault');assert.equal(g.faults,1);
  }
  const g=noReceiver(fresh());g.total=1;g.prepare();g.faults=1;g.serve(.5);netBall(g,true);g.step(DT);
  assert.deepEqual(g.score,[1,0]);
});

test('Baseline groundstrokes across all powers/aims land inside singles court',()=>{
  for(const power of[0,.25,.5,.75,1])for(const aim of[-1,-.5,0,.5,1])for(const z of[.2,.9,1.8,2.7]) {
    const g=noReceiver(fresh());g.state='play';Object.assign(g.ball,{x:-2,y:9,z});g.strike(0,power,aim);
    runUntil(g,x=>x.bounces>0||x.state!=='play');
    assert.equal(g.state,'play',`power ${power}, aim ${aim}, height ${z}: ${g.reason}`);
    assert.equal(g.bounces,1);assert.ok(g.ball.y<0&&g.ball.y>=-11.885);assert.ok(Math.abs(g.ball.x)<=4.115);
  }
});

test('Out, wrong-side, on-line, net, and two-bounce rules award the correct player',()=>{
  for(const [x,y]of[[4.2,-8],[0,-12],[0,8]]){
    const g=noReceiver(fresh());bounceBall(g,{x,y});g.step(DT);
    assert.equal(g.state,'point');assert.deepEqual(g.score,[0,1]);assert.equal(g.reason,'出界');
  }
  for(const [x,y]of[[4.115,-8],[0,-11.885]]){
    const g=noReceiver(fresh());bounceBall(g,{x,y});g.step(DT);assert.equal(g.state,'play');assert.equal(g.bounces,1);
  }
  const g=noReceiver(fresh());g.serve(.5);netBall(g,false);g.step(DT);
  assert.deepEqual(g.score,[0,1]);assert.equal(g.reason,'球沒越過球網');
  const h=noReceiver(fresh());bounceBall(h,{x:0,y:-8});h.step(DT);
  runUntil(h,x=>x.state==='point');assert.deepEqual(h.score,[1,0]);assert.equal(h.reason,'落地兩次');
});

test('Hit eligibility enforces receiver, bounce-on-serve, height, distance, and net side',()=>{
  const g=fresh();g.state='play';g.last=1;g.players[0]={x:0,y:8,swing:0,run:0};
  Object.assign(g.ball,{x:0,y:8,z:1});g.serveShot=false;g.bounces=0;assert.ok(g.canHit(0));
  g.last=0;assert.equal(g.canHit(0),false);g.last=1;
  g.serveShot=true;assert.equal(g.canHit(0),false);g.bounces=1;assert.ok(g.canHit(0));g.serveShot=false;
  for(const z of[.1,3]){g.ball.z=z;assert.equal(g.canHit(0),false);}g.ball.z=1;
  g.ball.x=2;assert.equal(g.canHit(0),false);g.ball.x=0;
  g.ball.y=10;assert.equal(g.canHit(0),false);
  g.players[0].y=.5;g.ball.y=-.2;assert.equal(g.canHit(0),false);
  g.state='serve';assert.equal(g.canHit(0),false);
});

test('Pause freezes simulation and releasing a held serve cannot launch while paused',()=>{
  const g=fresh();g.press();g.step(.025);g.paused=true;
  const before=snapshot(g);g.step(1);assert.equal(snapshot(g),before);
  g.release();assert.equal(g.state,'serve');assert.equal(g.ball.active,false);assert.equal(g.rally,0);
});

test('Paused player cannot hit, including an already buffered return',()=>{
  const g=fresh();g.state='play';g.last=1;g.serveShot=false;g.players[0].x=0;g.players[0].y=8;
  Object.assign(g.ball,{x:0,y:8,z:1});g.landing={x:0,y:8};assert.ok(g.canHit(0));
  g.paused=true;assert.equal(g.canHit(0),false);
  g.queued=.5;const before=snapshot(g);g.step(DT);assert.equal(snapshot(g),before);
});

test('AI pursues and returns a legal serve, and assist returns an AI shot on timed release',()=>{
  const g=fresh();g.serve(.5);const initial={...g.players[1]};
  runUntil(g,x=>x.last===1||x.state!=='play');assert.equal(g.last,1);assert.equal(g.state,'play');
  assert.notEqual(g.players[1].y,initial.y);assert.ok(g.rally>=2);
  runUntil(g,x=>x.last===0||x.state!=='play',8,x=>controlPlayer(x));
  assert.equal(g.state,'play');assert.equal(g.last,0);assert.ok(g.rally>=3);
});

test('Manual movement overrides assist and stays within playable bounds',()=>{
  const g=fresh();g.serve(.5);g.input={x:-1,y:1};const x=g.players[0].x;g.step(.025);assert.ok(g.players[0].x<x);
  g.players[0].x=-5.69;g.players[0].y=12.69;g.step(.025);
  assert.ok(g.players[0].x>=-5.7&&g.players[0].y<=12.7);
});

test('120 mixed-timing points complete without deadlocks or nonfinite state',()=>{
  const stats=simulation();console.log('Mixed-timing stress:',JSON.stringify(stats));
  assert.equal(stats.points,120);assert.ok(stats.hits>120);assert.ok(stats.maxRally>=3);
  assert.ok(stats.matches>=8);
});

test('Seeded match simulation is reproducible',()=>{
  assert.deepEqual(simulation({points:12,seed:738}),simulation({points:12,seed:738}));
});

test('Away-aimed, correctly timed assisted player can earn points against the AI',()=>{
  const stats=simulation({points:100,maxSeconds:1800,perfect:true});
  console.log('Perfect-timing playability:',JSON.stringify(stats));
  assert.ok(stats.wins[0]>0,'AI cannot be beaten by correctly timed full-power away shots');
  assert.equal(stats.points,100,'100 well-played points should resolve within 30 simulated minutes');
});


test('Difficulty yields longer optimal rallies and fewer wins with imperfect timing',()=>{
  const optimized=[],jittered=[];
  for(const difficulty of[0,1,2]) {
    optimized.push(simulation({points:100,perfect:true,difficulty}));
    jittered.push(simulation({points:100,perfect:true,difficulty,reactionJitter:.26}));
  }
  const average=optimized.map(s=>s.hits/s.points),wins=jittered.map(s=>s.wins[0]);
  console.log('Difficulty sweep:',JSON.stringify({averageRally:average,timingJitterWinsPer100:wins}));
  assert.ok([...optimized,...jittered].every(s=>s.points===100));
  assert.ok(average[0]<average[1]&&average[1]<average[2]);
  assert.ok(average[1]>=3&&average[1]<=8);
  assert.ok(average[2]>=4&&average[2]<=12);
  assert.ok(wins[0]>wins[1]&&wins[1]>wins[2]);
  assert.ok(wins[2]>20&&wins[2]<85,'Challenge should remain beatable but punish late timing');
});

test('Center-only perfect returns still resolve 100 points at every difficulty',()=>{
  for(const difficulty of[0,1,2]) {
    const stats=simulation({points:100,perfect:true,difficulty,aim:'center',maxSeconds:5000});
    assert.equal(stats.points,100,`Difficulty ${difficulty} cannot resolve safe center rallies`);
    assert.ok(stats.maxRally<120,'No effectively endless automatic rally');
  }
});

test('Point and fault intermissions ignore new charge input', () => {
  const g = new Tennis();
  for (const state of ['ready', 'point', 'fault', 'match']) {
    g.state = state; g.charging = false; g.press();
    assert.equal(g.charging, false);
  }
});
