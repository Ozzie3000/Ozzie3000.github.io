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
    },
    onCell: function (face, idx, player) {
      const cell = cells[face][idx];
      cell.textContent = player;
      cell.classList.add(player.toLowerCase());
    },
    onFaceFinish: function (face, status) {
      const faceEl = cubeEl.children[face];
      faceEl.classList.add("finished");
      faceEl.classList.add(status === "draw" ? "draw" : "win-" + status.toLowerCase());
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

  // Snap-to-face / iso-view buttons
  $("ctt-rotate").addEventListener("click", function (e) {
    const btn = e.target.closest("button");
    if (!btn) return;
    clearActiveView();
    btn.classList.add("ctt-active");
    const target = btn.hasAttribute("data-view") ? ISO_VIEW : SNAP[btn.getAttribute("data-face")];
    rotX = target.x;
    rotY = target.y;
    applyRotation();
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
