(function () {
  'use strict';

  function drawGrid(ctx, W, H, tile, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.2;
    for (let x = 0; x <= W; x += tile) {
      ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke();
    }
    for (let y = 0; y <= H; y += tile) {
      ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke();
    }
    ctx.restore();
  }

  function drawGround(ctx, COLORS, GROUND_Y, W, H) {
    ctx.fillStyle = COLORS.ground;
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  }

  function drawPlayer(ctx, p, frame, COLORS) {
    const flash = p.damageCD > 0 && ((frame >> 1) % 2 === 0);
    // body
    ctx.fillStyle = flash ? COLORS.structureHurt : COLORS.playerBody;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    // head
    ctx.beginPath();
    ctx.fillStyle = COLORS.playerHead;
    ctx.arc(p.x + p.w * 0.5, p.y - 6, 6, 0, Math.PI * 2);
    ctx.fill();

    // jet flame (subtle)
    if (p.jetVisual > 0) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#93c5fd';
      const fx = p.x + (p.facing === 1 ? p.w - 3 : 3);
      ctx.beginPath();
      ctx.ellipse(fx, p.y + p.h - 2, 3, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      p.jetVisual--;
    }

    // sword
    if (p.swingTimer > 0) {
      const len = 16;
      const sx = p.facing === 1 ? p.x + p.w + 2 : p.x - len - 2;
      const sy = p.y + 4;
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(sx, sy, len, 3);
    }
  }

  function drawZombie(ctx, z, COLORS) {
    ctx.fillStyle = COLORS.zombie;
    ctx.fillRect(z.x, z.y, z.w, z.h);
    ctx.fillStyle = '#14532d';
    ctx.fillRect(z.x + 2, z.y + 2, z.w - 4, 3);
  }

  function drawStructure(ctx, s, COLORS) {
    const hurt = s.health < s.maxHealth;
    let col = COLORS.wall;
    if (s.type === 'door') col = s.open ? COLORS.doorOpen : COLORS.door;
    if (s.type === 'ladder') col = COLORS.ladder;
    if (s.type === 'sky') col = '#60a5fa';
    ctx.save();
    if (s.shake) ctx.translate((Math.random() - 0.5) * 2, 0);
    ctx.fillStyle = col;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    if (hurt) {
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = COLORS.structureHurt;
      ctx.fillRect(s.x, s.y, s.w, s.h);
    }
    ctx.restore();
    if (s.type === 'ladder') {
      ctx.strokeStyle = '#78350f';
      ctx.beginPath(); ctx.moveTo(s.x + 4, s.y + 2); ctx.lineTo(s.x + 4, s.y + s.h - 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s.x + s.w - 4, s.y + 2); ctx.lineTo(s.x + s.w - 4, s.y + s.h - 2); ctx.stroke();
      for (let y = s.y + 6; y < s.y + s.h - 4; y += 8) {
        ctx.beginPath(); ctx.moveTo(s.x + 4, y); ctx.lineTo(s.x + s.w - 4, y); ctx.stroke();
      }
    }
  }

  function drawProjectile(ctx, pr, COLORS) {
    if (pr.type === 'laser') {
      ctx.fillStyle = COLORS.laser;
      ctx.fillRect(pr.x, pr.y, 8, 2);
    } else if (pr.type === 'bomb') {
      ctx.fillStyle = COLORS.bomb;
      ctx.beginPath(); ctx.arc(pr.x, pr.y, 4, 0, Math.PI * 2); ctx.fill();
    } else if (pr.type === 'hammer') {
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(pr.x - 3, pr.y - 3, 6, 6);
    } else if (pr.type === 'chicken') {
      ctx.fillStyle = '#fde68a';
      ctx.beginPath(); ctx.arc(pr.x, pr.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ef4444'; ctx.fillRect(pr.x - 1, pr.y - 5, 2, 3);
    } else if (pr.type === 'pellet') {
      ctx.fillStyle = '#e5e7eb';
      ctx.beginPath(); ctx.arc(pr.x, pr.y, 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawExplosion(ctx, ex) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#fca5a5';
    ctx.beginPath(); ctx.arc(ex.x, ex.y, ex.r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < ex.particles.length; i++) {
      const p = ex.particles[i];
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawBird(ctx, b) {
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(b.x - 6, b.y - 3, 12, 6);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(b.x - 10, b.y - 2, 4, 4);
  }

  function drawBuildPreview(ctx, game) {
    const { gx, gy, canPlace } = game.buildCursor;
    const x = gx * game.TILE, y = gy * game.TILE;
    const h = (game.buildType === 'sky') ? game.TILE : game.TILE * 2;
    ctx.save();
    ctx.globalAlpha = canPlace ? 0.25 : 0.08;
    ctx.fillStyle = game.buildType === 'sky' ? '#60a5fa' :
      (game.buildType === 'ladder' ? game.COLORS.ladder :
       (game.buildType === 'door' ? game.COLORS.door : game.COLORS.wall));
    ctx.fillRect(x, y, game.TILE, h);
    ctx.restore();
  }

  window.Render = {
    drawGrid, drawGround, drawPlayer, drawZombie, drawStructure,
    drawProjectile, drawExplosion, drawBird, drawBuildPreview
  };
})();
