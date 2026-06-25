/* =====================================================================
   Cube Tic-Tac-Toe — Version B renderer (Three.js / WebGL)
   ---------------------------------------------------------------------
   Renders the shared CubeTicTacToe engine as a real WebGL cube.
   - Drag / touch-drag to rotate the cube (custom, so no module-only
     OrbitControls — the page runs straight from file://).
   - Tap a cell to place your mark (raycasting picks the nearest cell).
   - Snap-to-face buttons rotate a chosen face toward the camera.
   Each cell is a small plane carrying a canvas texture we repaint with
   the X / O mark; each face has a backing plane we tint when it finishes.
   Pairs with cubetictactoe.js (engine) and the body.cube-page styles.
   ===================================================================== */

(function () {
  "use strict";

  if (typeof THREE === "undefined") {
    document.getElementById("ctt-status").textContent =
      "Could not load Three.js (needs an internet connection).";
    return;
  }

  const $ = function (id) { return document.getElementById(id); };
  const container = $("ctt-three");
  const statusEl = $("ctt-status");

  // Colors mirror the CSS theme.
  const COL = {
    x: "#ff7676",
    o: "#74a8ff",
    tile: "#161b13",
    border: "rgba(181,232,83,0.45)",
    faceDefault: 0x0a0d07,
    faceX: 0x6e1414,
    faceO: 0x16306e,
    faceDraw: 0x444444
  };

  /* ---- Scene setup ------------------------------------------------ */

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  // Pulled in from 6.2 so the cube fills more of its box (bigger on screen).
  // 4.9 keeps the worst-case rotated extent (the space diagonal, ~3.46 units)
  // comfortably inside the view with a small margin, so it never clips.
  camera.position.set(0, 0, 4.9);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const cube = new THREE.Group();
  scene.add(cube);

  const HALF = 1;        // half the cube edge
  const STEP = 0.62;     // spacing between cell centres
  const CELL = 0.56;     // cell tile size

  // Per-face group transforms: local +z points outward from the cube.
  const FACE_TF = [
    { pos: [0, 0, HALF],  rot: [0, 0, 0] },          // 0 front
    { pos: [0, 0, -HALF], rot: [0, Math.PI, 0] },    // 1 back
    { pos: [HALF, 0, 0],  rot: [0, Math.PI / 2, 0] },// 2 right
    { pos: [-HALF, 0, 0], rot: [0, -Math.PI / 2, 0] },// 3 left
    { pos: [0, HALF, 0],  rot: [-Math.PI / 2, 0, 0] },// 4 top
    { pos: [0, -HALF, 0], rot: [Math.PI / 2, 0, 0] } // 5 bottom
  ];

  const cellData = []; // cellData[face][idx] = { canvas, ctx, texture }
  const facePlanes = [];
  const pickables = []; // cell meshes for raycasting

  function makeCellTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 160;
    const ctx = canvas.getContext("2d");
    const texture = new THREE.CanvasTexture(canvas);
    const entry = { canvas: canvas, ctx: ctx, texture: texture };
    paintCell(entry, "");
    return entry;
  }

  function paintCell(entry, value) {
    const ctx = entry.ctx;
    const s = entry.canvas.width;
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = COL.tile;
    ctx.fillRect(0, 0, s, s);
    ctx.lineWidth = 6;
    ctx.strokeStyle = COL.border;
    ctx.strokeRect(3, 3, s - 6, s - 6);
    if (value) {
      ctx.fillStyle = value === "X" ? COL.x : COL.o;
      ctx.font = "bold 110px 'Segoe UI', Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(value, s / 2, s / 2 + 6);
    }
    entry.texture.needsUpdate = true;
  }

  // Build the six faces.
  for (let f = 0; f < CubeTicTacToe.FACE_COUNT; f++) {
    const g = new THREE.Group();
    g.position.set.apply(g.position, FACE_TF[f].pos);
    g.rotation.set.apply(g.rotation, FACE_TF[f].rot);
    cube.add(g);

    // Backing plane (tinted when the face finishes).
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.92, 1.92),
      new THREE.MeshBasicMaterial({ color: COL.faceDefault })
    );
    g.add(plane);
    facePlanes.push(plane);

    cellData.push([]);
    for (let i = 0; i < 9; i++) {
      const row = Math.floor(i / 3);
      const col = i % 3;
      const entry = makeCellTexture();
      cellData[f].push(entry);

      const tile = new THREE.Mesh(
        new THREE.PlaneGeometry(CELL, CELL),
        new THREE.MeshBasicMaterial({ map: entry.texture, transparent: true })
      );
      tile.position.set((col - 1) * STEP, (1 - row) * STEP, 0.02);
      tile.userData = { face: f, idx: i };
      g.add(tile);
      pickables.push(tile);
    }
  }

  /* ---- Inner cube finish: Molten Silver vs Mini Sun -------------- */
  // The cube is six surface planes, so its edges/gutters used to show
  // straight through to the background. We fill the interior two ways
  // (UI toggle) so the seams read as a feature instead of a gap:
  //   - "chrome": a metallic core box reflecting a baked environment.
  //   - "sun":    a glowing sphere whose light bleeds through the seams.

  // Lights only affect the metal core (every other material is Basic).
  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
  keyLight.position.set(2, 3, 4);
  scene.add(keyLight);

  // Baked equirectangular environment (a soft vertical gradient) for the
  // chrome to reflect — static, so no render-target cost per frame.
  function makeEnvTexture() {
    const c = document.createElement("canvas");
    c.width = 64; c.height = 256;
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.00, "#cdd6e6");
    grad.addColorStop(0.49, "#6b7382");
    grad.addColorStop(0.50, "#2a2f25");
    grad.addColorStop(1.00, "#05070b");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    return tex;
  }
  const envTex = makeEnvTexture();

  const metalMat = new THREE.MeshStandardMaterial({
    color: 0xe6e8ec, metalness: 1.0, roughness: 0.18,
    envMap: envTex, envMapIntensity: 1.1
  });
  const metalCore = new THREE.Mesh(new THREE.BoxGeometry(1.985, 1.985, 1.985), metalMat);
  cube.add(metalCore);

  // Glowing sun: a hot radial-gradient sphere + an additive corona halo.
  function makeSunTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0.00, "#fff7e0");
    grad.addColorStop(0.35, "#ffd24a");
    grad.addColorStop(0.70, "#ff7a18");
    grad.addColorStop(1.00, "#7a1d00");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }
  const sunGroup = new THREE.Group();
  const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.82, 32, 24),
    new THREE.MeshBasicMaterial({ map: makeSunTexture() })
  );
  const coronaMat = new THREE.MeshBasicMaterial({
    color: 0xff8a2a, transparent: true, opacity: 0.28,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const corona = new THREE.Mesh(new THREE.SphereGeometry(0.98, 32, 24), coronaMat);
  sunGroup.add(sunMesh, corona);
  cube.add(sunGroup);

  let finish = "chrome";
  function setFinish(name) {
    finish = name;
    const sun = name === "sun";
    metalCore.visible = !sun;
    sunGroup.visible = sun;
    // In sun mode let the inner glow bleed through each face a touch.
    for (let f = 0; f < facePlanes.length; f++) {
      const m = facePlanes[f].material;
      m.transparent = sun;
      m.opacity = sun ? 0.7 : 1;
      m.needsUpdate = true;
    }
    const btns = document.querySelectorAll("#ctt-finish button");
    for (let i = 0; i < btns.length; i++) {
      btns[i].classList.toggle("ctt-active", btns[i].getAttribute("data-finish") === name);
    }
  }
  const finishRow = $("ctt-finish");
  if (finishRow) {
    finishRow.addEventListener("click", function (e) {
      const btn = e.target.closest("button[data-finish]");
      if (btn) setFinish(btn.getAttribute("data-finish"));
    });
  }
  setFinish("chrome");

  /* ---- Rotation (drag + snap), with smooth tweening -------------- */

  const ISO = { x: -0.5, y: -0.65 };
  const SNAP = {
    "0": { x: 0, y: 0 },
    "1": { x: 0, y: Math.PI },
    "2": { x: 0, y: -Math.PI / 2 },
    "3": { x: 0, y: Math.PI / 2 },
    "4": { x: Math.PI / 2, y: 0 },
    "5": { x: -Math.PI / 2, y: 0 }
  };

  let curX = ISO.x, curY = ISO.y;       // current rotation (radians)
  let tgtX = ISO.x, tgtY = ISO.y;       // target rotation
  let dragging = false, moved = false;
  let lastPX = 0, lastPY = 0, downX = 0, downY = 0;

  const dom = renderer.domElement;

  dom.addEventListener("pointerdown", function (e) {
    dragging = true;
    moved = false;
    lastPX = downX = e.clientX;
    lastPY = downY = e.clientY;
    dom.setPointerCapture(e.pointerId);
  });

  dom.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    const dx = e.clientX - lastPX;
    const dy = e.clientY - lastPY;
    lastPX = e.clientX;
    lastPY = e.clientY;
    if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 6) moved = true;
    tgtY += dx * 0.01;
    tgtX += dy * 0.01;
    tgtX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, tgtX));
    curX = tgtX; curY = tgtY; // follow the finger immediately while dragging
    clearActiveView();
  });

  function endPointer(e) {
    if (!dragging) return;
    dragging = false;
    try { dom.releasePointerCapture(e.pointerId); } catch (err) {}
    if (!moved) handleTap(e);
  }
  dom.addEventListener("pointerup", endPointer);
  dom.addEventListener("pointercancel", endPointer);

  function clearActiveView() {
    const btns = document.querySelectorAll("#ctt-rotate button");
    for (let i = 0; i < btns.length; i++) btns[i].classList.remove("ctt-active");
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

  // Rotate the cube to bring a given face toward the camera + light its button.
  function snapToFace(face) {
    const t = SNAP[String(face)];
    if (!t) return;
    tgtX = t.x;
    tgtY = t.y;
    clearActiveView();
    const btn = document.querySelector('#ctt-rotate button[data-face="' + face + '"]');
    if (btn) btn.classList.add("ctt-active");
  }

  $("ctt-rotate").addEventListener("click", function (e) {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.hasAttribute("data-view")) {
      clearActiveView();
      btn.classList.add("ctt-active");
      tgtX = ISO.x;
      tgtY = ISO.y;
    } else {
      snapToFace(parseInt(btn.getAttribute("data-face"), 10));
    }
  });

  /* ---- Tap → raycast → move -------------------------------------- */

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function handleTap(e) {
    const rect = dom.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    if (hits.length > 0) {
      const ud = hits[0].object.userData;
      game.tryMove(ud.face, ud.idx);
    }
  }

  /* ---- Engine + hooks -------------------------------------------- */

  const game = new CubeTicTacToe({
    onReset: function () {
      clearPulse();
      resetFaceButtons();
      for (let f = 0; f < CubeTicTacToe.FACE_COUNT; f++) {
        facePlanes[f].material.color.setHex(COL.faceDefault);
        for (let i = 0; i < 9; i++) paintCell(cellData[f][i], "");
      }
    },
    onCell: function (face, idx, player) {
      paintCell(cellData[face][idx], player);
      // Rotate to show the AI's move + pulse the cell so it's easy to spot.
      if (game.gameMode === "ai" && player === game.aiSymbol) {
        snapToFace(face);
        startPulse(face, idx);
      }
    },
    onFaceFinish: function (face, status) {
      const hex = status === "X" ? COL.faceX : status === "O" ? COL.faceO : COL.faceDraw;
      facePlanes[face].material.color.setHex(hex);
      colorFaceButton(face, status);
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

  /* ---- UI controls ------------------------------------------------ */

  function setModeUI(mode) {
    $("ctt-btn-ai").classList.toggle("ctt-active", mode === "ai");
    $("ctt-btn-local").classList.toggle("ctt-active", mode === "local");
    $("ctt-settings").style.display = mode === "ai" ? "flex" : "none";
  }
  $("ctt-btn-ai").addEventListener("click", function () {
    setModeUI("ai"); setSymbolUI("X"); game.setMode("ai");
  });
  $("ctt-btn-local").addEventListener("click", function () {
    setModeUI("local"); game.setMode("local");
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

  /* ---- AI move pulse --------------------------------------------- */
  // The just-played cell briefly throbs (scales up + pops toward the
  // camera), decaying over PULSE_DUR seconds. Driven from the render loop.
  const PULSE_DUR = 1.4;       // seconds
  const PULSE_BASE_Z = 0.02;   // matches the cell tile z offset
  let pulse = null;            // { mesh, start }

  function startPulse(face, idx) {
    const mesh = pickables[face * 9 + idx];
    if (pulse && pulse.mesh !== mesh) resetMesh(pulse.mesh);
    pulse = { mesh: mesh, start: performance.now() };
  }
  function resetMesh(mesh) {
    mesh.scale.setScalar(1);
    mesh.position.z = PULSE_BASE_Z;
  }
  function clearPulse() {
    if (pulse) { resetMesh(pulse.mesh); pulse = null; }
  }
  function updatePulse() {
    if (!pulse) return;
    const t = (performance.now() - pulse.start) / 1000;
    if (t >= PULSE_DUR) { resetMesh(pulse.mesh); pulse = null; return; }
    const decay = 1 - t / PULSE_DUR;                   // 1 -> 0
    const throb = Math.abs(Math.sin(t * Math.PI * 3)); // a few beats
    const amp = 0.22 * decay * throb;
    pulse.mesh.scale.setScalar(1 + amp);
    pulse.mesh.position.z = PULSE_BASE_Z + amp * 0.5;
  }

  /* ---- Resize + render loop -------------------------------------- */

  /* ---- "Current face" chip --------------------------------------- */
  const FACE_NAMES = ["Front", "Back", "Right", "Left", "Top", "Bottom"];
  const STATE_TEXT = { open: "in play", X: "X won", O: "O won", draw: "drawn" };
  let curKey = "";
  function frontFaceIndex(ax, ay) {
    const ca = Math.cos(ax), sa = Math.sin(ax), cb = Math.cos(ay), sb = Math.sin(ay);
    const z = [ca * cb, -ca * cb, -ca * sb, ca * sb, sa, -sa];
    let best = 0;
    for (let i = 1; i < 6; i++) if (z[i] > z[best]) best = i;
    return best;
  }
  function updateCurrent() {
    const f = frontFaceIndex(curX, curY);
    const status = game.faceStatus[f];
    const key = f + ":" + status;
    if (key === curKey) return; // only touch the DOM when it actually changes
    curKey = key;
    $("ctt-current-face").textContent = FACE_NAMES[f];
    $("ctt-current-state").textContent = STATE_TEXT[status];
    const el = $("ctt-current");
    el.classList.remove("st-open", "st-x", "st-o", "st-draw");
    el.classList.add(status === "open" ? "st-open" : status === "draw" ? "st-draw" : "st-" + status.toLowerCase());
  }

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  function animate() {
    // Ease the cube toward its target rotation (snap buttons feel smooth;
    // drag updates set current == target so it tracks instantly).
    curX += (tgtX - curX) * 0.18;
    curY += (tgtY - curY) * 0.18;
    cube.rotation.x = curX;
    cube.rotation.y = curY;
    if (finish === "sun") {
      const tt = performance.now() * 0.001;
      corona.scale.setScalar(1 + 0.04 * Math.sin(tt * 2));
      coronaMat.opacity = 0.24 + 0.06 * Math.sin(tt * 2);
    }
    updatePulse();
    updateCurrent();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();

  /* ---- Fireworks (DOM overlay, ported from the original) --------- */

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
    this.x = x; this.y = y;
    this.size = Math.random() * 5 + 2;
    this.speedX = (Math.random() - 0.5) * 12;
    this.speedY = (Math.random() - 0.5) * 12;
    this.decay = Math.random() * 0.015 + 0.005;
    this.alpha = 1;
    this.color = "hsl(" + (Math.random() * 80 + 70) + ", 100%, 60%)";
  }
  Particle.prototype.update = function () {
    this.x += this.speedX; this.y += this.speedY;
    this.speedY += 0.2; this.alpha -= this.decay;
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
    const rect = container.getBoundingClientRect();
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

  /* ---- Kick off --------------------------------------------------- */
  game.resetAll();
})();
