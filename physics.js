(function(){
  'use strict';

  function aabbIntersect(a,b){
    return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
  }

  function resolveWorldCollision(e, GROUND_Y){
    e.onGround=false;
    if(e.y + e.h >= GROUND_Y){
      e.y = GROUND_Y - e.h;
      e.vy = 0;
      e.onGround = true;
    }
    if(e.y < 0){ e.y=0; if(e.vy<0) e.vy=0; }
  }

  function resolveStructuresCollision(e, solids){
    for(const s of solids){
      const r={x:e.x,y:e.y,w:e.w,h:e.h};
      if(!aabbIntersect(r,s)) continue;
      const dx1 = (s.x + s.w) - r.x;
      const dx2 = (r.x + r.w) - s.x;
      const dy1 = (s.y + s.h) - r.y;
      const dy2 = (r.y + r.h) - s.y;
      const minX = Math.min(dx1, dx2);
      const minY = Math.min(dy1, dy2);
      if(minX < minY){
        if(dx1 < dx2){ e.x = s.x + s.w; } else { e.x = s.x - e.w; }
        e.vx = 0;
      } else {
        if(dy1 < dy2){ e.y = s.y + s.h; if(e.vy<0) e.vy=0; }
        else { e.y = s.y - e.h; e.vy=0; e.onGround=true; }
      }
    }
  }

  window.Physics={aabbIntersect, resolveWorldCollision, resolveStructuresCollision};
})();
