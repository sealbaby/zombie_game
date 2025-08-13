(function () {
  'use strict';
  const KEY = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    a: 'left', d: 'right', w: 'up', s: 'down',
    j: 'jet', v: 'melee', ' ': 'fire', b: 'bomb', k: 'scatter',
    y: 'float', r: 'reset', e: 'toggle', h: 'help',
    '1': 'build1', '2': 'build2', '3': 'build3', '4': 'build4'
  };

  function setup(game, canvas) {
    const keymap = {
      left:false,right:false,up:false,down:false,
      jet:false, fire:false, bomb:false, melee:false, scatter:false,
      float:false, reset:false
    };

    function setKey(e, down) {
      const k = (e.key.length === 1 ? e.key.toLowerCase() : e.key);
      const tag = KEY[k] ?? KEY[e.key];
      if (!tag) return;

      if (tag === 'build1' && down) game.selectBuildTypeByKey('1');
      else if (tag === 'build2' && down) game.selectBuildTypeByKey('2');
      else if (tag === 'build3' && down) game.selectBuildTypeByKey('3');
      else if (tag === 'build4' && down) game.selectBuildTypeByKey('4');
      else if (tag === 'toggle' && down) game.tryToggleDoorAtCursor();
      else if (tag === 'help' && down) game.toggleHelp();
      else if (tag in keymap) {
        if (down) {
          // one-shot buttons:
          if (['fire','bomb','melee','scatter'].includes(tag)) keymap[tag] = true;
          else keymap[tag] = true;
        } else {
          // continuous buttons only:
          if (!['fire','bomb','melee','scatter'].includes(tag)) keymap[tag] = false;
        }
      }

      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
    }

    window.addEventListener('keydown', e => setKey(e, true), { passive:false });
    window.addEventListener('keyup',   e => setKey(e, false), { passive:false });

    function updateMouse(e){
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width  / rect.width;
      const sy = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * sx;
      const y = (e.clientY - rect.top)  * sy;
      game.mouse.x = x; game.mouse.y = y;
      game.mouse.worldX = x; game.mouse.worldY = y;
    }
    window.addEventListener('mousemove', updateMouse, { passive:true });

    canvas.addEventListener('mousedown', (e)=>{
      updateMouse(e);
      const gx = game.buildCursor.gx * game.TILE;
      const gy = game.buildCursor.gy * game.TILE;
      if (game.buildCursor.canPlace) game.addStructure(gx, gy, game.buildType);
    });

    return { keymap };
  }

  window.Input = { setup };
})();
