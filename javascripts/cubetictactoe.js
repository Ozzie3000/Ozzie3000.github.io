/* =====================================================================
   Cube Tic-Tac-Toe — shared game engine
   ---------------------------------------------------------------------
   Pure game logic for a tic-tac-toe game played on the six faces of a
   cube. No DOM, no rendering — it drives a renderer entirely through the
   `hooks` callbacks passed to the constructor. Both the CSS-3D version
   (Version A) and the Three.js version (Version B) share this file so the
   two cubes play *identically*; only their rendering differs.

   Model
     - 6 faces, each an independent 3x3 board (9 cells). 54 cells total.
     - A face is its own standard tic-tac-toe game (8 winning lines). No
       lines cross between faces.
     - When a face is won or filled it locks and is tinted
       (X = red, O = blue, draw = grey).
     - A round ends when all 6 faces are finished. The player holding the
       most faces wins the round; an equal count is a round draw.

   Turn flow
     - Players alternate. On your turn you may place on ANY empty cell of
       ANY still-open face ("six surfaces to play on").

   AI (same difficulty curve as the original tic-tac-toe.html)
     - randomChance = 1 - difficulty/10  (L1 = 90% random, L10 = 0%).
     - When playing "smart" it scans every open face: win a face, else
       block the opponent, else take a face centre, else random.
   ===================================================================== */

