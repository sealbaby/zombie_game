(function () {
  'use strict';
  console.log('[ZD] game.js v31 loaded');

  const COLORS = {
    sky: '#0b0f17', ground: '#1b2230', grid: '#222b3a',
    playerBody: '#ef4444', playerHead: '#f87171',
    zombie: '#22c55e', laser: '#22d3ee', bomb: '#f97316',
    wall: '#6b7280', door: '#8b5cf6', doorOpen: '#8b5cf6aa',
    ladder: '#f59e0b', structureHurt: '#ef4444',
    hpGreen: '#22c55e', hpRed: '#ef4444'
  };

  const TILE = 20, WORLD_W = 1200, WORLD_H = 700, GROUND_Y = WORLD_H - 50, GRAVITY = 0.8;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist2 = (x1, y1, x2, y2) => { const dx = x1 - x2, dy = y1 - y2; return dx * dx + dy * dy; };
  const rnd = (min, max) => Math.random() * (max - min) + min;

  const LASER_DMG = 34; // 3 hits to kill a zombie

  class SpatialGrid {
    constructor(cell = TILE) { this.cell = cell; this.map = new Map(); }
    key(cx, cy) { return `${cx},${cy}`; }
    insert(aabb, ref) {
      const x0 = Math.floor(aabb.x / this.cell), y0 = Math.floor(aabb.y / this.cell);
      const x1 = Math.floor((aabb.x + aabb.w) / this.cell), y1 = Math.floor((aabb.x + aabb.h) / this.cell);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
        const k = this.key(cx, cy); if (!this.map.has(k)) this.map.set(k, new Set()); this.map.get(k).add(ref);
      }
    }
    query(aabb) {
      const out = new Set();
      const x0 = Math.floor(aabb.x / this.cell), y0 = Math.floor(aabb.y / this.cell);
      const x1 = Math.floor((aabb.x + aabb.w) / this.cell), y1 = Math.floor((aabb.x + aabb.h) / this.cell);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
        const s = this.map.get(this.key(cx, cy)); if (s) s.forEach(v => out.add(v));
      }
      return [...out];
    }
    clear() { this.map.clear(); }
  }

  const { Player, Zombie, Structure, Projectile, Explosion, Bird } = window.Entities;
  const { aabbIntersect, resolveWorldCollision, resolveStructuresCollision } = window.Physics;
  const R = window.Render;

  class Game {
    constructor(canvas) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.COLORS = COLORS; this.TILE = TILE; this.WORLD_W = WORLD_W; this.WORLD_H = WORLD_H;
      this.GROUND_Y = GROUND_Y; this.GRAVITY = GRAVITY;
      this.scale = 1; this.frame = 0; this.accum = 0; this.frames = 0; this.fps = 0;
      this.grid = new SpatialGrid(TILE);

      this.player = new Player(200, GROUND_Y - 26);
      this.zombies = []; this.structures = [];
      this.projectiles = Array.from({ length: 220 }, () => new Projectile());
      this.explosions = Array.from({ length: 40 }, () => new Explosion());
      this.birds = []; // removed, kept for API compat

      this.buildType = 'wall';
      this.mouse = { x: 0, y: 0, worldX: 0, worldY: 0 };
      this.buildCursor = { gx: 0, gy: 0, canPlace: false };
      this.spawnTimer = 0;
      this.skyDropTimer = 8000 + Math.random() * 8000; // zombie sky-drops

      this.gameOver = false; this._dbgKeymap = null;

      this.surpriseTimer = 35000 + Math.random() * 25000; // chicken storm
      this.stormActive = false; this.stormTimer = 0;

      this.showHelp = true;
    }

    toggleHelp(){ this.showHelp = !this.showHelp; }

    reset() {
      this.player = new Player(200, GROUND_Y - 26);
      this.zombies.length = 0; this.structures.length = 0; this.birds.length = 0;
      this.projectiles.forEach(p => p.active = false);
      this.explosions.forEach(e => e.active = false);
      this.spawnTimer = 0; this.skyDropTimer = 8000 + Math.random() * 8000;
      this.gameOver = false;
      this.surpriseTimer = 35000 + Math.random() * 25000; this.stormActive = false; this.stormTimer = 0;
      this.addStructure(520, GROUND_Y - 40, 'door');
      this.addStructure(540, GROUND_Y - 40, 'wall');
      this.addStructure(560, GROUND_Y - 40, 'ladder');
    }

    // Sizes for build preview/placement
    getTypeSize(type) {
      if (type === 'sky' || type === 'chair') return { w: this.TILE, h: this.TILE };
      if (type === 'sofa' || type === 'bed') return { w: this.TILE * 2, h: this.TILE };
      if (type === 'glass' || type === 'window') return { w: this.TILE, h: this.TILE * 2 };
      return { w: this.TILE, h: this.TILE * 2 }; // wall/door/ladder default
    }

    // Solid rectangles (ladder non-solid)
    get solidRects() {
      const out = [];
      for (const s of this.structures) {
        if (s.type === 'door' && s.open) continue;
        if (s.type === 'ladder') continue;
        out.push({ x: s.x, y: s.y, w: s.w, h: s.h });
      }
      return out;
    }

    update(dt, keymap) {
      this._dbgKeymap = keymap;
      if (this.gameOver) { if (keymap.reset) this.reset(); return; }

      this.frame++; this.accum += dt; this.frames++;
      if (this.accum >= 500) { this.fps = Math.round(1000 * this.frames / this.accum); this.accum = 0; this.frames = 0; }

      // Build cursor
      const sz = this.getTypeSize(this.buildType);
      const gxRaw = Math.floor(this.mouse.worldX / this.TILE);
      const gyRaw = Math.floor(this.mouse.worldY / this.TILE);
      const maxGX = Math.floor((WORLD_W - sz.w) / this.TILE);
      const maxGY = Math.floor((GROUND_Y - sz.h) / this.TILE);
      this.buildCursor.gx = Math.max(0, Math.min(maxGX, gxRaw));
      this.buildCursor.gy = Math.max(0, Math.min(maxGY, gyRaw));
      this.buildCursor.canPlace = this.canPlaceAt(this.buildCursor.gx * this.TILE, this.buildCursor.gy * this.TILE, this.buildType);

      // Float (Y)
      if (keymap.float && !this.player.levitating) {
        this.player.levitating = true;
        this.player.levitateTimer = 30000;
        keymap.float = false;
      }

      this.updatePlayer(dt, keymap);
      this.updateZombies();
      this.updateProjectiles();
      this.updateExplosions();
      this.updateStructures();
      this.updateSurprise(dt);

      // Ground spawner
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) { this.spawnZombieWave(); this.spawnTimer = 2500; }

      // Sky-drop spawner
      this.skyDropTimer -= dt;
      if (this.skyDropTimer <= 0) {
        this.spawnSkyZombie();
        this.skyDropTimer = 9000 + Math.random() * 12000;
      }
    }

    updatePlayer(dt, keymap) {
      const p = this.player;

      const moveSpeed = 1.1;
      const moveSpeedJet = 0.8;
      const maxVy = 18;
      p.prevY = p.y; p.onLadder = false;

      const horizSpeed = (p.levitating || keymap.jet) ? moveSpeedJet : moveSpeed;

      // Jetpack responsiveness
      const jetDown = !!this._dbgKeymap.jet;
      const justPressedJet = jetDown && !p._jetWasDown;
      const justReleasedJet = !jetDown && p._jetWasDown;
      p._jetWasDown = jetDown;

      if (p.levitating) {
        const targetY = (this.WORLD_H * 0.5) - p.h / 2;
        if (this._dbgKeymap.left) { p.vx = -horizSpeed; p.facing = -1; }
        else if (this._dbgKeymap.right) { p.vx = horizSpeed; p.facing = 1; }
        else p.vx *= 0.7;
        p.y += (targetY - p.y) * 0.35; p.vy = 0; p.x += p.vx;
        p.levitateTimer -= dt; if (p.levitateTimer <= 0) { p.levitating = false; }
      } else {
        // Ladder
        const ladderRect = this.findLadderAt(p.rect());
        const touchingLadder = !!ladderRect && aabbIntersect(p.rect(), ladderRect);
        if (touchingLadder) {
          p.onLadder = true;
          if (this._dbgKeymap.up) { p.y -= 2.0; p.vy = 0; }
          else if (this._dbgKeymap.down) { p.y += 2.0; p.vy = 0; }
          else { p.vy = 0; }
        }

        // Horizontal
        if (this._dbgKeymap.left) { p.vx = -horizSpeed; p.facing = -1; }
        else if (this._dbgKeymap.right) { p.vx = horizSpeed; p.facing = 1; }
        else p.vx *= 0.7;

        // Jump
        if (this._dbgKeymap.up && p.onGround && !touchingLadder) { p.vy = -18; p.onGround = false; }

        // Jetpack — slow climb, snappy on/off
        let thrust = 0;
        if (jetDown) {
          thrust = -0.82;  p.jetVisual = 3;
          if (justPressedJet) p.vy = Math.min(p.vy, -2.0);
        } else {
          if (justReleasedJet && p.vy < -1.2) p.vy *= 0.6;
        }
        p.jetFuel = p.maxJetFuel;

        if (!p.onLadder) p.vy += GRAVITY;
        p.vy += thrust;
        p.vy = clamp(p.vy, -12, maxVy);

        p.x += p.vx; p.y += p.vy;

        resolveWorldCollision(p, GROUND_Y);
        resolveStructuresCollision(p, this.solidRects);
        p.x = clamp(p.x, 0, this.WORLD_W - p.w);
      }

      if (p.damageCD > 0) p.damageCD -= dt * 0.06;
      if (p.invuln > 0) p.invuln -= dt * 0.06;
      if (p.meleeCD > 0) p.meleeCD--;
      if (p.swingTimer > 0) p.swingTimer--;

      // One-shot inputs
      if (this._dbgKeymap.fire)   { this.fireLaser();   this._dbgKeymap.fire = false; }
      if (this._dbgKeymap.bomb)   { this.fireBomb();    this._dbgKeymap.bomb = false; }
      if (this._dbgKeymap.melee)  { this.meleeAttack(); this._dbgKeymap.melee = false; }
      if (this._dbgKeymap.scatter){ this.fireScatter(); this._dbgKeymap.scatter = false; }
    }

    meleeAttack() {
      const p = this.player; if (p.meleeCD > 0) return;
      p.meleeCD = 18; p.swingTimer = 16;
      const range = 28;
      const hitbox = { x: (p.facing === 1 ? p.x + p.w : p.x - range), y: p.y, w: range, h: p.h };
      for (const z of this.zombies) {
        if (!z.alive) continue;
        if (aabbIntersect(hitbox, z.rect())) { z.alive = false; z.health = 0; }
      }
      for (const s of this.structures) { if (aabbIntersect(hitbox, s.rect())) s.health -= 12; }
    }

    nearestSkyBlock(z) {
      let best = null, bestD = Infinity;
      for (const s of this.structures) {
        if (s.type !== 'sky') continue;
        const cx = s.x + s.w / 2, cz = z.x + z.w / 2;
        const d = Math.abs(cx - cz) + Math.max(0, s.y - z.y);
        if (d < bestD) { bestD = d; best = s; }
      }
      return best;
    }

    updateZombies() {
      const p = this.player;

      // Chickens spawned when zombies bump each other (kept)
      for (let i = 0; i < this.zombies.length; i++) {
        const a = this.zombies[i]; if (!a.alive) continue;
        for (let j = i + 1; j < this.zombies.length; j++) {
          const b = this.zombies[j]; if (!b.alive) continue;
          const ar = a.rect(), br = b.rect();
          const touching = ar.x < br.x + br.w && ar.x + ar.w > br.x && ar.y < br.y + br.h && ar.y + ar.h > br.y;
          if (touching) {
            if (a.chickenCD == null) a.chickenCD = 0;
            if (b.chickenCD == null) b.chickenCD = 0;
            if (a.chickenCD <= 0) { this.spawnChicken(a.x + a.w / 2, a.y + 8, Math.sign((b.x - a.x)) * (2 + Math.random() * 1.5), -4); a.chickenCD = 90; }
            if (b.chickenCD <= 0) { this.spawnChicken(b.x + b.w / 2, b.y + 8, Math.sign((a.x - b.x)) * (2 + Math.random() * 1.5), -4); b.chickenCD = 90; }
          }
        }
      }

      for (const z of this.zombies) {
        if (!z.alive) continue;

        if (z.bumpCD == null) z.bumpCD = 0;
        if (z.chickenCD == null) z.chickenCD = 0;
        if (z.seekMode == null) z.seekMode = 'none';
        if (z.seekTimer == null) z.seekTimer = 0;
        if (z.jumpCD == null) z.jumpCD = 0;
        if (z.platformDir == null) z.platformDir = Math.random() < 0.5 ? -1 : 1;

        if (z.bumpCD > 0) z.bumpCD--;
        if (z.chickenCD > 0) z.chickenCD--;
        if (z.jumpCD > 0) z.jumpCD--;
        if (z.seekTimer > 0) z.seekTimer--;

        // Seek SKY sometimes (movement goal only; no damage)
        if (z.seekMode === 'none' && Math.random() < 0.003) {
          const target = this.nearestSkyBlock(z);
          if (target) { z.seekMode = 'sky'; z.targetSky = target; z.seekTimer = 60 * 8 + Math.floor(Math.random() * 60 * 4); }
        }
        if (z.seekMode === 'sky') {
          if (!z.targetSky || z.targetSky.health <= 0) { z.seekMode = 'none'; z.targetSky = null; }
          if (z.seekTimer <= 0) { z.seekMode = 'none'; z.targetSky = null; }
        }

        // Direction
        let dir;
        if (z.seekMode === 'sky' && z.targetSky) {
          const tx = z.targetSky.x + z.targetSky.w / 2;
          dir = Math.sign(tx - (z.x + z.w / 2));
        } else {
          dir = Math.sign((p.x + p.w / 2) - (z.x + z.w / 2));
        }

        const onGround = (z.y + z.h) >= (GROUND_Y - 1);

        // Occasional jumps (just to move around)
        if (onGround && z.jumpCD === 0 && Math.random() < 0.0012) {
          z.vy = -rnd(16, 34);
          z.jumpCD = 90;
        }

        // Strong jump to mount SKY (still no damage)
        if (z.seekMode === 'sky' && z.targetSky && onGround && z.jumpCD === 0) {
          const s = z.targetSky, cxZ = z.x + z.w / 2, cxS = s.x + s.w / 2;
          const dx = Math.abs(cxS - cxZ);
          const belowTop = (z.y + z.h) <= (s.y + 6);
          if (belowTop && dx < (s.w * 0.55 + 18)) {
            z.vy = -rnd(22, 32);
            z.jumpCD = 90;
          }
        }

        // Integrate & collide
        z.vx = dir * z.speed;
        z.vy += GRAVITY; z.vy = Math.max(-40, Math.min(14, z.vy));
        z.x += z.vx; z.y += z.vy;

        resolveWorldCollision(z, GROUND_Y);
        resolveStructuresCollision(z, this.solidRects);

        // Patrol if on SKY
        if (z.seekMode === 'sky' && z.targetSky) {
          const s = z.targetSky;
          const onTop = Math.abs((z.y + z.h) - s.y) < 2 && z.x + z.w > s.x - 1 && z.x < s.x + s.w + 1;
          if (onTop) {
            z.vx = z.platformDir * z.speed;
            z.x += z.vx;
            if (z.x <= s.x - 1) z.platformDir = 1;
            if (z.x + z.w >= s.x + s.w + 1) z.platformDir = -1;
          }
        }

        // IMPORTANT: Zombies no longer damage any blocks (no bump/jump damage)

        // Player collision
        const zr = z.rect(), pr = p.rect();
        if (!p.levitating && aabbIntersect(pr, zr)) {
          const prevBottom = p.prevY + p.h;
          const comingFromAbove = prevBottom <= (z.y + 2);
          if (p.vy > 1.5 && comingFromAbove) {
            z.alive = false; p.vy = -10; p.onGround = false;
          } else if (p.invuln <= 0 && !p.dead) {
            const jumping = z.vy < -2;
            this.damagePlayer(jumping ? 35 : 25);
            p.invuln = 40;
          }
        }

        if (z.y > WORLD_H + 200) z.alive = false;
      }
      this.zombies = this.zombies.filter(z => z.alive && z.health > 0);
    }

    // Structures (SKY pinned; furniture can rest on SKY/others)
    updateStructures() {
      for (const s of this.structures) {
        if (s.type === 'sky') {
          s.x = (s.anchorX != null) ? s.anchorX : s.x;
          s.y = (s.anchorY != null) ? s.anchorY : s.y;
          s.supported = true; s.falling = false; s.vy = 0; s.shake = 0;
        }
      }

      // Support check: any horizontally overlapping solid beneath (including SKY)
      for (const s of this.structures) {
        if (s.type === 'sky') continue;
        const touchingGround = (s.y + s.h >= GROUND_Y - 0.5);
        let supported = touchingGround;
        if (!supported) {
          for (const other of this.structures) {
            if (other === s) continue;
            const xOverlap = !(s.x + s.w <= other.x || s.x >= other.x + other.w);
            if (!xOverlap) continue;
            const isBelow = (other.y >= s.y + s.h - 1);
            if (isBelow && !other.falling) { supported = true; break; }
          }
        }
        s.supported = supported;
        if (!supported) s.falling = true;
      }

      // Falling integration
      for (const s of this.structures) {
        if (s.type === 'sky') continue;
        if (s.falling) {
          s.vy += GRAVITY; s.vy = Math.max(-30, Math.min(22, s.vy)); s.y += s.vy; s.shake = 1;
          if (s.y + s.h >= GROUND_Y) { s.y = GROUND_Y - s.h; s.vy = 0; s.falling = false; s.supported = true; continue; }
          for (const other of this.structures) {
            if (other === s) continue;
            const xOverlap = !(s.x + s.w <= other.x || s.x >= other.x + other.w);
            if (!xOverlap) continue;
            const fallingPastTop = (s.y + s.h > other.y - 0.5) && (s.y < other.y);
            if (fallingPastTop && !other.falling) {
              s.y = other.y - s.h; s.vy = 0; s.falling = false; s.supported = true; break;
            }
          }
        } else {
          s.shake = 0;
        }
      }

      // Remove broken
      this.structures = this.structures.filter(s => s.health > 0);
    }

    updateProjectiles() {
      this.grid.clear(); for (const s of this.structures) this.grid.insert({ x: s.x, y: s.y, w: s.w, h: s.h }, s);
      for (const pr of this.projectiles) {
        if (!pr.active) continue;

        if (pr.type === 'laser') {
          pr.x += pr.vx; pr.life--;
          let hit = false;
          for (const s of this.grid.query(pr.rect())) {
            if (s.type === 'door' && s.open) continue;
            if (aabbIntersect(pr.rect(), s.rect())) { s.health -= 20; hit = true; break; }
          }
          if (!hit) {
            for (const z of this.zombies) {
              if (aabbIntersect(pr.rect(), z.rect())) { z.health -= LASER_DMG; if (z.health <= 0) z.alive = false; hit = true; break; }
            }
          }
          if (hit) pr.active = false;
          if (pr.life <= 0 || pr.x < -50 || pr.x > WORLD_W + 50) pr.active = false;

        } else if (pr.type === 'pellet') {
          pr.vy += 0.25;
          pr.x += pr.vx; pr.y += pr.vy; pr.life--;
          for (const z of this.zombies) {
            if (!z.alive) continue;
            if (aabbIntersect(pr.rect(), z.rect())) { z.health -= 8; if (z.health <= 0) z.alive = false; pr.active = false; break; }
          }
          if (pr.y < -20 || pr.life <= 0) pr.active = false;

        } else if (pr.type === 'bomb' || pr.type === 'hammer' || pr.type === 'chicken') {
          const g = pr.type === 'hammer' ? 0.35 : (pr.type === 'chicken' ? 0.4 : 0.5);
          pr.vy += g;
          if (pr.type === 'hammer') { pr.vx *= 0.985; pr.vy *= 0.995; }
          pr.x += pr.vx; pr.y += pr.vy; pr.life--;

          let explode = false;
          if (pr.type === 'bomb' || pr.type === 'chicken') {
            for (const z of this.zombies) {
              if (!z.alive) continue;
              if (aabbIntersect(pr.rect(), z.rect())) { if (pr.type === 'chicken') z.health -= 100; explode = true; break; }
            }
          }
          if (!explode) {
            if (pr.y >= GROUND_Y - 2) { explode = true; pr.y = GROUND_Y - 2; }
            if (!explode) {
              for (const s of this.grid.query(pr.rect())) { if (aabbIntersect(pr.rect(), s.rect())) { explode = true; break; } }
            }
          }

          if (explode || pr.life <= 0) {
            // hammers ignore SKY; chickens no longer damage ANY blocks
            if (pr.type === 'hammer') this.spawnExplosion(pr.x, pr.y, 100, { affectsSky: false, affectsBlocks: true });
            else if (pr.type === 'chicken') this.spawnExplosion(pr.x, pr.y, 80, { affectsSky: false, affectsBlocks: false });
            else this.spawnExplosion(pr.x, pr.y, 100, { affectsSky: true, affectsBlocks: true });
            pr.active = false;
          }
          if (pr.y > WORLD_H + 200) pr.active = false;
        }
      }
    }

    updateExplosions() {
      for (const ex of this.explosions) {
        if (!ex.active) continue;
        ex.age++; ex.r = lerp(8, ex.maxR, ex.age / ex.life);
        if (ex.age === 2 || ex.age === 6 || ex.age === 10) {
          const r2 = (ex.r * ex.r);
          for (const z of this.zombies) {
            if (!z.alive) continue;
            const d2 = dist2(ex.x, ex.y, z.x + z.w / 2, z.y + z.h / 2);
            if (d2 < r2) { z.health -= 80; if (z.health <= 0) z.alive = false; }
          }
          if (ex.affectsBlocks !== false) {
            for (const s of this.structures) {
              if (ex.affectsSky === false && s.type === 'sky') continue;
              const d2 = dist2(ex.x, ex.y, s.x + s.w / 2, s.y + s.h / 2);
              if (d2 < r2) { const d = Math.sqrt(d2); const dmg = Math.max(25, 90 * (1 - d / ex.maxR)); s.health -= dmg; }
            }
          }
        }
        for (const p of ex.particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.2; p.life -= 0.04; }
        ex.particles = ex.particles.filter(p => p.life > 0);
        if (ex.age >= ex.life) { ex.active = false; }
      }
    }

    updateSurprise(dt) {
      if (this.stormActive) {
        this.stormTimer -= dt;
        if (this.stormTimer <= 0) { this.stormActive = false; this.surpriseTimer = 35000 + Math.random() * 25000; }
      } else {
        this.surpriseTimer -= dt;
        if (this.surpriseTimer <= 0) { this.triggerChickenStorm(); this.stormActive = true; this.stormTimer = 5000; }
      }
    }

    triggerChickenStorm() {
      for (let i = 0; i < 9; i++) {
        const x = 20 + Math.random() * (this.WORLD_W - 40);
        const vx = (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.6);
        this.spawnChicken(x, 20 + Math.random() * 60, vx, 0.0);
      }
    }

    // Weapons
    fireLaser() {
      if (this.gameOver) return;
      const p = this.player;
      const pr = this.getProjectile(); if (!pr) return;
      pr.active = true; pr.type = 'laser';
      pr.x = p.x + p.w / 2 + p.facing * 14; pr.y = p.y + p.h / 2 - 4;
      pr.vx = 15 * p.facing; pr.vy = 0; pr.life = 60; pr.dir = p.facing;
    }
    fireBomb() {
      if (this.gameOver) return;
      const p = this.player;
      const pr = this.getProjectile(); if (!pr) return;
      pr.active = true; pr.type = 'bomb';
      pr.x = p.x + p.w / 2 + p.facing * 12; pr.y = p.y + 3;
      pr.vx = 6 * p.facing; pr.vy = -6; pr.life = 160; pr.dir = p.facing;
    }
    fireScatter() {
      if (this.gameOver) return;
      const p = this.player; const pellets = 8; const FACT = Math.sqrt(2.5);
      for (let i = 0; i < pellets; i++) {
        const pr = this.getProjectile(); if (!pr) break;
        const baseVy = 8 + Math.random() * 4;
        pr.active = true; pr.type = 'pellet';
        pr.x = p.x + p.w / 2 + (Math.random() - 0.5) * 6;
        pr.y = p.y - 2;
        pr.vx = (Math.random() - 0.5) * 2.2;
        pr.vy = -(baseVy * FACT);
        pr.life = 75;
      }
    }

    dropHammer(x, y, vx) { const pr = this.getProjectile(); if (!pr) return; pr.active = true; pr.type = 'hammer'; pr.x = x; pr.y = y; pr.vx = vx; pr.vy = 0.2; pr.life = 260; }
    spawnChicken(x, y, vx, vy) { const pr = this.getProjectile(); if (!pr) return; pr.active = true; pr.type = 'chicken'; pr.x = x; pr.y = y; pr.vx = vx; pr.vy = vy; pr.life = 220; }

    // Spawns
    spawnZombieWave() {
      const count = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) {
        const side = Math.random() < 0.5 ? -30 : WORLD_W + 30;
        const z = new Zombie(side, GROUND_Y - 25);
        this.zombies.push(z);
      }
    }
    spawnSkyZombie() {
      const x = 40 + Math.random() * (WORLD_W - 80);
      const z = new Zombie(x, -30);
      z.vy = 2 + Math.random() * 1.5;
      this.zombies.push(z);
    }

    render() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, WORLD_W, WORLD_H);
      ctx.fillStyle = COLORS.sky; ctx.fillRect(0, 0, WORLD_W, WORLD_H);

      R.drawGrid(ctx, WORLD_W, WORLD_H, TILE, COLORS.grid);
      R.drawGround(ctx, COLORS, GROUND_Y, WORLD_W, WORLD_H);

      for (const s of this.structures) R.drawStructure(ctx, s, COLORS);
      R.drawPlayer(ctx, this.player, this.frame, COLORS);

      for (const z of this.zombies) R.drawZombie(ctx, z, COLORS);
      for (const pr of this.projectiles) if (pr.active) R.drawProjectile(ctx, pr, COLORS);
      for (const ex of this.explosions) if (ex.active) R.drawExplosion(ctx, ex);

      R.drawBuildPreview(ctx, this);

      // HUD
      const padL = 14, padR = 24, top = 20, barW = 190, barH = 10, gap = 8;
      ctx.fillStyle = '#94a3b8'; ctx.font = '12px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(`FPS: ${this.fps}`, padL, top - 16);

      ctx.fillStyle = '#e5e7eb'; ctx.font = '12px monospace';
      ctx.fillText('HP', padL, top);
      ctx.fillText('Fuel ∞', padL, top + barH + gap);

      const barX = padL + 28;
      ctx.fillStyle = '#111827'; ctx.fillRect(barX, top, barW, barH);
      const hpPct = Math.max(0, Math.min(1, this.player.health / this.player.maxHealth));
      ctx.fillStyle = COLORS.hpGreen; ctx.fillRect(barX, top, barW * hpPct, barH);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.strokeRect(barX + 0.5, top + 0.5, barW - 1, barH - 1);

      const jy = top + barH + gap;
      ctx.fillStyle = '#111827'; ctx.fillRect(barX, jy, barW, barH);
      ctx.fillStyle = '#38bdf8'; ctx.fillRect(barX, jy, barW, barH);
      ctx.strokeRect(barX + 0.5, jy + 0.5, barW - 1, barH - 1);

      ctx.fillStyle = '#e5e7eb'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText(`Z: ${this.zombies.length}  |  Blocks: ${this.structures.length}  |  Build: ${this.buildType}`, WORLD_W - padR, top);

      if (this.showHelp) {
        const lines = [
          'Controls', '———',
          'Move: A/D or ←/→',
          'Jump/Climb: W or ↑',
          'Jetpack (unlimited): J',
          'Sword (1-hit): V',
          'Laser: Space (3 hits kill)',
          'Bomb: B   • Scatter Up: K',
          'Build: Click  | Toggle Door: E',
          'Types: 1=Wall  2=Door  3=Ladder  4=Sky',
          '       5=Chair 6=Sofa 7=Bed  8=Glass 9=Window',
          'Float (30s): Y   | Reset: R   | Help: H'
        ];
        const panelX = padL, panelY = jy + barH + 14, panelW = 640, lineH = 16, panelH = lines.length * lineH + 14;
        ctx.save();
        ctx.globalAlpha = 0.18; ctx.fillStyle = '#000'; ctx.fillRect(panelX, panelY, panelW, panelH);
        ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.strokeRect(panelX + 0.5, panelY + 0.5, panelW - 1, panelH - 1);
        ctx.fillStyle = '#cbd5e1'; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        for (let i = 0; i < lines.length; i++) { ctx.fillText(lines[i], panelX + 10, panelY + 8 + i * lineH); }
        ctx.restore();
      }
    }

    damagePlayer(amount) {
      const p = this.player; if (p.levitating) return;
      if (p.damageCD > 0 || p.dead) return;
      p.health -= amount; if (p.health <= 0) { p.health = 0; p.dead = true; this.gameOver = true; }
      p.damageCD = 30;
    }

    getProjectile() { return this.projectiles.find(p => !p.active); }
    spawnExplosion(x, y, maxR = 92, opts) {
      const ex = this.explosions.find(e => !e.active); if (!ex) return;
      ex.active = true; ex.x = x; ex.y = y; ex.age = 0; ex.r = 0; ex.maxR = maxR; ex.life = 32;
      ex.affectsSky = opts && 'affectsSky' in opts ? !!opts.affectsSky : true;
      ex.affectsBlocks = opts && 'affectsBlocks' in opts ? !!opts.affectsBlocks : true;
      ex.particles.length = 0;
      for (let i = 0; i < 22; i++) { ex.particles.push({ x, y, vx: rnd(-2.6, 2.6), vy: rnd(-4.2, -1.0), r: rnd(1.5, 3), life: 1, color: i % 2 ? '#fb923c' : '#fde047' }); }
    }

    canPlaceAt(x, y, type) {
      const sz = this.getTypeSize(type);
      if (y < 0 || y + sz.h > GROUND_Y) return false;
      if (x < 0 || x + sz.w > WORLD_W) return false;
      const rect = { x, y, w: sz.w, h: sz.h };
      for (const s of this.structures) {
        const r = s.rect();
        if (r.x < rect.x + rect.w && r.x + r.w > rect.x && r.y < rect.y + rect.h && r.y + r.h > rect.y) return false;
      }
      return true;
    }

    addStructure(x, y, type) { const s = new Structure(x, y, type); this.structures.push(s); return s; }
    findStructureAtPoint(px, py) { for (const s of this.structures) { if (px >= s.x && px <= s.x + s.w && py >= s.y && py <= s.y + s.h) return s; } return null; }
    findLadderAt(rect) { for (const s of this.structures) { if (s.type === 'ladder' && aabbIntersect(rect, s.rect())) return s.rect(); } return null; }
    tryToggleDoorAtCursor() { const s = this.findStructureAtPoint(this.mouse.worldX, this.mouse.worldY); if (s && s.type === 'door') { s.open = !s.open; } }
    selectBuildTypeByKey(k) {
      const map = {
        '1': 'wall', '2': 'door', '3': 'ladder', '4': 'sky',
        '5': 'chair', '6': 'sofa', '7': 'bed', '8': 'glass', '9': 'window'
      };
      this.buildType = map[k] || this.buildType;
    }
  }

  // Boot
  window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game');
    if (!canvas) { console.error('No <canvas id="game"> found.'); return; }

    const game = new Game(canvas);
    game.scale = (canvas.getBoundingClientRect().width || game.WORLD_W) / game.WORLD_W;

    const { keymap } = window.Input.setup(game, canvas);

    // Seed
    game.addStructure(520, game.GROUND_Y - 40, 'door');
    game.addStructure(540, game.GROUND_Y - 40, 'wall');
    game.addStructure(560, game.GROUND_Y - 40, 'ladder');

    let last = performance.now();
    function loop(now) {
      const dt = now - last; last = now;
      game.update(dt, keymap);
      game.render();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    window.__game = game;
  });
})();
