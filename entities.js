(function(){
  'use strict';

  class Player {
    constructor(x,y){
      this.x=x; this.y=y; this.w=14; this.h=26;
      this.vx=0; this.vy=0; this.onGround=false; this.onLadder=false; this.facing=1;
      this.maxHealth=60; this.health=this.maxHealth; this.damageCD=0; this.invuln=0; this.dead=false;
      this.maxJetFuel=100; this.jetFuel=this.maxJetFuel; this.meleeCD=0; this.swingTimer=0; this.prevY=y;
      this.levitating=false; this.levitateTimer=0;
    }
    rect(){ return {x:this.x,y:this.y,w:this.w,h:this.h}; }
  }

  class Zombie {
    constructor(x,y){
      this.x=x; this.y=y; this.w=13; this.h=25;
      this.vx=0; this.vy=0; this.speed=0.5;
      this.health=40; this.alive=true; this.damageCD=0;
      this.bumpCD=0; this.chickenCD=0;
    }
    rect(){ return {x:this.x,y:this.y,w:this.w,h:this.h}; }
  }

  class Structure {
    constructor(x,y,type){
      this.x=x; this.y=y; this.type=type;
      this.w=20;
      this.h=(type==='sky')?20:40;
      this.health=(type==='ladder'?80:(type==='sky'?100:150));
      this.maxHealth=this.health;
      this.open=false; this.falling=false; this.vy=0; this.shake=0; this.supported=true;
      this.id=(Structure._id=(Structure._id||0)+1);
      if(type==='sky'){ this.anchorX=x; this.anchorY=y; } // pin position
    }
    rect(){ return {x:this.x,y:this.y,w:this.w,h:this.h}; }
  }

  class Projectile{
    constructor(){ this.active=false; this.type='laser'; this.x=0; this.y=0; this.vx=0; this.vy=0; this.dir=1; this.life=0; this.owner='player'; }
    rect(){ return {x:this.x-6,y:this.y-6,w:12,h:12}; }
  }

  class Explosion{ constructor(){ this.active=false; this.x=0; this.y=0; this.r=0; this.maxR=92; this.age=0; this.life=32; this.particles=[]; } }

  class Bird{ constructor(x,y,vx){ this.x=x; this.y=y; this.vx=vx; this.dropTimer=100+Math.random()*120; this.alive=true; } rect(){ return {x:this.x-8,y:this.y-6,w:16,h:12}; } }

  window.Entities={Player,Zombie,Structure,Projectile,Explosion,Bird};
})();
