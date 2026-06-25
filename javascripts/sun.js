/* =====================================================================
   sun.js — spawner for the reusable CSS sun/corona (stylesheets/sun.css)
   ---------------------------------------------------------------------
   The corona is 100 small blurred shapes that the parent .sun fuses into
   one writhing ring via blur()+contrast() (the "gooey" filter trick).
   Plain CSS can't loop, so the flame elements are built here.

   USAGE
     Sun.create(stage, {
       count:  100,                  // flames (max/default 100; the CSS only
                                     //   styles .sun_fire:nth-child(1..100))
       scale:  1,                    // overall size   (sets --sun-scale)
       left:   "50%",                // CSS left  — the sun's CENTRE x
       top:    "50%",                // CSS top   — the sun's CENTRE y
       fire:   "orange",             // corona colour  (sets --fire)
       border: "yellow",             // rim colour     (sets --border)
       glow:   "rgba(200,0,0,.5)"    // outer glow      (sets --glow)
     });
   `stage` should be a positioned, dark element. Returns the .solar element.
   ===================================================================== */
(function (global) {
  "use strict";

  // The stylesheet defines flame variants for .sun_fire:nth-child(1..100),
  // so 100 is the natural maximum — extra flames would be unstyled.
  var MAX_FLAMES = 100;

  function setVar(el, name, val) {
    if (val !== undefined && val !== null) el.style.setProperty(name, val);
  }

  function create(stage, opts) {
    opts = opts || {};

    var solar = document.createElement("div");
    solar.className = "solar";
    setVar(solar, "--sun-scale", opts.scale);
    setVar(solar, "--fire", opts.fire);
    setVar(solar, "--border", opts.border);
    setVar(solar, "--glow", opts.glow);
    if (opts.left != null) solar.style.left = opts.left;
    if (opts.top  != null) solar.style.top  = opts.top;

    var sun = document.createElement("div");
    sun.className = "sun";

    var count = Math.min(opts.count || MAX_FLAMES, MAX_FLAMES);
    for (var i = 0; i < count; i++) {
      var fire = document.createElement("div");
      fire.className = "sun_fire";
      var inner = document.createElement("div");
      inner.className = "sun_fire_inner";
      fire.appendChild(inner);
      sun.appendChild(fire);            // flames are children 1..count
    }

    var border = document.createElement("div");
    border.className = "sun_border";
    sun.appendChild(border);            // keep .sun_border as the last child

    var cover = document.createElement("div");
    cover.className = "cover";

    solar.appendChild(sun);             // sun first…
    solar.appendChild(cover);           // …cover painted on top, masks roots

    (stage || document.body).appendChild(solar);
    return solar;
  }

  global.Sun = { create: create };
})(window);
