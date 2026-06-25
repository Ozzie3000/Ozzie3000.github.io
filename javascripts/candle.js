/* =====================================================================
   candle.js — spawner for the reusable CSS candle (stylesheets/candle.css)
   ---------------------------------------------------------------------
   Plain CSS can't loop or randomise, so the flame's particles are built
   here. Each particle carries three CSS variables the stylesheet reads:
     --s  size (px)   --x  horizontal offset (px)   --d  start delay (s)

   USAGE
     Candle.create(stage, {
       count: 120,          // particles in the flame (default 120)
       scale: 1,            // overall size  (sets --candle-scale)
       flame: "#fa8763",    // glow colour   (sets --flame)
       flameBase: "#761b00",// flame base    (sets --flame-base)
       wax: "#ca9800",      // body colour   (sets --wax-light)
       left: "50%",         // CSS left  on the .candle
       bottom: "0"          // CSS bottom on the .candle
     });
   `stage` should be a positioned (e.g. position:relative), dark element.
   Returns the created .candle element.
   ===================================================================== */
(function (global) {
  "use strict";

  function rand(n) { return Math.random() * n; }

  function spawnParticles(fire, count) {
    for (var i = 0; i < count; i++) {
      var b = document.createElement("div");
      b.className = "candle__ball";
      // Mirrors the original SCSS: size 2..52px, x -54..15px, delay 0..-3s.
      b.style.setProperty("--s", (rand(50) + 2).toFixed(1) + "px");
      b.style.setProperty("--x", (rand(70) - 55).toFixed(1) + "px");
      b.style.setProperty("--d", (-rand(3)).toFixed(3) + "s");
      fire.appendChild(b);
    }
  }

  function setVar(el, name, val) {
    if (val !== undefined && val !== null) el.style.setProperty(name, val);
  }

  function create(stage, opts) {
    opts = opts || {};

    var candle = document.createElement("div");
    candle.className = "candle";
    setVar(candle, "--candle-scale", opts.scale);
    setVar(candle, "--flame", opts.flame);
    setVar(candle, "--flame-base", opts.flameBase);
    setVar(candle, "--wax-light", opts.wax);
    if (opts.left   != null) candle.style.left   = opts.left;
    if (opts.top    != null) candle.style.top    = opts.top;
    if (opts.bottom != null) candle.style.bottom = opts.bottom;

    var body = document.createElement("div");
    body.className = "candle__body";

    var box = document.createElement("div");
    box.className = "candle__fire-box";
    var fire = document.createElement("div");
    fire.className = "candle__fire";
    box.appendChild(fire);

    candle.appendChild(body);
    candle.appendChild(box);
    spawnParticles(fire, opts.count || 120);

    (stage || document.body).appendChild(candle);
    return candle;
  }

  global.Candle = { create: create };
})(window);
