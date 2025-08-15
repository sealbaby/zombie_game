(function () {
  'use strict';

  function drawGrid(ctx, W, H, tile, color) {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.globalAlpha = 0.2;
    for (let x = 0; x <= W; x += tile) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += tile) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }
    ctx.restore();
  }

  function drawGround(ctx, COLORS, GROUND_Y, W, H) {
    ctx.fillStyle = COLORS.ground; ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  }

  function drawPlayer(ctx, p, frame, COLORS) {
    const flash = p.damageCD > 0 && ((frame >> 1) % 2 === 0);
    ctx.fillStyle = flash ? COLORS.structureHurt : COLORS.playerBody;
    ctx.fillRect(p.x, p.y, p.w, p.h);

    ctx.beginPath(); ctx.fillStyle = COLORS.playerHead;
    ctx.arc(p.x + p.w * 0.5, p.y - 6, 6, 0, Math.PI * 2); ctx.fill();

    if (p.jetVisual > 0) {
      ctx.save(); ctx.globalAlpha = 0.55; ctx.fillStyle = '#93c5fd';
      const fx = p.x + (p.facing === 1 ? p.w - 3 : 3);
      ctx.beginPath(); ctx.ellipse(fx, p.y + p.h - 2, 3, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore(); p.jetVisual--;
    }

    if (p.swingTimer > 0) {
      const len = 16;
      const sx = p.facing === 1 ? p.x + p.w + 2 : p.x - len - 2;
      const sy = p.y + 4;
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(sx, sy, len, 3);
    }
  }

  function drawZombie(ctx, z, COLORS) {
    ctx.fillStyle = COLORS.zombie; ctx.fillRect(z.x, z.y, z.w, z.h);
    ctx.fillStyle = '#14532d'; ctx.fillRect(z.x + 2, z.y + 2, z.w - 4, 3);
  }

  function drawStructure(ctx, s, COLORS) {
    ctx.save();
    if (s.shake) ctx.translate((Math.random() - 0.5) * 2, 0);

    // Base color per type
    let col = COLORS.wall, translucent = false, frame = null;
    if (s.type === 'door') col = s.open ? COLORS.doorOpen : COLORS.door;
    if (s.type === 'ladder') col = COLORS.ladder;
    if (s.type === 'sky') col = '#60a5fa';
    if (s.type === 'chair') col = '#b45309';
    if (s.type === 'sofa') col = '#10b981';
    if (s.type === 'bed') col = '#ef4444';
    if (s.type === 'glass') { translucent = true; col = 'rgba(147,197,253,0.22)'; frame = 'rgba(147,197,253,0.6)'; }
    if (s.type === 'window') { translucent = true; col = 'rgba(191,219,254,0.28)'; frame = 'rgba(148,163,184,0.8)'; }

    // Fill
    if (translucent) {
      ctx.fillStyle = col;
      ctx.fillRect(s.x, s.y, s.w, s.h);
      // frame
      ctx.strokeStyle = frame; ctx.lineWidth = 2;
      ctx.strokeRect(s.x + 1, s.y + 1, s.w - 2, s.h - 2);
      // muntin bars for window
      if (s.type === 'window') {
        ctx.beginPath();
        ctx.moveTo(s.x + s.w / 2, s.y + 2); ctx.lineTo(s.x + s.w / 2, s.y + s.h - 2);
        ctx.moveTo(s.x + 2, s.y + s.h / 2); ctx.lineTo(s.x + s.w - 2, s.y + s.h / 2);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = col; ctx.fillRect(s.x, s.y, s.w, s.h);
    }

    // Furniture accents
    if (s.type === 'chair') {
      ctx.fillStyle = '#92400e';
      ctx.fillRect(s.x + 2, s.y + 2, s.w - 4, s.h - 10);
      ctx.fillRect(s.x + 2, s.y + s.h - 8, s.w - 4, 6);
    } else if (s.type === 'sofa') {
      ctx.fillStyle = '#059669';
      ctx.fillRect(s.x + 2, s.y + s.h - 10, s.w - 4, 8);
      ctx.fillRect(s.x + 2, s.y + 2, 8, s.h - 6);
      ctx.fillRect(s.x + s.w - 10, s.y + 2, 8, s.h - 6);
    } else if (s.type === 'bed') {
      ctx.fillStyle = '#fca5a5';
      ctx.fillRect(s.x + 2, s.y + 2, s.w - 4, s.h - 10);
      ctx.fillStyle = '#7f1d1d';
      ctx.fillRect(s.x + 2, s.y + s.h - 10, s.w - 4, 8);
    }

    // Ladders (rungs)
    if (s.type === 'ladder') {
      ctx.strokeStyle = '#78350f';
      ctx.beginPath(); ctx.moveTo(s.x + 4, s.y + 2); ctx.lineTo(s.x + 4, s.y + s.h - 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s.x + s.w - 4, s.y + 2); ctx.lineTo(s.x + s.w - 4, s.y + s.h - 2); ctx.stroke();
      for (let y = s.y + 6; y < s.y + s.h - 4; y += 8) { ctx.beginPath(); ctx.moveTo(s.x + 4, y); ctx.lineTo(s.x + s.w - 4, y); ctx.stroke(); }
    }

    // Hurt overlay
    if (s.health < s.maxHealth) { ctx.globalAlpha = 0.15; ctx.fillStyle = COLORS.structureHurt; ctx.fillRect(s.x, s.y, s.w, s.h); }

    ctx.restore();
  }

  function fallbackTypeSize(game, type) {
    const T = game.TILE || 20;
    if (type === 'sky' || type === 'chair') return { w: T, h: T };
    if (type === 'sofa' || type === 'bed') return { w: T * 2, h: T };
    if (type === 'glass' || type === 'window') return { w: T, h: T * 2 };
    return { w: T, h: T * 2 };
  }

  function drawBuildPreview(ctx, game) {
    const { gx, gy, canPlace } = game.buildCursor;
    const sz = (typeof game.getTypeSize === 'function')
      ? game.getTypeSize(game.buildType)
      : fallbackTypeSize(game, game.buildType);

    const x = gx * game.TILE, y = gy * game.TILE;

    ctx.save();
    ctx.globalAlpha = canPlace ? 0.25 : 0.08;

    let col = game.COLORS.wall;
    if (game.buildType === 'door') col = game.COLORS.door;
    else if (game.buildType === 'ladder') col = game.COLORS.ladder;
    else if (game.buildType === 'sky') col = '#60a5fa';
    else if (game.buildType === 'chair') col = '#b45309';
    else if (game.buildType === 'sofa') col = '#10b981';
    else if (game.buildType === 'bed') col = '#ef4444';
    else if (game.buildType === 'glass') col = 'rgba(147,197,253,0.35)';
    else if (game.buildType === 'window') col = 'rgba(191,219,254,0.4)';

    ctx.fillStyle = col;
    ctx.fillRect(x, y, sz.w, sz.h);
    ctx.restore();
  }

  window.Render = {
    drawGrid, drawGround, drawPlayer, drawZombie, drawStructure,
    drawProjectile: function (ctx, pr, COLORS) {
      if (pr.type === 'laser') { ctx.fillStyle = COLORS.laser; ctx.fillRect(pr.x, pr.y, 8, 2); }
      else if (pr.type === 'bomb') { ctx.fillStyle = COLORS.bomb; ctx.beginPath(); ctx.arc(pr.x, pr.y, 4, 0, Math.PI * 2); ctx.fill(); }
      else if (pr.type === 'hammer') { ctx.fillStyle = '#94a3b8'; ctx.fillRect(pr.x - 3, pr.y - 3, 6, 6); }
      else if (pr.type === 'chicken') { ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.arc(pr.x, pr.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ef4444'; ctx.fillRect(pr.x - 1, pr.y - 5, 2, 3); }
      else if (pr.type === 'pellet') { ctx.fillStyle = '#e5e7eb'; ctx.beginPath(); ctx.arc(pr.x, pr.y, 2, 0, Math.PI * 2); ctx.fill(); }
    },
    drawExplosion: function (ctx, ex) {
      ctx.save(); ctx.globalAlpha = 0.25; ctx.fillStyle = '#fca5a5';
      ctx.beginPath(); ctx.arc(ex.x, ex.y, ex.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.7;
      for (const p of ex.particles) { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    },
    drawBird: function () {}, // birds removed
    drawBuildPreview
  };
})();
