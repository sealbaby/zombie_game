(function(){
  'use strict';

  function drawGrid(ctx, WORLD_W, WORLD_H, TILE, color){
    ctx.save(); ctx.strokeStyle=color; ctx.lineWidth=1;
    for(let x=0;x<=WORLD_W;x+=TILE){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,WORLD_H); ctx.stroke(); }
    for(let y=0;y<=WORLD_H;y+=TILE){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(WORLD_W,y); ctx.stroke(); }
    ctx.restore();
  }

  function drawGround(ctx, COLORS, GROUND_Y, WORLD_W, WORLD_H){
    ctx.fillStyle=COLORS.ground; ctx.fillRect(0, GROUND_Y, WORLD_W, WORLD_H-GROUND_Y);
  }

  // sword scaled down
  function drawSword(ctx, p){
    if(p.swingTimer<=0) return;
    const total=12, t=p.swingTimer, progress=1-(t/total);
    const facing = p.facing===1 ? 1 : -1;
    const baseX = facing===1 ? (p.x+p.w) : p.x;
    const baseY = p.y + p.h/2;
    const angle = (-0.9 + progress*1.8);
    ctx.save(); ctx.translate(baseX, baseY); ctx.scale(facing,1); ctx.rotate(angle);
    ctx.fillStyle='#f59e0b'; ctx.fillRect(-2,-3,3,6);     // hilt
    ctx.fillStyle='#e5e7eb'; ctx.fillRect(0,-2,18,4);     // blade
    ctx.beginPath(); ctx.arc(18,0,2,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill();
    ctx.restore();
  }

  function drawPlayer(ctx, p, frame, COLORS){
    const flicker = (p.damageCD>0 && (Math.floor(frame/2)%2===0));
    ctx.save(); if(flicker) ctx.globalAlpha=0.5;
    ctx.fillStyle=COLORS.playerBody; ctx.fillRect(p.x,p.y,p.w,p.h);
    ctx.beginPath(); ctx.fillStyle=COLORS.playerHead; ctx.arc(p.x+p.w/2,p.y-5,6,0,Math.PI*2); ctx.fill(); // head r=6 (was 12)
    ctx.restore();
    drawSword(ctx,p);
  }

  function drawZombie(ctx, z, COLORS){
    ctx.save(); if(!z.alive) ctx.globalAlpha=0.3;
    ctx.fillStyle=COLORS.zombie;
    ctx.fillRect(z.x,z.y,z.w,z.h);
    ctx.beginPath(); ctx.arc(z.x+z.w/2,z.y-4,5,0,Math.PI*2); ctx.fill(); // head r=5
    ctx.restore();
  }

  function drawStructure(ctx, s, COLORS){
    ctx.save();
    const isDoor=s.type==='door', isLadder=s.type==='ladder', isSky=s.type==='sky';
    let color = isDoor ? (s.open?COLORS.doorOpen:COLORS.door) : (isLadder?COLORS.ladder : (isSky? '#67e8f9' : COLORS.wall));
    if(s.health<s.maxHealth){ const alpha=1-(s.health/s.maxHealth); ctx.globalAlpha=0.15+alpha*0.3; }
    ctx.fillStyle=color; const shakeX=s.falling?(Math.random()*2-1):0;
    ctx.fillRect(s.x+shakeX,s.y,s.w,s.h);

    ctx.globalAlpha=1;
    const hpw=(s.health/s.maxHealth)*s.w;
    ctx.fillStyle='#151824'; ctx.fillRect(s.x, s.y-6, s.w, 3);
    ctx.fillStyle=COLORS.hpGreen; ctx.fillRect(s.x, s.y-6, hpw, 3);

    if(isLadder){
      ctx.strokeStyle='#fbbf24'; ctx.lineWidth=2;
      for(let ry=s.y+6; ry<s.y+s.h; ry+=7){ ctx.beginPath(); ctx.moveTo(s.x+4,ry); ctx.lineTo(s.x+s.w-4,ry); ctx.stroke(); }
    }
    ctx.restore();
  }

  function drawProjectile(ctx, pr, COLORS){
    if(pr.type==='laser'){
      ctx.fillStyle=COLORS.laser; ctx.fillRect(pr.x-6, pr.y-2, 12, 3);
    } else if(pr.type==='hammer'){
      ctx.save(); ctx.translate(pr.x, pr.y);
      ctx.fillStyle='#d1d5db'; ctx.fillRect(-8, -4, 16, 8);   // smaller head
      ctx.fillStyle='#8b5e3c'; ctx.fillRect(-2, 4, 4, 10);    // handle
      ctx.restore();
    } else if(pr.type==='chicken'){
      ctx.save(); ctx.translate(pr.x, pr.y);
      ctx.fillStyle='#fef3c7'; ctx.beginPath(); ctx.ellipse(0,0,6,3,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#ef4444'; ctx.beginPath(); ctx.arc(-4,-3,2,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#f59e0b'; ctx.beginPath(); ctx.moveTo(6,0); ctx.lineTo(9,-1); ctx.lineTo(6,-2); ctx.closePath(); ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle=COLORS.bomb; ctx.beginPath(); ctx.arc(pr.x, pr.y, 5, 0, Math.PI*2); ctx.fill();
    }
  }

  function drawExplosion(ctx, ex){
    const r=ex.r; ctx.save(); ctx.globalCompositeOperation='lighter';
    for(let i=0;i<3;i++){ ctx.beginPath(); ctx.arc(ex.x,ex.y,r*(1-i*0.15),0,Math.PI*2); ctx.lineWidth=3-i*0.5; ctx.strokeStyle=i===0?'#fde047':(i===1?'#fb923c':'#ef4444'); ctx.stroke(); }
    ctx.globalCompositeOperation='source-over';
    for(const p of ex.particles){ ctx.globalAlpha=Math.max(0,Math.min(1,p.life)); ctx.beginPath(); ctx.arc(p.x,p.y,p.r*0.7,0,Math.PI*2); ctx.fillStyle=p.color; ctx.fill(); }
    ctx.globalAlpha=1; ctx.restore();
  }

  function drawBird(ctx, b){
    ctx.save(); ctx.translate(b.x,b.y);
    ctx.strokeStyle='#93c5fd'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(-8,0); ctx.quadraticCurveTo(0,-6,8,0); ctx.stroke();
    ctx.restore();
  }

  function drawBuildPreview(ctx, game){
    const { gx, gy, canPlace } = game.buildCursor;
    const px=gx*game.TILE, py=gy*game.TILE;
    const type = game.buildType;
    const w = game.TILE, h = (type==='sky'? game.TILE : game.TILE*2);
    ctx.save(); ctx.globalAlpha=0.5; ctx.fillStyle=(canPlace?'#10b981':'#ef4444');
    ctx.fillRect(px,py,w,h);
    ctx.globalAlpha=0.8; ctx.lineWidth=2;
    let c=game.COLORS.wall; if(type==='door') c=game.COLORS.door; if(type==='ladder') c=game.COLORS.ladder; if(type==='sky') c='#67e8f9';
    ctx.strokeStyle=c; ctx.strokeRect(px+1,py+1,w-2,h-2);
    ctx.restore();
  }

  window.Render = { drawGrid, drawGround, drawPlayer, drawZombie, drawStructure, drawProjectile, drawExplosion, drawBuildPreview, drawBird };
})();