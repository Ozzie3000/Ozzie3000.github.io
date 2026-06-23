/* ---------------------------------------------------------------------
   copyright.js — drop-in copyright line for every page.

   Usage: add this once, before </body>:
       <script src="js/copyright.js"></script>   (root pages)
       <script src="../js/copyright.js"></script> (pages in a subfolder)

   Behavior:
   - If the page has element(s) with class "copyright" (or a [data-copyright]
     attribute), their text is set to "© <current year> Ozzie3000".
       e.g.  <span class="copyright"></span>
   - If no such placeholder exists, a centered copyright line is appended to
     the page's <footer> (or to <body> when there is no footer).
   --------------------------------------------------------------------- */
(function () {
  function render() {
    var line = "© " + new Date().getFullYear() + " Ozzie3000";
    var targets = document.querySelectorAll(".copyright, [data-copyright]");

    if (targets.length) {
      for (var i = 0; i < targets.length; i++) {
        targets[i].textContent = line;
      }
      return;
    }

    // No placeholder on the page — append a simple, self-styled line so it
    // looks reasonable even on pages that don't load the site stylesheet.
    var el = document.createElement("div");
    el.className = "copyright auto-copyright";
    el.textContent = line;
    el.style.cssText =
      "text-align:center; font-size:13px; opacity:.7; padding:16px 0; font-family:inherit;";
    (document.querySelector("footer") || document.body).appendChild(el);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
