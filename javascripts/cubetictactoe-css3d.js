/* =====================================================================
   Cube Tic-Tac-Toe — Version A renderer (CSS 3D cube)
   ---------------------------------------------------------------------
   Renders the shared CubeTicTacToe engine onto a CSS-transform cube.
   - Drag / touch-drag anywhere on the cube to rotate it.
   - Tap a cell to place your mark (a tap is a press without a drag).
   - Snap-to-face buttons bring a chosen face head-on for easy play.
   Pairs with cubetictactoe.js (engine) and the body.cube-page styles.
   ===================================================================== */

(function () {
  "use strict";

  // Snap rotations that bring each face head-on (see the face transforms
  // in stylesheet.css). The iso view is the default 3/4 angle.
  const SNAP = {
    "0": { x: 0,   y: 0 },     // Front
    "1": { x: 0,   y: 180 },   // Back
    "2": { x: 0,   y: -90 },   // Right
    "3": { x: 0,   y: 90 },    // Left
    "4": { x: -90, y: 0 },     // Top
    "5": { x: 90,  y: 0 }      // Bottom
  };
  const ISO_VIEW = { x: -22, y: -32 };

  const $ = function (id) { return document.getElementById(id); };

  const cubeEl = $("ctt-cube");
  const sceneEl = $("ctt-scene");
  const statusEl = $("ctt-status");

  // Build 6 faces × 9 cells. cells[face][idx] -> element.
  const cells = [];
  for (let f = 0; f < CubeTicTacToe.FACE_COUNT; f++) {
    const face = document.createElement("div");
    face.className = "ctt-face";
    face.setAttribute("data-face", String(f));
    cells.push([]);
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement("div");
      cell.className = "ctt-cell";
      cell.setAttribute("data-face", String(f));
      cell.setAttribute("data-idx", String(i));
      face.appendChild(cell);
      cells[f].push(cell);
    }
    cubeEl.appendChild(face);
  }

  /* ---- Engine + hooks -------------------------------------------- */

  const game = new CubeTicTacToe({
    onReset: function () {
      lastAiCell = null;
      resetFaceButtons();
      for (let f = 0; f < cells.length; f++) {
        const face = cubeEl.children[f];
        face.className = "ctt-face";
        face.setAttribute("data-face", String(f));
        for (let i = 0; i < 9; i++) {
          cells[f][i].textContent = "";
          cells[f][i].className = "ctt-cell";
          cells[f][i].setAttribute("data-face", String(f));
          cells[f][i].setAttribute("data-idx", String(i));
        }
      }
      updateCurrent();
    },
    onCell: function (face, idx, player) {
      const cell = cells[face][idx];
      cell.textContent = player;
      cell.classList.add(player.toLowerCase());
      // Rotate to show the AI's move + pulse the cell so it's easy to spot.
      if (game.gameMode === "ai" && player === game.aiSymbol) {
        snapToFace(face);
        glowCell(cell);
      }
    },
    onFaceFinish: function (face, status) {
      const faceEl = cubeEl.children[face];
      faceEl.classList.add("finished");
      faceEl.classList.add(status === "draw" ? "draw" : "win-" + status.toLowerCase());
      colorFaceButton(face, status);
      updateCurrent();
    },
    onStatus: function (text) { statusEl.textContent = text; },
    onScores: function (round, overall) {
      $("ctt-round-x").textContent = "X: " + round.X;
      $("ctt-round-draw").textContent = "Draw: " + round.draws;
      $("ctt-round-o").textContent = "O: " + round.O;
      $("ctt-overall-x").textContent = "X: " + overall.X;
      $("ctt-overall-draw").textContent = "Draw: " + overall.draws;
      $("ctt-overall-o").textContent = "O: " + overall.O;
    },
    onCelebrate: function () { triggerFireworks(); }
  });

  /* ---- Drag-to-rotate + tap-to-place ----------------------------- */
  // Marks are placed on pointer-up (see endPointer) rather than via a
  // `click` listener: the cube captures the pointer for drag-to-rotate,
  // and pointer capture swallows the synthetic click on the cells.

  let rotX = ISO_VIEW.x, rotY = ISO_VIEW.y;
  let startX = 0, startY = 0, baseX = 0, baseY = 0;
  let pointerDown = false, dragged = false;

  function applyRotation() {
    cubeEl.style.transform = "rotateX(" + rotX + "deg) rotateY(" + rotY + "deg)";
    updateCurrent();
  }

  // Which face is pointing most toward the viewer for a given rotation
  // (radians). z-component of each face normal after rotateX·rotateY.
  const FACE_NAMES = ["Front", "Back", "Right", "Left", "Top", "Bottom"];
  const STATE_TEXT = { open: "in play", X: "X won", O: "O won", draw: "drawn" };
  function frontFaceIndex(ax, ay) {
    const ca = Math.cos(ax), sa = Math.sin(ax), cb = Math.cos(ay), sb = Math.sin(ay);
    // CSS 3D has Y pointing down, so the Top/Bottom normals are (0,-1,0)/
    // (0,1,0) — hence -sa / sa here (the reverse of a Y-up system).
    const z = [ca * cb, -ca * cb, -ca * sb, ca * sb, -sa, sa];
    let best = 0;
    for (let i = 1; i < 6; i++) if (z[i] > z[best]) best = i;
    return best;
  }
  function updateCurrent() {
    const f = frontFaceIndex(rotX * Math.PI / 180, rotY * Math.PI / 180);
    const status = game.faceStatus[f];
    $("ctt-current-face").textContent = FACE_NAMES[f];
    $("ctt-current-state").textContent = STATE_TEXT[status];
    const el = $("ctt-current");
    el.classList.remove("st-open", "st-x", "st-o", "st-draw");
    el.classList.add(status === "open" ? "st-open" : status === "draw" ? "st-draw" : "st-" + status.toLowerCase());
  }

  applyRotation();

  sceneEl.addEventListener("pointerdown", function (e) {
    pointerDown = true;
    dragged = false;
    startX = e.clientX;
    startY = e.clientY;
    baseX = rotX;
    baseY = rotY;
    cubeEl.classList.add("ctt-dragging");
    sceneEl.setPointerCapture(e.pointerId);
  });

  sceneEl.addEventListener("pointermove", function (e) {
    if (!pointerDown) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!dragged && Math.abs(dx) + Math.abs(dy) > 6) dragged = true;
    if (dragged) {
      rotY = baseY + dx * 0.4;
      rotX = baseX - dy * 0.4;
      rotX = Math.max(-90, Math.min(90, rotX));
      applyRotation();
      clearActiveView();
    }
  });

  function endPointer(e) {
    if (!pointerDown) return;
    pointerDown = false;
    cubeEl.classList.remove("ctt-dragging");
    // Release capture first so elementFromPoint can see the cell below.
    try { sceneEl.releasePointerCapture(e.pointerId); } catch (err) {}

    // A press that didn't travel is a tap → place a mark on the cell under
    // the pointer (rotate gestures set `dragged` and are ignored here).
    if (!dragged) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cell = el && el.closest ? el.closest(".ctt-cell") : null;
      if (cell) {
        const face = parseInt(cell.getAttribute("data-face"), 10);
        const idx = parseInt(cell.getAttribute("data-idx"), 10);
        game.tryMove(face, idx);
      }
    }
    dragged = false;
  }
  sceneEl.addEventListener("pointerup", endPointer);
  sceneEl.addEventListener("pointercancel", endPointer);

  function clearActiveView() {
    const btns = document.querySelectorAll("#ctt-rotate button");
    for (let i = 0; i < btns.length; i++) btns[i].classList.remove("ctt-active");
  }

  // Rotate the cube to bring a given face head-on, and light up its button.
  function snapToFace(face) {
    const target = SNAP[String(face)];
    if (!target) return;
    rotX = target.x;
    rotY = target.y;
    applyRotation();
    clearActiveView();
    const btn = document.querySelector('#ctt-rotate button[data-face="' + face + '"]');
    if (btn) btn.classList.add("ctt-active");
  }

  // Pulse the AI's most-recent cell (restarting the CSS animation each time).
  let lastAiCell = null;
  function glowCell(cell) {
    if (lastAiCell) lastAiCell.classList.remove("ctt-last");
    void cell.offsetWidth; // force reflow so the animation replays
    cell.classList.add("ctt-last");
    lastAiCell = cell;
  }

  // Tint a face's snap button to its result; clear all on reset.
  function colorFaceButton(face, status) {
    const btn = document.querySelector('#ctt-rotate button[data-face="' + face + '"]');
    if (!btn) return;
    btn.classList.remove("ctt-face-x", "ctt-face-o", "ctt-face-draw");
    btn.classList.add(status === "draw" ? "ctt-face-draw" : "ctt-face-" + status.toLowerCase());
  }
  function resetFaceButtons() {
    const btns = document.querySelectorAll("#ctt-rotate button[data-face]");
    for (let i = 0; i < btns.length; i++) {
      btns[i].classList.remove("ctt-face-x", "ctt-face-o", "ctt-face-draw");
    }
  }

  // Snap-to-face / iso-view buttons
  $("ctt-rotate").addEventListener("click", function (e) {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.hasAttribute("data-view")) {
      clearActiveView();
      btn.classList.add("ctt-active");
      rotX = ISO_VIEW.x;
      rotY = ISO_VIEW.y;
      applyRotation();
    } else {
      snapToFace(parseInt(btn.getAttribute("data-face"), 10));
    }
  });

  /* ---- UI controls ------------------------------------------------ */

  function setModeUI(mode) {
    $("ctt-btn-ai").classList.toggle("ctt-active", mode === "ai");
    $("ctt-btn-local").classList.toggle("ctt-active", mode === "local");
    $("ctt-settings").style.display = mode === "ai" ? "flex" : "none";
  }

  $("ctt-btn-ai").addEventListener("click", function () {
    setModeUI("ai");
    setSymbolUI("X");
    game.setMode("ai");
  });
  $("ctt-btn-local").addEventListener("click", function () {
    setModeUI("local");
    game.setMode("local");
  });

  $("ctt-difficulty").addEventListener("input", function () {
    $("ctt-difficulty-display").textContent = this.value;
    game.setDifficulty(this.value);
  });

  function setSymbolUI(sym) {
    $("ctt-sym-x").classList.toggle("ctt-active", sym === "X");
    $("ctt-sym-o").classList.toggle("ctt-active", sym === "O");
  }
  $("ctt-sym-x").addEventListener("click", function () { setSymbolUI("X"); game.setPlayerSymbol("X"); });
  $("ctt-sym-o").addEventListener("click", function () { setSymbolUI("O"); game.setPlayerSymbol("O"); });

  $("ctt-next").addEventListener("click", function () { game.nextRound(); });
  $("ctt-reset").addEventListener("click", function () {
    if (game.gameMode === "ai") setSymbolUI("X");
    game.resetAll();
  });

  /* ---- Fireworks (ported from the original tic-tac-toe) ----------- */

  const fwCanvas = $("fireworks-canvas");
  const fwCtx = fwCanvas.getContext("2d");
  let particles = [];

  function sizeCanvas() {
    fwCanvas.width = window.innerWidth;
    fwCanvas.height = window.innerHeight;
  }
  sizeCanvas();
  window.addEventListener("resize", sizeCanvas);

  function Particle(x, y) {
    this.x = x;
    this.y = y;
    this.size = Math.random() * 5 + 2;
    this.speedX = (Math.random() - 0.5) * 12;
    this.speedY = (Math.random() - 0.5) * 12;
    this.decay = Math.random() * 0.015 + 0.005;
    this.alpha = 1;
    this.color = "hsl(" + (Math.random() * 80 + 70) + ", 100%, 60%)";
  }
  Particle.prototype.update = function () {
    this.x += this.speedX;
    this.y += this.speedY;
    this.speedY += 0.2;
    this.alpha -= this.decay;
  };
  Particle.prototype.draw = function (ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.alpha);
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  function triggerFireworks() {
    const rect = sceneEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    for (let i = 0; i < 5; i++) {
      setTimeout(function () {
        for (let j = 0; j < 30; j++) particles.push(new Particle(cx, cy));
      }, i * 120);
    }
    animateFireworks();
  }

  function animateFireworks() {
    fwCtx.clearRect(0, 0, fwCanvas.width, fwCanvas.height);
    for (let i = particles.length - 1; i >= 0; i--) {
      particles[i].update();
      particles[i].draw(fwCtx);
      if (particles[i].alpha <= 0) particles.splice(i, 1);
    }
    if (particles.length > 0) requestAnimationFrame(animateFireworks);
  }

  /* ---- Kick off (local mode is ready to play immediately) --------- */
  game.resetAll();
})();
