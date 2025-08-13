(function(){
  'use strict';

  const Keys={
    A:'a', D:'d', W:'w', S:'s',
    LEFT:'ArrowLeft', RIGHT:'ArrowRight', UP:'ArrowUp', DOWN:'ArrowDown',
    SPACE:' ', B:'b', E:'e', SHIFT:'Shift', J:'j', V:'v', R:'r', Y:'y'
  };

  const keymap={left:false,right:false,up:false,down:false,fire:false,bomb:false,shift:false,jet:false,melee:false,reset:false,float:false};

  function setup(game,canvas){
    addEventListener('keydown',e=>{
      if(e.key===Keys.A||e.key===Keys.LEFT) keymap.left=true;
      if(e.key===Keys.D||e.key===Keys.RIGHT) keymap.right=true;
      if(e.key===Keys.W||e.key===Keys.UP) keymap.up=true;
      if(e.key===Keys.S||e.key===Keys.DOWN) keymap.down=true;
      if(e.key===Keys.SPACE) keymap.fire=true;
      if(e.key===Keys.B) keymap.bomb=true;
      if(e.key===Keys.SHIFT) keymap.shift=true;
      if(e.key===Keys.J) keymap.jet=true;
      if(e.key===Keys.V) keymap.melee=true;
      if(e.key===Keys.R) keymap.reset=true;
      if(e.key===Keys.Y) keymap.float=true;
      if(e.key==='1'||e.key==='2'||e.key==='3'||e.key==='4') game.selectBuildTypeByKey(e.key);
      if(e.key===Keys.E) game.tryToggleDoorAtCursor();
    });

    addEventListener('keyup',e=>{
      if(e.key===Keys.A||e.key===Keys.LEFT) keymap.left=false;
      if(e.key===Keys.D||e.key===Keys.RIGHT) keymap.right=false;
      if(e.key===Keys.W||e.key===Keys.UP) keymap.up=false;
      if(e.key===Keys.S||e.key===Keys.DOWN) keymap.down=false;
      if(e.key===Keys.SPACE) keymap.fire=false;
      if(e.key===Keys.B) keymap.bomb=false;
      if(e.key===Keys.SHIFT) keymap.shift=false;
      if(e.key===Keys.J) keymap.jet=false;
      if(e.key===Keys.V) keymap.melee=false;
      if(e.key===Keys.R) keymap.reset=false;
      if(e.key===Keys.Y) keymap.float=false;
    });

    canvas.addEventListener('mousemove',(e)=>{
      const rect=canvas.getBoundingClientRect();
      const sx=(e.clientX-rect.left)/game.scale;
      const sy=(e.clientY-rect.top)/game.scale;
      game.mouse.worldX=Math.max(0,Math.min(game.WORLD_W-1,sx));
      game.mouse.worldY=Math.max(0,Math.min(game.WORLD_H-1,sy));
    });

    canvas.addEventListener('mousedown',()=>{
      const x=game.buildCursor.gx*game.TILE, y=game.buildCursor.gy*game.TILE;
      if(keymap.shift){
        const s=game.findStructureAtPoint(game.mouse.worldX,game.mouse.worldY);
        if(s){ s.health=0; }
      } else if(game.buildCursor.canPlace){
        game.addStructure(x,y,game.buildType);
      }
    });

    // NEW: scale canvas to fit viewport (contain), keep aspect ratio
    function fit(){
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const scale = Math.min(vw / game.WORLD_W, vh / game.WORLD_H);
      const cssW = Math.floor(game.WORLD_W * scale);
      const cssH = Math.floor(game.WORLD_H * scale);
      canvas.style.width  = cssW + 'px';
      canvas.style.height = cssH + 'px';
      game.scale = scale;
    }
    addEventListener('resize',fit);
    fit(); // initial

    return {keymap};
  }

  window.Input={setup};
})();