(function (global) {
  "use strict";

  // Standard 3x3 winning lines, applied per face.
  const WIN_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  const FACE_COUNT = 6;
  const AI_DELAY = 600; // ms — matches the original game's "thinking" pause

  function CubeTicTacToe(hooks) {
    this.hooks = hooks || {};

    // Settings
    this.gameMode = "local";   // "local" | "ai"
    this.difficulty = 5;       // 1..10
    this.playerSymbol = "X";   // human symbol in AI mode
    this.aiSymbol = "O";

    // Round/match state
    this.faces = [];           // faces[f] = array(9) of "" | "X" | "O"
    this.faceStatus = [];      // faceStatus[f] = "open" | "X" | "O" | "draw"
    this.currentPlayer = "X";
    this.gameActive = false;
    this.gameStarted = false;  // AI mode waits for symbol pick; local auto-starts

    this.roundScores = { X: 0, O: 0, draws: 0 };    // faces won this round
    this.overallScores = { X: 0, O: 0, draws: 0 };  // rounds won across rounds

    this._aiTimer = null;

    this._blankRound();
  }

  CubeTicTacToe.prototype._fire = function (name) {
    const fn = this.hooks[name];
    if (typeof fn === "function") {
      fn.apply(null, Array.prototype.slice.call(arguments, 1));
    }
  };

  CubeTicTacToe.prototype._blankRound = function () {
    this.faces = [];
    this.faceStatus = [];
    for (let f = 0; f < FACE_COUNT; f++) {
      this.faces.push(["", "", "", "", "", "", "", "", ""]);
      this.faceStatus.push("open");
    }
    this.currentPlayer = "X";
    this.roundScores = { X: 0, O: 0, draws: 0 };
  };

  /* ---- Settings -------------------------------------------------- */

  CubeTicTacToe.prototype.setMode = function (mode) {
    if (this.gameMode === mode) return;
    this.gameMode = mode;
    this.resetAll();
  };

  CubeTicTacToe.prototype.setDifficulty = function (value) {
    this.difficulty = parseInt(value, 10);
  };

  CubeTicTacToe.prototype.setPlayerSymbol = function (symbol) {
    if (this.gameStarted) return; // locked once a round is underway
    this.playerSymbol = symbol;
    this.aiSymbol = symbol === "X" ? "O" : "X";
    this.startRound();
  };

  /* ---- Round lifecycle ------------------------------------------ */

  CubeTicTacToe.prototype.startRound = function () {
    this._clearAiTimer();
    this.gameStarted = true;
    this.gameActive = true;
    this._blankRound();

    this._fire("onReset");
    this._fire("onScores", this.roundScores, this.overallScores);

    if (this.gameMode === "ai" && this.playerSymbol === "O") {
      // AI is X and moves first.
      this._fire("onStatus", "AI is thinking...");
      this._fire("onTurn", this.currentPlayer);
      this._scheduleAi();
    } else {
      this._announceTurn();
    }
  };

  // "Next Round" — keep overall scores, start a fresh cube.
  CubeTicTacToe.prototype.nextRound = function () {
    if (this.gameMode === "local") this.gameStarted = true;
    if (!this.gameStarted) {
      // AI mode, no symbol chosen yet — nothing to do.
      this._fire("onReset");
      this._fire("onScores", this.roundScores, this.overallScores);
      this._fire("onStatus", "Pick your symbol to start");
      return;
    }
    this.startRound();
  };

  // "Reset All" — wipe overall scores and return to the pre-game state.
  CubeTicTacToe.prototype.resetAll = function () {
    this._clearAiTimer();
    this.overallScores = { X: 0, O: 0, draws: 0 };
    this._blankRound();
    this._fire("onReset");

    if (this.gameMode === "ai") {
      // Wait for the player to pick a symbol before the round begins.
      this.gameStarted = false;
      this.gameActive = false;
      this.playerSymbol = "X";
      this.aiSymbol = "O";
      this._fire("onScores", this.roundScores, this.overallScores);
      this._fire("onStatus", "Pick your symbol to start");
    } else {
      this.gameStarted = true;
      this.gameActive = true;
      this._fire("onScores", this.roundScores, this.overallScores);
      this._announceTurn();
    }
  };

  /* ---- Moves ----------------------------------------------------- */

  // Renderer entry point for a human tap/click on a cell.
  CubeTicTacToe.prototype.tryMove = function (face, idx) {
    if (!this.gameActive) return false;
    if (this.faceStatus[face] !== "open") return false;
    if (this.faces[face][idx] !== "") return false;
    // In AI mode the human may only move on their own turn.
    if (this.gameMode === "ai" && this.currentPlayer !== this.playerSymbol) return false;

    this._applyMove(face, idx, this.currentPlayer);

    if (this.gameActive && this.gameMode === "ai" && this.currentPlayer === this.aiSymbol) {
      this._scheduleAi();
    }
    return true;
  };

  CubeTicTacToe.prototype._applyMove = function (face, idx, player) {
    this.faces[face][idx] = player;
    this._fire("onCell", face, idx, player);

    // Did this complete the face?
    const result = this._evaluateFace(face);
    if (result) {
      this.faceStatus[face] = result;
      if (result === "draw") this.roundScores.draws++;
      else this.roundScores[result]++;
      this._fire("onFaceFinish", face, result);
      this._fire("onScores", this.roundScores, this.overallScores);

      if (this._allFacesDone()) {
        this._endRound();
        return;
      }
    }

    // Hand over to the other player.
    this.currentPlayer = this.currentPlayer === "X" ? "O" : "X";
    this._announceTurn();
  };

  // Returns "X" | "O" | "draw" | null for a face's current state.
  CubeTicTacToe.prototype._evaluateFace = function (face) {
    const b = this.faces[face];
    for (let i = 0; i < WIN_LINES.length; i++) {
      const [a, c, d] = WIN_LINES[i];
      if (b[a] !== "" && b[a] === b[c] && b[c] === b[d]) return b[a];
    }
    return b.indexOf("") === -1 ? "draw" : null;
  };

  CubeTicTacToe.prototype._allFacesDone = function () {
    return this.faceStatus.every(function (s) { return s !== "open"; });
  };

  CubeTicTacToe.prototype._endRound = function () {
    this.gameActive = false;
    this._clearAiTimer();

    let winner;
    if (this.roundScores.X > this.roundScores.O) winner = "X";
    else if (this.roundScores.O > this.roundScores.X) winner = "O";
    else winner = "draw";

    if (winner === "draw") this.overallScores.draws++;
    else this.overallScores[winner]++;

    this._fire("onScores", this.roundScores, this.overallScores);
    this._fire("onStatus", this._roundMessage(winner));
    this._fire("onRoundEnd", winner, this.roundScores);

    // Celebrate a decisive win — always in local play, or when the human
    // beats the AI.
    const humanWon = this.gameMode === "local" ||
      (this.gameMode === "ai" && winner === this.playerSymbol);
    if (winner !== "draw" && humanWon) {
      this._fire("onCelebrate");
    }
  };

  CubeTicTacToe.prototype._roundMessage = function (winner) {
    const s = this.roundScores;
    const tally = " (" + s.X + "–" + s.O + (s.draws ? ", " + s.draws + " drawn" : "") + ")";
    if (winner === "draw") return "Round Draw!" + tally;
    if (this.gameMode === "ai") {
      return (winner === this.playerSymbol ? "🎉 You Win the Round!" : "AI Wins the Round!") + tally;
    }
    return "Player " + winner + " Wins the Round!" + tally;
  };

  CubeTicTacToe.prototype._announceTurn = function () {
    if (!this.gameActive) return;
    this._fire("onTurn", this.currentPlayer);
    if (this.gameMode === "ai") {
      if (this.currentPlayer === this.aiSymbol) {
        this._fire("onStatus", "AI is thinking...");
      } else {
        this._fire("onStatus", "Your turn (" + this.playerSymbol + ")");
      }
    } else {
      this._fire("onStatus", "Player " + this.currentPlayer + "'s Turn");
    }
  };

  /* ---- AI -------------------------------------------------------- */

  CubeTicTacToe.prototype._scheduleAi = function () {
    this._clearAiTimer();
    const self = this;
    this._aiTimer = global.setTimeout(function () {
      self._aiTimer = null;
      self._aiMove();
    }, AI_DELAY);
  };

  CubeTicTacToe.prototype._clearAiTimer = function () {
    if (this._aiTimer !== null) {
      global.clearTimeout(this._aiTimer);
      this._aiTimer = null;
    }
  };

  CubeTicTacToe.prototype._aiMove = function () {
    if (!this.gameActive || this.currentPlayer !== this.aiSymbol) return;

    let choice = null;

    // Difficulty: chance of ignoring strategy and playing a random move.
    const randomChance = 1 - (this.difficulty / 10);
    if (Math.random() < randomChance) {
      choice = this._randomOpenCell();
    } else {
      // 1) Win a face if possible.
      choice = this._findLineMove(this.aiSymbol);
      // 2) Otherwise block the opponent.
      if (!choice) choice = this._findLineMove(this.playerSymbol);
      // 3) Otherwise grab a free centre.
      if (!choice) choice = this._findCentre();
      // 4) Otherwise anywhere.
      if (!choice) choice = this._randomOpenCell();
    }

    if (choice) this._applyMove(choice.face, choice.idx, this.aiSymbol);
  };

  // Find a cell that completes (or, for the opponent, threatens) a line on
  // any open face. Returns { face, idx } or null.
  CubeTicTacToe.prototype._findLineMove = function (player) {
    for (let f = 0; f < FACE_COUNT; f++) {
      if (this.faceStatus[f] !== "open") continue;
      const b = this.faces[f];
      for (let i = 0; i < WIN_LINES.length; i++) {
        const line = WIN_LINES[i];
        let count = 0, empty = -1;
        for (let k = 0; k < 3; k++) {
          if (b[line[k]] === player) count++;
          else if (b[line[k]] === "") empty = line[k];
        }
        if (count === 2 && empty !== -1) return { face: f, idx: empty };
      }
    }
    return null;
  };

  CubeTicTacToe.prototype._findCentre = function () {
    for (let f = 0; f < FACE_COUNT; f++) {
      if (this.faceStatus[f] === "open" && this.faces[f][4] === "") {
        return { face: f, idx: 4 };
      }
    }
    return null;
  };

  CubeTicTacToe.prototype._randomOpenCell = function () {
    const cells = [];
    for (let f = 0; f < FACE_COUNT; f++) {
      if (this.faceStatus[f] !== "open") continue;
      for (let i = 0; i < 9; i++) {
        if (this.faces[f][i] === "") cells.push({ face: f, idx: i });
      }
    }
    if (cells.length === 0) return null;
    return cells[Math.floor(Math.random() * cells.length)];
  };

  // Expose constants renderers may want.
  CubeTicTacToe.FACE_COUNT = FACE_COUNT;
  CubeTicTacToe.WIN_LINES = WIN_LINES;

  global.CubeTicTacToe = CubeTicTacToe;
})(window);
