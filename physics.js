(function () {
  'use strict';

  function aabbIntersect(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function resolveWorldCollision(obj, GROUND_Y) {
    if (obj.y + obj.h >= GROUND_Y) {
      obj.y = GROUND_Y - obj.h;
      obj.vy = 0;
      obj.onGround = true;
    } else {
      obj.onGround = false;
    }
  }

  function resolveStructuresCollision(obj, rects) {
    // vertical first
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (!(obj.x < r.x + r.w && obj.x + obj.w > r.x)) continue;
      if (obj.y + obj.h > r.y && obj.prevY + obj.h <= r.y) {
        obj.y = r.y - obj.h;
        obj.vy = 0;
        obj.onGround = true;
      }
    }
    // horizontal
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const inter = !(obj.x + obj.w <= r.x || obj.x >= r.x + r.w || obj.y + obj.h <= r.y || obj.y >= r.y + r.h);
      if (!inter) continue;
      if (obj.x + obj.w / 2 < r.x + r.w / 2) obj.x = r.x - obj.w - 0.01;
      else obj.x = r.x + r.w + 0.01;
      obj.vx = 0;
    }
  }

  window.Physics = { aabbIntersect, resolveWorldCollision, resolveStructuresCollision };
})();
