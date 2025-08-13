(function () {
  'use strict';

  class Player {
    constructor(x, y) {
      this.x = x; this.y = y;
      this.w = 14; this.h = 22;
      this.vx = 0; this.vy = 0;
      this.prevY = y;
      this.onGround = false;
      this.onLadder = false;
      this.facing = 1;
      this.health = 100; this.maxHealth = 100;
      this.damageCD = 0; this.invuln = 0;
      this.jetFuel = 100; this.maxJetFuel = 100;
      this.jetVisual = 0;
      this.meleeCD = 0; this.swingTimer = 0;
      this.levitating = false; this.levitateTimer = 0;
      this.dead = false;
    }
    rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  }

  class Zombie {
    constructor(x, y) {
      this.x = x; this.y = y;
      this.w = 14; this.h = 22;
      this.vx = 0; this.vy = 0;
      this.speed = 0.6;      // already half-speed
      this.health = 100; this.alive = true;
      this.bumpCD = 0; this.chickenCD = 0;
    }
    rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  }

  class Structure {
    constructor(x, y, type) {
      this.x = x; this.y = y; this.type = type; this.vy = 0;
      this.w = 20; this.h = (type === 'sky') ? 20 : 40;
      this.open = false;
      this.supported = true; this.falling = false; this.shake = 0;
      this.maxHealth = (type === 'sky') ? 60 : (type === 'ladder' ? 50 : 150);
      this.health = this.maxHealth;
      if (type === 'sky') { this.anchorX = x; this.anchorY = y; }
    }
    rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  }

  class Projectile {
    constructor() { this.active = false; this.type = 'laser'; this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.life = 0; this.dir = 1; }
    rect() { return { x: this.x - 3, y: this.y - 3, w: 6, h: 6 }; }
  }

  class Explosion {
    constructor() { this.active = false; this.x = 0; this.y = 0; this.r = 0; this.maxR = 80; this.life = 24; this.age = 0; this.particles = []; }
  }

  class Bird {
    constructor(x, y, vx) {
      this.x = x; this.y = y; this.vx = vx; this.alive = true; this.dropTimer = 80 + Math.floor(Math.random() * 40);
    }
    rect() { return { x: this.x - 8, y: this.y - 4, w: 16, h: 8 }; }
  }

  window.Entities = { Player, Zombie, Structure, Projectile, Explosion, Bird };
})();
