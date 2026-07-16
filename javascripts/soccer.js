/* =====================================================================
   soccer.js — 2D Soccer, Argentina vs Spain (soccer.html)
   ---------------------------------------------------------------------
   3v3 top-down football on a <canvas>, single player vs AI.
   - You steer whichever of your three players is nearest the ball
     (green ring). He follows the mouse; click to kick toward the cursor.
   - Difficulty slider (1-10) scales AI speed, aim and reaction.
   - Half-length slider (1-45 min). Two halves, teams swap ends at HT.
   - Score per match + overall matches-won tally, like the Cube games.
   ===================================================================== */
(function () {
  "use strict";

  var canvas = document.getElementById("pitch");
  var ctx = canvas.getContext("2d");

  /* ---- Field geometry (canvas units; CSS scales the canvas) -------- */
  var W = 960, H = 600;          // canvas
  var M = 45;                    // margin: pitch runs M..W-M, M..H-M
  var CX = W / 2, CY = H / 2;
  var GOAL_HW = 80;              // goal mouth half-width (vertical)
  var GOAL_D = 28;               // net depth behind the goal line
  /* Player size: 14 with a mouse, 21 (+50%) on touch-first devices,
     where fingers need a bigger target. pointer:coarse means the
     PRIMARY input is touch, so touchscreen laptops still get 14. */
  var IS_TOUCH = (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
                 !window.matchMedia && "ontouchstart" in window;
  var PR = IS_TOUCH ? 21 : 14;   // player radius
  var BR = 9;                    // ball radius

  /* ---- Teams -------------------------------------------------------
     dir = +1 attacks the RIGHT goal, -1 attacks the LEFT goal.
     Directions flip at halftime. Index 0 is always Argentina. */
  var TEAMS = [
    { name: "Argentina", color: "#7ec8ff", trim: "#ffffff", dir: 1 },
    { name: "Spain",     color: "#e84545", trim: "#f5c518", dir: -1 }
  ];
  var userTeam = 0;              // 0 = Argentina, 1 = Spain

  /* ---- Match state -------------------------------------------------- */
  var state = "setup";           // setup|play|paused|goal|halftime|fulltime
  var half = 1;
  var halfMin = 2;               // slider, minutes per half
  var remaining = halfMin * 60;  // seconds left in this half
  var score = [0, 0];            // goals this match [Argentina, Spain]
  var overall = [0, 0, 0];       // matches [Argentina, draws, Spain]
  var firstKick = 0;             // team kicking off the 1st half
  var goalTimer = 0;             // freeze-frame after a goal
  var lastConceder = 0;          // who kicks off after a goal
  var diff = 5;
  var kickTeam = 0;              // team taking the current kickoff
  var kickoffPending = false;    // true until kickTeam touches the ball
  var htTimer = 0;               // halftime break countdown (seconds)
  var HT_BREAK = 60;             // halftime lasts 1 minute

  var mouse = { x: CX, y: CY };
  var controlled = -1;           // index into players[] (user's active man)
  var manualUntil = 0;           // spacebar override: auto-switch sleeps until then

  var ball = { x: CX, y: CY, vx: 0, vy: 0 };
  var players = [];              // {t, role, x, y, vx, vy, cd}

  /* ---- Helpers ------------------------------------------------------ */
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function dist(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); }
  function attackGoalX(t) { return TEAMS[t].dir === 1 ? W - M : M; }
  function ownGoalX(t)    { return TEAMS[t].dir === 1 ? M : W - M; }
  function aiSpeed()      { return 145 + diff * 13; }   // 158..275 (user: 250)

  /* Home formation spot for a player, relative to his own goal. */
  function homePos(t, role) {
    var d = TEAMS[t].dir;
    var gx = ownGoalX(t);
    var frac = [0.16, 0.40, 0.62][role];          // defender, mid, striker
    return {
      x: gx + d * frac * (W - 2 * M),
      y: [CY, CY - 130, CY + 130][role]
    };
  }

  /* Reset everyone for a kickoff; the kicking team's striker starts on
     the ball. Kickoff law: nobody may cross the halfway line (and the
     defending side must stay out of the center circle) until the
     kicking team touches the ball — enforced each frame while
     kickoffPending is true. */
  function setupKickoff(kt) {
    kickTeam = kt;
    kickoffPending = true;
    players.length = 0;
    for (var t = 0; t < 2; t++) {
      for (var r = 0; r < 3; r++) {
        var h = homePos(t, r);
        players.push({ t: t, role: r, x: h.x, y: h.y, vx: 0, vy: 0, cd: 0 });
      }
    }
    ball.x = CX; ball.y = CY; ball.vx = 0; ball.vy = 0;
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      if (p.t === kickTeam && p.role === 2) { p.x = CX - TEAMS[kickTeam].dir * 42; p.y = CY; }
    }
    controlled = -1;
  }

  /* While a kickoff is pending: everyone on his own half, and the team
     NOT kicking off also outside the center circle. */
  function enforceKickoffLaw() {
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      if (TEAMS[p.t].dir === 1) p.x = Math.min(p.x, CX - PR);
      else                      p.x = Math.max(p.x, CX + PR);
      if (p.t !== kickTeam) {
        var dx = p.x - CX, dy = p.y - CY;
        var d = Math.sqrt(dx * dx + dy * dy);
        var min = 62 + PR;                      // center circle + body
        if (d > 0 && d < min) { p.x = CX + dx / d * min; p.y = CY + dy / d * min; }
      }
    }
  }

  /* Pick the user's controlled player: nearest to the ball, with
     hysteresis so control doesn't flicker between two teammates.
     A spacebar pick (manualUntil) suspends auto-switching briefly. */
  function pickControlled() {
    if (performance.now() / 1000 < manualUntil &&
        controlled >= 0 && players[controlled] && players[controlled].t === userTeam) return;
    var bestI = -1, bestD = Infinity;
    for (var i = 0; i < players.length; i++) {
      if (players[i].t !== userTeam) continue;
      var d = dist(players[i].x, players[i].y, ball.x, ball.y);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    if (controlled < 0 || players[controlled].t !== userTeam) { controlled = bestI; return; }
    var curD = dist(players[controlled].x, players[controlled].y, ball.x, ball.y);
    if (bestD < curD * 0.72) controlled = bestI;  // must be clearly closer to steal control
  }

  /* Smoothly steer a player toward (tx,ty) at top speed `sp`. */
  function steer(p, tx, ty, sp, dt) {
    var dx = tx - p.x, dy = ty - p.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    var dvx = 0, dvy = 0;
    if (d > 4) { dvx = dx / d * sp; dvy = dy / d * sp; }
    var k = Math.min(1, dt * 9);
    p.vx += (dvx - p.vx) * k;
    p.vy += (dvy - p.vy) * k;
    p.x = clamp(p.x + p.vx * dt, M + PR, W - M - PR);
    p.y = clamp(p.y + p.vy * dt, M + PR, H - M - PR);
  }

  function kickBall(fromX, fromY, toX, toY, power) {
    var dx = toX - fromX, dy = toY - fromY;
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    ball.vx = dx / d * power;
    ball.vy = dy / d * power;
  }

  /* ---- Per-frame update -------------------------------------------- */
  function update(dt) {
    if (state === "goal") {
      goalTimer -= dt;
      if (goalTimer <= 0) {
        setupKickoff(lastConceder);
        state = "play";
        setStatus("Kickoff: " + TEAMS[lastConceder].name +
          (lastConceder === userTeam ? " — that's you, touch the ball to restart." : ""));
      }
      return;
    }
    if (state === "halftime") {
      htTimer -= dt;
      if (htTimer <= 0) { startSecondHalf(); return; }
      var s = Math.ceil(htTimer);
      setStatus("Half Time (" + scoreLine() + ") — 2nd half in 0:" + (s < 10 ? "0" : "") + s);
      return;
    }
    if (state !== "play") return;

    /* Clock (only runs during live play) */
    remaining -= dt;
    if (remaining <= 0) { remaining = 0; endHalf(); return; }

    pickControlled();

    /* Which AI player is nearest the ball? He chases; others hold shape. */
    var aiTeam = 1 - userTeam;
    var chaser = -1, chaseD = Infinity, i, p, d;
    for (i = 0; i < players.length; i++) {
      if (players[i].t !== aiTeam) continue;
      d = dist(players[i].x, players[i].y, ball.x, ball.y);
      if (d < chaseD) { chaseD = d; chaser = i; }
    }

    var now = performance.now() / 1000;
    for (i = 0; i < players.length; i++) {
      p = players[i];
      p.cd = Math.max(0, p.cd - dt);
      var home = homePos(p.t, p.role);

      if (p.t === userTeam) {
        if (i === controlled) {
          steer(p, clamp(mouse.x, M, W - M), clamp(mouse.y, M, H - M), 250, dt);
        } else {
          /* Teammates: hold formation, leaning toward the ball. */
          steer(p, home.x * 0.7 + ball.x * 0.3, home.y * 0.7 + ball.y * 0.3, 175, dt);
        }
      } else if (i === chaser) {
        /* Chase with a touch of lead; low difficulty wanders more. */
        var wob = (11 - diff) * 6;
        steer(p,
          ball.x + ball.vx * 0.12 + Math.sin(now * 2.1 + i * 7) * wob,
          ball.y + ball.vy * 0.12 + Math.cos(now * 1.7 + i * 5) * wob,
          aiSpeed(), dt);
      } else if (p.role === 0) {
        /* Defender: hold the line between the ball and his own goal. */
        var gx = ownGoalX(p.t);
        steer(p, ball.x * 0.35 + gx * 0.65, ball.y * 0.35 + CY * 0.65, aiSpeed() * 0.9, dt);
      } else {
        steer(p, home.x * 0.65 + ball.x * 0.35, home.y * 0.65 + ball.y * 0.35, aiSpeed() * 0.85, dt);
      }
    }

    /* Player-player collisions: shove apart, no drama. */
    for (i = 0; i < players.length; i++) {
      for (var j = i + 1; j < players.length; j++) {
        var a = players[i], b = players[j];
        var dx = b.x - a.x, dy = b.y - a.y;
        d = Math.sqrt(dx * dx + dy * dy);
        if (d > 0 && d < PR * 2) {
          var push = (PR * 2 - d) / 2;
          dx /= d; dy /= d;
          a.x -= dx * push; a.y -= dy * push;
          b.x += dx * push; b.y += dy * push;
        }
      }
    }

    if (kickoffPending) enforceKickoffLaw();

    /* Ball-player contact: AI shoots on touch (with aim noise scaled by
       difficulty); everyone also nudges the ball by running into it. */
    for (i = 0; i < players.length; i++) {
      p = players[i];
      var bdx = ball.x - p.x, bdy = ball.y - p.y;
      d = Math.sqrt(bdx * bdx + bdy * bdy);
      if (d > 0 && d < PR + BR + 2) {
        if (kickoffPending) {
          if (p.t !== kickTeam) continue;       // only the kicking team may play it
          kickoffPending = false;               // ball is in play
        }
        var nx = bdx / d, ny = bdy / d;
        ball.x = p.x + nx * (PR + BR + 2);
        ball.y = p.y + ny * (PR + BR + 2);
        if (p.t !== userTeam && p.cd <= 0) {
          var noise = (Math.random() - 0.5) * (11 - diff) * 0.09;   // radians
          var gy = CY + (Math.random() - 0.5) * GOAL_HW * 1.2;
          var ang = Math.atan2(gy - ball.y, attackGoalX(p.t) - ball.x) + noise;
          var pow = 380 + diff * 22;
          ball.vx = Math.cos(ang) * pow;
          ball.vy = Math.sin(ang) * pow;
          p.cd = 1.15 - diff * 0.05;
        } else {
          ball.vx = p.vx * 1.05 + nx * 120;
          ball.vy = p.vy * 1.05 + ny * 120;
        }
      }
    }

    /* Ball physics */
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    var fr = Math.pow(0.35, dt);            // per-second rolling friction
    ball.vx *= fr; ball.vy *= fr;

    /* Sidelines */
    if (ball.y < M + BR)      { ball.y = M + BR;      ball.vy = Math.abs(ball.vy) * 0.75; }
    if (ball.y > H - M - BR)  { ball.y = H - M - BR;  ball.vy = -Math.abs(ball.vy) * 0.75; }

    /* Goal lines: inside the mouth the ball may cross; otherwise bounce. */
    var inMouth = Math.abs(ball.y - CY) < GOAL_HW - 4;
    if (ball.x < M + BR) {
      if (inMouth) {
        if (ball.x < M - BR) { goalScored(TEAMS[0].dir === -1 ? 0 : 1); return; }
        if (ball.x < M - GOAL_D + BR) { ball.x = M - GOAL_D + BR; ball.vx = Math.abs(ball.vx) * 0.4; }
      } else {
        ball.x = M + BR; ball.vx = Math.abs(ball.vx) * 0.75;
      }
    }
    if (ball.x > W - M - BR) {
      if (inMouth) {
        if (ball.x > W - M + BR) { goalScored(TEAMS[0].dir === 1 ? 0 : 1); return; }
        if (ball.x > W - M + GOAL_D - BR) { ball.x = W - M + GOAL_D - BR; ball.vx = -Math.abs(ball.vx) * 0.4; }
      } else {
        ball.x = W - M - BR; ball.vx = -Math.abs(ball.vx) * 0.75;
      }
    }
  }

  function goalScored(scorer) {
    score[scorer]++;
    lastConceder = 1 - scorer;
    state = "goal";
    goalTimer = 2.0;
    setStatus("GOAL! " + TEAMS[scorer].name + " score!");
    updateBoards();
  }

  function endHalf() {
    if (half === 1) {
      half = 2;
      remaining = halfMin * 60;
      TEAMS[0].dir *= -1;                    // teams swap ends
      TEAMS[1].dir *= -1;
      setupKickoff(1 - firstKick);           // other team kicks off the 2nd
      state = "halftime";
      htTimer = HT_BREAK;                    // 1-minute break, then auto-restart
      setStatus("Half Time (" + scoreLine() + ") — 2nd half in 1:00");
      btnStart.textContent = "Skip Break";
    } else {
      state = "fulltime";
      if (score[0] > score[1]) overall[0]++;
      else if (score[1] > score[0]) overall[2]++;
      else overall[1]++;
      var msg = score[0] === score[1]
        ? "Full Time — it's a draw, " + scoreLine()
        : "Full Time — " + TEAMS[score[0] > score[1] ? 0 : 1].name + " win " + scoreLine() + "!";
      setStatus(msg);
      btnStart.textContent = "Start Match";
      updateBoards();
    }
  }

  function scoreLine() { return score[0] + "–" + score[1]; }

  function resetMatch() {
    score = [0, 0];
    half = 1;
    remaining = halfMin * 60;
    TEAMS[0].dir = 1; TEAMS[1].dir = -1;
    firstKick = Math.random() < 0.5 ? 0 : 1;
    setupKickoff(firstKick);
    state = "setup";
    panel.style.display = "";                // instructions back for pre-match
    btnStart.textContent = "Start Match";
    setStatus("Pick a team, set your sliders, then Start Match.");
    updateBoards();
  }

  /* ---- DOM ---------------------------------------------------------- */
  var elStatus = document.getElementById("soc-status");
  var elClock = document.getElementById("soc-clock");
  var btnStart = document.getElementById("soc-start");
  var btnNext = document.getElementById("soc-next");
  var btnReset = document.getElementById("soc-reset");
  var btnArg = document.getElementById("soc-team-arg");
  var btnEsp = document.getElementById("soc-team-esp");
  var slDiff = document.getElementById("soc-difficulty");
  var slHalf = document.getElementById("soc-halflen");

  function setStatus(t) { elStatus.textContent = t; }

  function updateBoards() {
    document.getElementById("soc-goals-arg").textContent = "Argentina: " + score[0];
    document.getElementById("soc-goals-esp").textContent = "Spain: " + score[1];
    document.getElementById("soc-overall-arg").textContent = "Argentina: " + overall[0];
    document.getElementById("soc-overall-draw").textContent = "Draw: " + overall[1];
    document.getElementById("soc-overall-esp").textContent = "Spain: " + overall[2];
  }

  function updateClock() {
    var s = Math.max(0, Math.ceil(remaining));
    var mm = Math.floor(s / 60), ss = s % 60;
    elClock.textContent = (half === 1 ? "1st " : "2nd ") +
      (mm < 10 ? "0" : "") + mm + ":" + (ss < 10 ? "0" : "") + ss;
  }

  btnStart.addEventListener("click", function () {
    if (state === "setup" || state === "fulltime") {
      if (state === "fulltime") resetMatch();          // Start after FT = new match
      remaining = halfMin * 60;
      setupKickoff(firstKick);
      state = "play";
      btnStart.textContent = "Pause";
      setStatus("Kickoff! " + TEAMS[userTeam].name + " — that's you.");
    } else if (state === "play") {
      state = "paused";
      btnStart.textContent = "Resume";
      setStatus("Paused.");
    } else if (state === "paused") {
      state = "play";
      btnStart.textContent = "Pause";
      setStatus("Play on!");
    } else if (state === "halftime") {
      startSecondHalf();                     // skip the rest of the break
    }
    /* Music follows the button: playing = music on, paused = music off. */
    if (state === "play") startMusic();
    else if (state === "paused") music.pause();
  });

  function startSecondHalf() {
    state = "play";
    btnStart.textContent = "Pause";
    setStatus("Second half — ends have switched!");
  }
  /* Instructions panel: visible in setup, auto-hidden while the ball is
     in play (see frame loop); the button brings it back and pauses. */
  var panel = document.getElementById("soc-instructions");
  document.getElementById("soc-instr").addEventListener("click", function () {
    if (panel.style.display === "none") {
      panel.style.display = "";
      if (state === "play") {
        state = "paused";
        btnStart.textContent = "Resume";
        setStatus("Paused — read up, then hit Resume.");
        music.pause();                       // pausing the game pauses the tune
      }
    } else {
      panel.style.display = "none";
    }
  });

  btnNext.addEventListener("click", resetMatch);
  btnReset.addEventListener("click", function () { overall = [0, 0, 0]; resetMatch(); });

  function chooseTeam(t) {
    userTeam = t;
    btnArg.classList.toggle("ctt-active", t === 0);
    btnEsp.classList.toggle("ctt-active", t === 1);
    resetMatch();
  }
  btnArg.addEventListener("click", function () { chooseTeam(0); });
  btnEsp.addEventListener("click", function () { chooseTeam(1); });

  /* Background music (Dragon Roost Island).
     Mobile quirks handled here:
     - iOS ignores audioElement.volume, so once a user gesture arrives we
       route the sound through a Web Audio GainNode, which iOS respects.
     - Mobile browsers pause audio on their own (interruptions, screen
       lock, tab switches) and don't resume — so we remember the user's
       intent (wantMusic) and restart on the next tap / return to tab.
     - Autoplay is blocked pre-gesture, so playback starts with Start. */
  var music = document.getElementById("soc-music");
  var slVol = document.getElementById("soc-volume");
  var wantMusic = +slVol.value > 0;   // user intent: should music be on?
  var musicStarted = false;           // has a gesture unlocked audio yet?
  var actx = null, gain = null;

  function hookWebAudio() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || actx) return;
    try {
      actx = new AC();
      var src = actx.createMediaElementSource(music);
      gain = actx.createGain();
      src.connect(gain);
      gain.connect(actx.destination);
    } catch (e) { actx = null; gain = null; }  // fall back to element volume
  }

  function applyVolume() {
    var v = +slVol.value / 100;
    if (gain) { gain.gain.value = v; music.volume = 1; }
    else music.volume = v;
  }

  function startMusic() {
    if (!wantMusic) return;
    hookWebAudio();
    if (actx && actx.state !== "running") actx.resume().catch(function () {});
    applyVolume();
    if (music.paused) music.play().catch(function () {});
    musicStarted = true;
  }

  slVol.addEventListener("input", function () {
    wantMusic = +slVol.value > 0;
    document.getElementById("soc-volume-display").textContent = slVol.value + "%";
    applyVolume();
    if (wantMusic) startMusic();              // slider counts as a gesture too
    else music.pause();
  });

  /* Recover from browser-initiated pauses (mobile) — but only while the
     game is actually playing, so a user pause stays paused. */
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && musicStarted && wantMusic && state === "play") startMusic();
  });
  document.addEventListener("touchend", function () {
    if (musicStarted && wantMusic && music.paused && state === "play") startMusic();
  }, { passive: true });

  music.volume = +slVol.value / 100;          // pre-gesture default

  slDiff.addEventListener("input", function () {
    diff = +slDiff.value;
    document.getElementById("soc-difficulty-display").textContent = slDiff.value;
  });
  slHalf.addEventListener("input", function () {
    halfMin = +slHalf.value;
    document.getElementById("soc-halflen-display").textContent = slHalf.value + " min";
    if (state === "setup" || state === "fulltime") remaining = halfMin * 60;
  });

  /* Mouse: canvas is CSS-scaled, so map client px -> canvas units. */
  function toCanvas(e) {
    var r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
  }
  canvas.addEventListener("mousemove", function (e) { mouse = toCanvas(e); });

  /* Touch controls: drag anywhere on the pitch to steer your player;
     a quick tap kicks toward the tap point; tapping one of your own
     players takes control of him. touch-action:none in the CSS stops
     the page from scrolling while you play. */
  var touchStart = null;
  canvas.addEventListener("touchstart", function (e) {
    e.preventDefault();
    var pos = toCanvas(e.changedTouches[0]);   // Touch has clientX/Y too
    mouse = pos;
    touchStart = { x: pos.x, y: pos.y, time: performance.now() };
  }, { passive: false });
  canvas.addEventListener("touchmove", function (e) {
    e.preventDefault();
    mouse = toCanvas(e.changedTouches[0]);
  }, { passive: false });
  canvas.addEventListener("touchend", function (e) {
    e.preventDefault();
    if (!touchStart) return;
    var pos = toCanvas(e.changedTouches[0]);
    var quick = performance.now() - touchStart.time < 260 &&
                dist(pos.x, pos.y, touchStart.x, touchStart.y) < 20;
    touchStart = null;
    if (!quick || state !== "play") return;
    /* Tap on one of your players: take control of him. */
    for (var i = userTeam * 3; i < userTeam * 3 + 3; i++) {
      if (dist(pos.x, pos.y, players[i].x, players[i].y) < PR + 12) {
        controlled = i;
        manualUntil = performance.now() / 1000 + 4;
        return;
      }
    }
    /* Otherwise: kick toward the tap point (same rules as a click). */
    if (controlled < 0) return;
    var p = players[controlled];
    if (dist(p.x, p.y, ball.x, ball.y) < PR + BR + 12) {
      if (kickoffPending) {
        if (userTeam !== kickTeam) return;
        kickoffPending = false;
      }
      kickBall(ball.x, ball.y, pos.x, pos.y, 540);
    }
  }, { passive: false });

  /* Spacebar: cycle through your three players. Player order in the
     players[] array is [team][role], so your men sit at userTeam*3..+2. */
  window.addEventListener("keydown", function (e) {
    if (e.code !== "Space") return;
    if (state !== "play") return;
    e.preventDefault();                      // no page scroll / button re-click
    if (e.target && e.target.blur) e.target.blur();
    var base = userTeam * 3;
    controlled = (controlled >= base && controlled < base + 3)
      ? base + ((controlled - base + 1) % 3)
      : base;
    manualUntil = performance.now() / 1000 + 4;   // hold your pick for 4s
  });
  canvas.addEventListener("mousedown", function (e) {
    mouse = toCanvas(e);
    if (state !== "play" || controlled < 0) return;
    var p = players[controlled];
    if (dist(p.x, p.y, ball.x, ball.y) < PR + BR + 12) {
      if (kickoffPending) {
        if (userTeam !== kickTeam) return;   // not your kickoff
        kickoffPending = false;
      }
      kickBall(ball.x, ball.y, mouse.x, mouse.y, 540);
    }
  });

  /* ---- Drawing ------------------------------------------------------ */
  function drawField() {
    ctx.fillStyle = "#141a12";                        // dark surround
    ctx.fillRect(0, 0, W, H);
    var stripes = 8, sw = (W - 2 * M) / stripes;
    for (var i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 ? "#2b7c3e" : "#318946";   // alternating greens
      ctx.fillRect(M + i * sw, M, sw, H - 2 * M);
    }

    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 3;
    ctx.strokeRect(M, M, W - 2 * M, H - 2 * M);
    ctx.beginPath(); ctx.moveTo(CX, M); ctx.lineTo(CX, H - M); ctx.stroke();
    ctx.beginPath(); ctx.arc(CX, CY, 62, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(CX, CY, 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fill();

    /* Penalty boxes + spots */
    ctx.strokeRect(M, CY - 140, 118, 280);
    ctx.strokeRect(W - M - 118, CY - 140, 118, 280);
    ctx.beginPath(); ctx.arc(M + 88, CY, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(W - M - 88, CY, 3, 0, Math.PI * 2); ctx.fill();

    /* Goals: posts + net */
    drawGoal(M - GOAL_D, CY - GOAL_HW, GOAL_D, GOAL_HW * 2);
    drawGoal(W - M, CY - GOAL_HW, GOAL_D, GOAL_HW * 2);
  }

  function drawGoal(x, y, w, h) {
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    for (var gx = x; gx <= x + w; gx += 7) {
      ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx, y + h); ctx.stroke();
    }
    for (var gy = y; gy <= y + h; gy += 7) {
      ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); ctx.stroke();
    }
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, w, h);
  }

  function drawShadow(x, y, r) {
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.7, r * 1.1, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fill();
  }

  function draw() {
    drawField();

    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      drawShadow(p.x, p.y, PR);
      if (i === controlled && p.t === userTeam) {
        ctx.beginPath(); ctx.arc(p.x, p.y, PR + 5, 0, Math.PI * 2);
        ctx.strokeStyle = "#b5e853"; ctx.lineWidth = 3; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(p.x, p.y, PR, 0, Math.PI * 2);
      ctx.fillStyle = TEAMS[p.t].color; ctx.fill();
      ctx.strokeStyle = TEAMS[p.t].trim; ctx.lineWidth = 2.5; ctx.stroke();
    }

    drawShadow(ball.x, ball.y, BR);
    ctx.beginPath(); ctx.arc(ball.x, ball.y, BR, 0, Math.PI * 2);
    ctx.fillStyle = "#f4f4f4"; ctx.fill();
    ctx.strokeStyle = "#333"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(ball.x, ball.y, BR * 0.45, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1; ctx.stroke();

    /* Big overlay text for the freeze states */
    var msg = null;
    if (state === "goal") msg = "GOAL!";
    else if (state === "paused") msg = "PAUSED";
    else if (state === "halftime") msg = "HALF TIME";
    else if (state === "fulltime") msg = "FULL TIME";
    else if (state === "setup") msg = "PRESS START";
    if (msg) {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(M, CY - 46, W - 2 * M, 92);
      ctx.fillStyle = "#b5e853";
      ctx.font = "bold 44px Monaco, 'Lucida Console', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(msg, CX, CY);
    }
  }

  /* ---- Main loop ----------------------------------------------------- */
  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if ((state === "play" || state === "goal") && panel.style.display !== "none") {
      panel.style.display = "none";          // hide instructions during play
    }
    update(dt);
    updateClock();
    draw();
    requestAnimationFrame(frame);
  }

  /* ---- Corner candles (candle.css + candle.js) ----------------------- */
  (function corners() {
    if (!window.Candle) return;
    var wrap = document.getElementById("pitch-wrap");
    var spots = ["fc-tl", "fc-tr", "fc-bl", "fc-br"];
    var waxes = ["#b8860b", "#ca9800", "#ca9800", "#b8860b"];
    for (var i = 0; i < 4; i++) {
      var c = Candle.create(wrap, {
        scale: 0.26,
        count: 60,
        flame: i % 2 ? "#fa8763" : "#ffb347",
        flameBase: i % 2 ? "#761b00" : "#7a2e00",
        wax: waxes[i]
      });
      c.classList.add("field-candle", spots[i]);
    }
  })();

  /* ---- Go ------------------------------------------------------------ */
  resetMatch();
  requestAnimationFrame(frame);
})();
