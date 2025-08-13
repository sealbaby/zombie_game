(function(){
  'use strict';

  function aabbIntersect(a,b){
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function resolveWorldCollision(entity, GROUND_Y){
    if(entity.y + entity.h > GROUND_Y){
      entity.y = GROUND_Y - entity.h;
      entity.vy = 0;
      entity.onGround = true;
    }
  }

  function resolveStructuresCollision(entity, solidRects){
    let e = entity.rect();
    for(const r of solidRects){
      if(!aabbIntersect(e, r)) continue;
      const dx1 = (r.x + r.w) - e.x, dx2 = (e.x + e.w) - r.x;
      const dy1 = (r.y + r.h) - e.y, dy2 = (e.y + e.h) - r.y;
      const minX = Math.min(dx1, dx2), minY = Math.min(dy1, dy2);
      if(minX < minY){
        if(dx1 < dx2){ entity.x = r.x + r.w; } else { entity.x = r.x - entity.w; }
        entity.vx=0;
      } else {
        if(dy1 < dy2){ entity.y = r.y + r.h; entity.vy=0; }
        else { entity.y = r.y - entity.h; entity.vy=0; entity.onGround=true; }
      }
      e = entity.rect();
    }
  }

  window.Physics = { aabbIntersect, resolveWorldCollision, resolveStructuresCollision };
})();