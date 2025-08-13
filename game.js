(function(){
  'use strict';
  console.log('[ZD] game.js v18 loaded');

  const COLORS={
    sky:'#0b0f17', ground:'#1b2230', grid:'#222b3a',
    playerBody:'#3b82f6', playerHead:'#facc15',
    zombie:'#22c55e', laser:'#22d3ee', bomb:'#f97316',
    wall:'#6b7280', door:'#8b5cf6', doorOpen:'#8b5cf6aa',
    ladder:'#f59e0b', structureHurt:'#ef4444',
    hpGreen:'#22c55e', hpRed:'#ef4444'
  };
  const TILE=20, WORLD_W=1200, WORLD_H=700, GROUND_Y=WORLD_H-50, GRAVITY=0.8;
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const dist2=(x1,y1,x2,y2)=>{const dx=x1-x2,dy=y1-y2; return dx*dx+dy*dy;};
  const rnd=(min,max)=>Math.random()*(max-min)+min;

  class SpatialGrid{
    constructor(cell=TILE){ this.cell=cell; this.map=new Map(); }
    key(cx,cy){ return `${cx},${cy}`; }
    insert(aabb,ref){
      const x0=Math.floor(aabb.x/this.cell), y0=Math.floor(aabb.y/this.cell);
      const x1=Math.floor((aabb.x+aabb.w)/this.cell), y1=Math.floor((aabb.y+aabb.h)/this.cell);
      for(let cy=y0; cy<=y1; cy++){ for(let cx=x0; cx<=x1; cx++){
        const k=this.key(cx,cy); if(!this.map.has(k)) this.map.set(k,new Set()); this.map.get(k).add(ref);
      }}
    }
    query(aabb){
      const out=new Set();
      const x0=Math.floor(aabb.x/this.cell), y0=Math.floor(aabb.y/this.cell);
      const x1=Math.floor((aabb.x+aabb.w)/this.cell), y1=Math.floor((aabb.y+aabb.h)/this.cell);
      for(let cy=y0; cy<=y1; cy++){ for(let cx=x0; cx<=x1; cx++){
        const s=this.map.get(this.key(cx,cy)); if(s) s.forEach(v=>out.add(v));
      }}
      return [...out];
    }
    clear(){ this.map.clear(); }
  }

  const { Player,Zombie,Structure,Projectile,Explosion,Bird } = window.Entities;
  const { aabbIntersect, resolveWorldCollision, resolveStructuresCollision } = window.Physics;
  const R = window.Render;

  class Game{
    constructor(canvas){
      this.canvas=canvas; this.ctx=canvas.getContext('2d');
      this.COLORS=COLORS; this.TILE=TILE; this.WORLD_W=WORLD_W; this.WORLD_H=WORLD_H; this.GROUND_Y=GROUND_Y; this.GRAVITY=GRAVITY;
      this.scale=1; this.frame=0; this.accum=0; this.frames=0; this.fps=0;
      this.grid=new SpatialGrid(TILE);
      this.player=new Player(200, GROUND_Y-26);
      this.zombies=[]; this.structures=[];
      this.projectiles=Array.from({length:120}, ()=>new Projectile());
      this.explosions=Array.from({length:32}, ()=>new Explosion());
      this.birds=[];
      this.buildType='wall';
      this.mouse={x:0,y:0, worldX:0, worldY:0};
      this.buildCursor={gx:0, gy:0, canPlace:false};
      this.spawnTimer=0; this.birdTimer=3000;
      this.gameOver=false; this._dbgKeymap=null;

      this.surpriseTimer = 15000 + Math.random()*15000;
      this.stormActive=false; this.stormTimer=0;

      this.showHelp=true; // full command list always visible (left side)
    }
    toggleHelp(){ this.showHelp=!this.showHelp; }

    reset(){
      this.player = new Player(200, GROUND_Y-26);
      this.zombies.length=0; this.structures.length=0; this.birds.length=0;
      this.projectiles.forEach(p=>p.active=false);
      this.explosions.forEach(e=>e.active=false);
      this.spawnTimer=0; this.birdTimer=2000; this.gameOver=false;
      this.surpriseTimer = 15000 + Math.random()*15000; this.stormActive=false; this.stormTimer=0;
      this.addStructure(520, GROUND_Y-40, 'door');
      this.addStructure(540, GROUND_Y-40, 'wall');
      this.addStructure(560, GROUND_Y-40, 'ladder');
    }

    get solidRects(){
      const out=[];
      for(const s of this.structures){
        if(s.type==='door' && s.open) continue;
        if(s.type==='ladder') continue;
        if(s.type==='sky')   continue;
        out.push({x:s.x,y:s.y,w:s.w,h:s.h});
      }
      return out;
    }

    update(dt, keymap){
      this._dbgKeymap = keymap;
      if(this.gameOver){
        if(keymap.reset){ this.reset(); }
        return;
      }

      this.frame++; this.accum+=dt; this.frames++;
      if(this.accum>=500){ this.fps=Math.round(1000*this.frames/this.accum); this.accum=0; this.frames=0; }

      // build cursor
      const gx=Math.floor(this.mouse.worldX / this.TILE), gy=Math.floor(this.mouse.worldY / this.TILE);
      this.buildCursor.gx = Math.max(0, Math.min(Math.floor((WORLD_W-TILE)/TILE), gx));
      this.buildCursor.gy = Math.max(0, Math.min(Math.floor((GROUND_Y - TILE*2)/TILE), gy));
      this.buildCursor.canPlace = this.canPlaceAt(this.buildCursor.gx*this.TILE, this.buildCursor.gy*this.TILE, this.buildType);

      // Float (Y)
      if(keymap.float && !this.player.levitating){
        this.player.levitating = true;
        this.player.levitateTimer = 30000; // 30s
        keymap.float = false;
      }

      this.updatePlayer(dt, keymap);
      this.updateZombies();
      this.updateProjectiles();
      this.updateExplosions();
      this.updateStructures();
      this.updateBirds(dt);
      this.updateSurprise(dt);

      // spawner
      this.spawnTimer -= dt;
      if(this.spawnTimer<=0){ this.spawnZombieWave(); this.spawnTimer=2500; }
    }

    updatePlayer(dt, keymap){
      const p=this.player; const moveSpeed=3.0; const maxVy=18;
      p.prevY=p.y; p.onLadder=false;

      if(p.levitating){
        const targetY = (this.WORLD_H * 0.5) - p.h/2;
        if(keymap.left){ p.vx=-moveSpeed; p.facing=-1; }
        else if(keymap.right){ p.vx=moveSpeed; p.facing=1; }
        else p.vx*=0.7;
        p.y += (targetY - p.y) * 0.35; p.vy=0; p.x += p.vx;
        p.levitateTimer -= dt; if(p.levitateTimer<=0){ p.levitating=false; }
      } else {
        const ladderRect = this.findLadderAt(p.rect());
        const touchingLadder = !!ladderRect && aabbIntersect(p.rect(), ladderRect);
        if(touchingLadder){
          p.onLadder = true;
          if(keymap.up)        { p.y -= 2.2; p.vy=0; }
          else if(keymap.down) { p.y += 2.2; p.vy=0; }
          else                 { p.vy = 0; }
        }

        if(keymap.left){ p.vx=-moveSpeed; p.facing=-1; }
        else if(keymap.right){ p.vx=moveSpeed; p.facing=1; }
        else p.vx*=0.7;

        // Higher jump so you CLEAR a zombie
        if(keymap.up && p.onGround && !touchingLadder){ p.vy=-22; p.onGround=false; }  // was -18

        // Slower jetpack
        let thrust=0;
        if(keymap.jet && p.jetFuel>0){ thrust=-0.95; p.jetFuel-=0.45; }
        else { p.jetFuel += p.onGround ? 1.0 : 0.3; }
        p.jetFuel=clamp(p.jetFuel,0,p.maxJetFuel);

        if(!p.onLadder){ p.vy += GRAVITY; }
        p.vy += thrust;
        p.vy = clamp(p.vy, -8, maxVy);

        p.x+=p.vx; p.y+=p.vy;

        resolveWorldCollision(p, GROUND_Y);
        resolveStructuresCollision(p, this.solidRects);
        p.x = clamp(p.x, 0, this.WORLD_W - p.w);
      }

      if(p.damageCD>0) p.damageCD -= dt*0.06;
      if(p.invuln>0) p.invuln -= dt*0.06;
      if(p.meleeCD>0) p.meleeCD--;
      if(p.swingTimer>0) p.swingTimer--;

      if(this._dbgKeymap.fire){ this.fireLaser(); }
      if(this._dbgKeymap.bomb){ this.fireBomb(); this._dbgKeymap.bomb=false; }
      if(this._dbgKeymap.melee){ this.meleeAttack(); this._dbgKeymap.melee=false; }
    }

    meleeAttack(){
      const p=this.player; if(p.meleeCD>0) return;
      p.meleeCD=18; p.swingTimer=12;
      const range=24;
      const hitbox={x:(p.facing===1?p.x+p.w:p.x-range), y:p.y, w:range, h:p.h};
      for(const z of this.zombies){ if(!z.alive) continue; if(aabbIntersect(hitbox,z.rect())){ z.health-=40; z.vx+=p.facing*1.3; if(z.health<=0) z.alive=false; } }
      for(const s of this.structures){ if(aabbIntersect(hitbox,s.rect())) s.health-=10; }
    }

    updateZombies(){
      const p=this.player;

      // chicken toss when zombies bump
      for(let i=0;i<this.zombies.length;i++){
        const a=this.zombies[i]; if(!a.alive) continue;
        for(let j=i+1;j<this.zombies.length;j++){
          const b=this.zombies[j]; if(!b.alive) continue;
          const ar=a.rect(), br=b.rect();
          const touching = ar.x < br.x+br.w && ar.x+ar.w > br.x && ar.y < br.y+br.h && ar.y+ar.h > br.y;
          if(touching){
            if(a.chickenCD<=0){ this.spawnChicken(a.x+a.w/2, a.y+8, Math.sign((b.x - a.x)) * (2 + Math.random()*1.5), -4); a.chickenCD=90; }
            if(b.chickenCD<=0){ this.spawnChicken(b.x+b.w/2, b.y+8, Math.sign((a.x - b.x)) * (2 + Math.random()*1.5), -4); b.chickenCD=90; }
          }
        }
      }

      for(const z of this.zombies){
        if(!z.alive) continue;
        if(z.bumpCD>0) z.bumpCD--;
        if(z.chickenCD>0) z.chickenCD--;

        const dir=Math.sign((p.x+p.w/2)-(z.x+z.w/2));
        z.vx=dir*z.speed; z.vy+=GRAVITY; z.vy=Math.max(-18, Math.min(14, z.vy));
        z.x+=z.vx; z.y+=z.vy;

        resolveWorldCollision(z, GROUND_Y);
        resolveStructuresCollision(z, this.solidRects);

        // break blocks on side bumps
        for(const s of this.structures){
          if(s.type==='door' && s.open) continue;
          const zr=z.rect(), sr=s.rect();
          const verticalOverlap = zr.y < sr.y+sr.h && zr.y+zr.h > sr.y;
          const touchingRight = Math.abs((zr.x+zr.w) - sr.x) < 2;
          const touchingLeft  = Math.abs(zr.x - (sr.x+sr.w)) < 2;
          if(verticalOverlap && (touchingLeft || touchingRight)){
            if(z.bumpCD<=0){ s.health -= 55; z.bumpCD=22; }
          }
        }

        // player collision / stomp kill
        const zr=z.rect(), pr=p.rect();
        if(!p.levitating && aabbIntersect(pr,zr)){
          // Stomp if player was above and moving down
          const prevBottom = p.prevY + p.h;
          const isComingFromAbove = prevBottom <= (z.y + 2);
          if(p.vy > 1.5 && isComingFromAbove){
            z.alive=false;
            p.vy = -12;               // bounce
            p.onGround=false;
          } else if(p.invuln<=0 && !p.dead){
            this.damagePlayer(25); p.invuln=40;
          }
        }

        if(z.y>WORLD_H+200) z.alive=false;
      }
      this.zombies=this.zombies.filter(z=>z.alive && z.health>0);
    }

    // pin SKY blocks; support/fall others
    updateStructures(){
      for(const s of this.structures){
        if(s.type==='sky'){
          s.x = (s.anchorX!=null)? s.anchorX : s.x;
          s.y = (s.anchorY!=null)? s.anchorY : s.y;
          s.supported=true; s.falling=false; s.vy=0; s.shake=0;
        }
      }

      const byColumn=new Map();
      for(const s of this.structures){
        if(s.type==='sky') continue;
        const cx=Math.floor(s.x/TILE);
        if(!byColumn.has(cx)) byColumn.set(cx,[]);
        byColumn.get(cx).push(s);
      }
      for(const list of byColumn.values()) list.sort((a,b)=>a.y-b.y);

      for(const list of byColumn.values()){
        for(const s of list){
          const touchingGround=(s.y+s.h>=GROUND_Y-0.5);
          let supported=touchingGround;
          if(!supported){
            for(const other of list){
              if(other===s) continue;
              const isBelow=(other.y>=s.y+s.h-1)&&Math.abs(other.x-s.x)<2;
              if(isBelow){ supported=true; break; }
            }
          }
          s.supported=supported; if(!supported) s.falling=true;
        }
      }

      for(const s of this.structures){
        if(s.type==='sky') continue;
        if(s.falling){
          s.vy+=GRAVITY; s.vy=Math.max(-30, Math.min(22, s.vy)); s.y+=s.vy; s.shake=1;
          if(s.y+s.h>=GROUND_Y){ s.y=GROUND_Y-s.h; s.vy=0; s.falling=false; s.supported=true; }
          for(const other of this.structures){
            if(other===s || other.type==='sky') continue;
            if(Math.abs(other.x-s.x)<2 && s.y+s.h>other.y-1 && s.y<other.y && !other.falling){
              s.y=other.y-s.h; s.vy=0; s.falling=false; s.supported=true; break;
            }
          }
        } else { s.shake=0; }
      }

      this.structures=this.structures.filter(s=>s.health>0);
    }

    updateProjectiles(){
      this.grid.clear(); for(const s of this.structures){ this.grid.insert({x:s.x,y:s.y,w:s.w,h:s.h}, s); }
      for(const pr of this.projectiles){
        if(!pr.active) continue;

        if(pr.type==='laser'){
          pr.x+=pr.vx; pr.life--;
          let hit=false;
          for(const s of this.grid.query(pr.rect())){
            if(s.type==='door' && s.open) continue;
            if(aabbIntersect(pr.rect(), s.rect())){ s.health-=20; hit=true; break; }
          }
          if(!hit){
            for(const z of this.zombies){
              if(aabbIntersect(pr.rect(), z.rect())){ z.health-=25; if(z.health<=0) z.alive=false; hit=true; break; }
            }
          }
          if(hit){ pr.active=false; }
          if(pr.life<=0 || pr.x<-50 || pr.x>WORLD_W+50) pr.active=false;

        } else if(pr.type==='bomb' || pr.type==='hammer' || pr.type==='chicken'){
          const g = pr.type==='hammer' ? 0.35 : (pr.type==='chicken' ? 0.4 : 0.5);
          pr.vy += g;
          if(pr.type==='hammer'){ pr.vx*=0.985; pr.vy*=0.995; }
          pr.x += pr.vx; pr.y += pr.vy; pr.life--;

          let explode=false;
          if(pr.type==='bomb' || pr.type==='chicken'){
            for(const z of this.zombies){
              if(!z.alive) continue;
              if(aabbIntersect(pr.rect(), z.rect())){
                if(pr.type==='chicken'){ z.health -= 100; if(z.health<=0) z.alive=false; pr.active=false; explode=true; break; }
                explode=true; break;
              }
            }
          }
          if(!explode){
            if(pr.y>=GROUND_Y-2){ explode=true; pr.y=GROUND_Y-2; }
            if(!explode){
              for(const s of this.grid.query(pr.rect())){
                if(aabbIntersect(pr.rect(), s.rect())){ explode=true; break; }
              }
            }
          }
          if(explode||pr.life<=0){ this.spawnExplosion(pr.x, pr.y, (pr.type==='chicken')? 80 : 100); pr.active=false; }
          if(pr.y>WORLD_H+200) pr.active=false;
        }
      }
    }

    updateExplosions(){
      for(const ex of this.explosions){
        if(!ex.active) continue;
        ex.age++; ex.r=lerp(8, ex.maxR, ex.age/ex.life);
        if(ex.age===2 || ex.age===6 || ex.age===10){
          const r2=(ex.r*ex.r);
          for(const z of this.zombies){
            if(!z.alive) continue;
            const d2=dist2(ex.x,ex.y, z.x+z.w/2, z.y+z.h/2);
            if(d2<r2){ z.health-=80; if(z.health<=0) z.alive=false; }
          }
          for(const s of this.structures){
            const d2=dist2(ex.x,ex.y, s.x+s.w/2, s.y+s.h/2);
            if(d2<r2){ const d=Math.sqrt(d2); const dmg=Math.max(25, 90*(1 - d/ex.maxR)); s.health-=dmg; }
          }
        }
        for(const p of ex.particles){ p.x+=p.vx; p.y+=p.vy; p.vy+=0.2; p.life-=0.04; }
        ex.particles=ex.particles.filter(p=>p.life>0);
        if(ex.age>=ex.life){ ex.active=false; }
      }
    }

    updateBirds(dt){
      this.birdTimer -= dt;
      if(this.birdTimer<=0){
        const fromLeft = Math.random()<0.5;
        const y = 40 + Math.random()*60;
        const x = fromLeft ? -30 : this.WORLD_W+30;
        const vx = fromLeft ? (1.5+Math.random()*1.2) : -(1.5+Math.random()*1.2);
        this.birds.push(new Bird(x,y,vx));
        this.birdTimer = 4000 + Math.random()*3000;
      }
      for(const b of this.birds){
        if(!b.alive) continue;
        b.x += b.vx; b.dropTimer -= 1;
        if(b.dropTimer<=0){ this.dropHammer(b.x, b.y+6, b.vx*0.15); b.dropTimer=9999; }
        if(b.x < -60 || b.x > this.WORLD_W+60) b.alive=false;
      }
      this.birds=this.birds.filter(b=>b.alive);
    }

    updateSurprise(dt){
      if(this.stormActive){
        this.stormTimer -= dt;
        if(this.stormTimer<=0){ this.stormActive=false; this.surpriseTimer = 15000 + Math.random()*15000; }
      } else {
        this.surpriseTimer -= dt;
        if(this.surpriseTimer<=0){ this.triggerChickenStorm(); this.stormActive=true; this.stormTimer=5000; }
      }
    }
    triggerChickenStorm(){
      for(let i=0;i<9;i++){
        const x = 20 + Math.random()*(this.WORLD_W-40);
        const vx = (Math.random()<0.5? -1:1) * (0.5 + Math.random()*0.8);
        this.spawnChicken(x, 20 + Math.random()*60, vx, 0.0);
      }
    }

    dropHammer(x,y,vx){ const pr=this.getProjectile(); if(!pr) return; pr.active=true; pr.type='hammer'; pr.x=x; pr.y=y; pr.vx=vx; pr.vy=0.2; pr.life=260; }
    spawnChicken(x,y,vx,vy){ const pr=this.getProjectile(); if(!pr) return; pr.active=true; pr.type='chicken'; pr.x=x; pr.y=y; pr.vx=vx; pr.vy=vy; pr.life=220; }

    render(){
      const ctx=this.ctx;
      ctx.clearRect(0,0,WORLD_W,WORLD_H);
      if(this.stormActive){ ctx.fillStyle='#0b0f17'; ctx.fillRect(0,0,WORLD_W,WORLD_H); ctx.fillStyle='rgba(255,255,255,0.03)'; ctx.fillRect(0,0,WORLD_W,WORLD_H); }
      else { ctx.fillStyle=COLORS.sky; ctx.fillRect(0,0,WORLD_W,WORLD_H); }

      R.drawGrid(ctx, WORLD_W, WORLD_H, TILE, COLORS.grid);
      R.drawGround(ctx, COLORS, GROUND_Y, WORLD_W, WORLD_H);

      for(const b of this.birds){ R.drawBird(ctx, b); }
      for(const s of this.structures){ R.drawStructure(ctx, s, COLORS); }
      R.drawPlayer(ctx, this.player, this.frame, COLORS);

      const p=this.player;
      if(p.levitating){
        ctx.save();
        ctx.globalAlpha=0.35; ctx.beginPath(); ctx.arc(p.x+p.w/2, p.y+p.h/2, p.h, 0, Math.PI*2);
        ctx.strokeStyle='#a78bfa'; ctx.lineWidth=2; ctx.stroke();
        ctx.globalAlpha=1; ctx.fillStyle='#c4b5fd'; ctx.font='11px monospace';
        ctx.fillText(`Float: ${Math.ceil(p.levitateTimer/1000)}s`, p.x-6, p.y-8);
        ctx.restore();
      }

      for(const z of this.zombies){ R.drawZombie(ctx, z, COLORS); }
      for(const pr of this.projectiles){ if(pr.active) R.drawProjectile(ctx, pr, COLORS); }
      for(const ex of this.explosions){ if(ex.active) R.drawExplosion(ctx, ex); }

      R.drawBuildPreview(ctx, this);

      // ====== Clean HUD ======
      const uiPadL = 14, uiPadR = 16, uiTop = 14, barW = 190, barH = 10, gap = 8;

      // FPS (top-left small)
      ctx.fillStyle='#94a3b8'; ctx.font='12px monospace'; ctx.textAlign='left'; ctx.textBaseline='top';
      ctx.fillText(`FPS: ${this.fps}`, uiPadL, uiTop - 10);

      // Labels at left of bars
      ctx.fillStyle='#e5e7eb'; ctx.font='12px monospace';
      ctx.fillText('HP', uiPadL, uiTop);
      ctx.fillText('Fuel', uiPadL, uiTop + barH + gap);

      // Bars (to the right of labels)
      const barX = uiPadL + 28; // room for label
      // Health
      ctx.fillStyle='#111827'; ctx.fillRect(barX, uiTop, barW, barH);
      const hpPct = Math.max(0, Math.min(1, p.health / p.maxHealth));
      ctx.fillStyle = COLORS.hpGreen; ctx.fillRect(barX, uiTop, barW*hpPct, barH);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.strokeRect(barX+0.5, uiTop+0.5, barW-1, barH-1);
      // Jetpack
      const jy = uiTop + barH + gap;
      ctx.fillStyle='#111827'; ctx.fillRect(barX, jy, barW, barH);
      const jfPct = Math.max(0, Math.min(1, p.jetFuel / p.maxJetFuel));
      ctx.fillStyle = '#38bdf8'; ctx.fillRect(barX, jy, barW*jfPct, barH);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.strokeRect(barX+0.5, jy+0.5, barW-1, barH-1);

      // Top-right metrics (moved in from the edge & top-aligned)
      ctx.fillStyle='#e5e7eb'; ctx.font='12px monospace';
      ctx.textAlign='right'; ctx.textBaseline='top';
      ctx.fillText(`Z: ${this.zombies.length}  |  Blocks: ${this.structures.length}  |  Build: ${this.buildType}`, WORLD_W - uiPadR, uiTop);

      // Full command list (left column)
      if(this.showHelp){
        const lines = [
          'Controls',
          '———',
          'Move: A/D or ←/→',
          'Jump/Climb: W or ↑',
          'Jetpack: J',
          'Sword: V',
          'Laser: Space',
          'Bomb: B',
          'Build: Click (1=Wall, 2=Door, 3=Ladder, 4=Sky)',
          'Toggle Door: E',
          'Float (30s): Y',
          'Reset: R',
          'Help toggle: H'
        ];
        const panelX = uiPadL, panelY = jy + barH + 14, panelW = 420, lineH = 16;
        const panelH = lines.length * lineH + 14;

        ctx.save();
        ctx.globalAlpha = 0.18; ctx.fillStyle = '#000'; ctx.fillRect(panelX, panelY, panelW, panelH);
        ctx.globalAlpha = 1; ctx.strokeStyle='rgba(255,255,255,0.10)'; ctx.strokeRect(panelX+0.5, panelY+0.5, panelW-1, panelH-1);
        ctx.fillStyle = '#cbd5e1'; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign='left'; ctx.textBaseline='top';
        for(let i=0;i<lines.length;i++){
          const y = panelY + 8 + i*lineH;
          ctx.fillText(lines[i], panelX + 10, y);
        }
        ctx.restore();
      }

      // Game Over overlay
      if(this.gameOver){
        ctx.save();
        ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(0,0,WORLD_W,WORLD_H);
        ctx.fillStyle='#ffffff'; ctx.font='bold 36px system-ui, sans-serif';
        ctx.textAlign='left'; ctx.textBaseline='alphabetic';
        ctx.fillText('GAME OVER', WORLD_W/2-120, WORLD_H/2-20);
        ctx.font='16px system-ui, sans-serif';
        ctx.fillText('Press R to Restart', WORLD_W/2-90, WORLD_H/2+16);
        ctx.restore();
      }
    }

    damagePlayer(amount){
      const p=this.player;
      if(p.levitating) return;
      if(p.damageCD>0 || p.dead) return;
      p.health-=amount; if(p.health<=0){ p.health=0; p.dead=true; this.gameOver=true; }
      p.damageCD=30;
    }

    fireLaser(){
      if(this.gameOver) return;
      const p=this.player;
      const pr=this.getProjectile(); if(!pr) return;
      pr.active=true; pr.type='laser'; pr.x=p.x+p.w/2+p.facing*14; pr.y=p.y+p.h/2-4;
      pr.vx=15*p.facing; pr.vy=0; pr.life=60; pr.dir=p.facing;
    }

    fireBomb(){
      if(this.gameOver) return;
      const p=this.player;
      const pr=this.getProjectile(); if(!pr) return;
      pr.active=true; pr.type='bomb'; pr.x=p.x+p.w/2+p.facing*12; pr.y=p.y+3;
      pr.vx=6*p.facing; pr.vy=-6; pr.life=160; pr.dir=p.facing;
    }

    getProjectile(){ return this.projectiles.find(p=>!p.active); }

    spawnExplosion(x,y,maxR=92){
      const ex=this.explosions.find(e=>!e.active); if(!ex) return;
      ex.active=true; ex.x=x; ex.y=y; ex.age=0; ex.r=0; ex.maxR=maxR; ex.life=32;
      ex.particles.length=0;
      for(let i=0;i<22;i++){ ex.particles.push({ x, y, vx:rnd(-2.6,2.6), vy:rnd(-4.2,-1.0), r:rnd(1.5,3), life:1, color:i%2? '#fb923c':'#fde047' }); }
    }

    canPlaceAt(x,y,type){
      const h=(type==='sky'?this.TILE:this.TILE*2);
      if(y<0 || y+h>GROUND_Y) return false;
      const rect={x,y,w:this.TILE,h};
      for(const s of this.structures){
        const r=s.rect();
        if(r.x<rect.x+rect.w && r.x+r.w>rect.x && r.y<rect.y+rect.h && r.y+r.h>rect.y) return false;
      }
      return true;
    }
    addStructure(x,y,type){ const s=new Structure(x,y,type); this.structures.push(s); return s; }
    findStructureAtPoint(px,py){ for(const s of this.structures){ if(px>=s.x && px<=s.x+s.w && py>=s.y && py<=s.y+s.h) return s; } return null; }
    findLadderAt(rect){ for(const s of this.structures){ if(s.type==='ladder' && aabbIntersect(rect, s.rect())) return s.rect(); } return null; }
    tryToggleDoorAtCursor(){ const s=this.findStructureAtPoint(this.mouse.worldX, this.mouse.worldY); if(s && s.type==='door'){ s.open=!s.open; } }
    selectBuildTypeByKey(k){ const map={'1':'wall','2':'door','3':'ladder','4':'sky'}; this.buildType=map[k]||'wall'; }

    spawnZombieWave(){
      const count=1+Math.floor(Math.random()*3);
      for(let i=0;i<count;i++){
        const side=Math.random()<0.5? -30: WORLD_W+30;
        const z=new Zombie(side, GROUND_Y-25);
        this.zombies.push(z);
      }
    }
  }

  // Boot
  const canvas=document.getElementById('game');
  const game = new Game(canvas);
  // scale is set by input.js fit()
  game.scale = (canvas.getBoundingClientRect().width || game.WORLD_W) / game.WORLD_W;
  const { keymap } = window.Input.setup(game, canvas);

  // Seed blocks
  game.addStructure(520, GROUND_Y-40, 'door');
  game.addStructure(540, GROUND_Y-40, 'wall');
  game.addStructure(560, GROUND_Y-40, 'ladder');

  let last=performance.now();
  function loop(now){ const dt=now-last; last=now; game.update(dt, keymap); game.render(); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
})();
