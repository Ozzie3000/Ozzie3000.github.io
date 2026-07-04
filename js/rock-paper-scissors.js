/* rock-paper-scissors.js — game logic for rock-paper-scissors.html.
   Vanilla JS, no dependencies (per the Ozzie3000 style spec). */
(function () {
  var MOVES = {
    rock:     { emoji: '✊', beats: 'scissors' },
    paper:    { emoji: '✋', beats: 'rock' },
    scissors: { emoji: '✌️', beats: 'paper' }
  };
  var NAMES = Object.keys(MOVES);

  var score = { win: 0, lose: 0, tie: 0 };

  var youHand  = document.getElementById('you-hand');
  var cpuHand  = document.getElementById('cpu-hand');
  var outcome  = document.getElementById('outcome');
  var elWin    = document.getElementById('score-win');
  var elLose   = document.getElementById('score-lose');
  var elTie    = document.getElementById('score-tie');

  function play(you) {
    var cpu = NAMES[Math.floor(Math.random() * NAMES.length)];
    youHand.textContent = MOVES[you].emoji;
    cpuHand.textContent = MOVES[cpu].emoji;

    var result, cls;
    if (you === cpu) {
      result = 'Tie!'; cls = 'tie'; score.tie++;
    } else if (MOVES[you].beats === cpu) {
      result = 'You win!'; cls = 'win'; score.win++;
    } else {
      result = 'You lose!'; cls = 'lose'; score.lose++;
    }

    outcome.textContent = result;
    outcome.className = 'rps-outcome ' + cls;
    elWin.textContent  = score.win;
    elLose.textContent = score.lose;
    elTie.textContent  = score.tie;
  }

  function reset() {
    score = { win: 0, lose: 0, tie: 0 };
    youHand.textContent = '❓';
    cpuHand.textContent = '❓';
    outcome.textContent = 'Make your move';
    outcome.className = 'rps-outcome';
    elWin.textContent = elLose.textContent = elTie.textContent = '0';
  }

  document.querySelectorAll('.rps-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { play(btn.dataset.move); });
  });
  document.getElementById('rps-reset').addEventListener('click', reset);
})();
