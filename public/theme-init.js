// Runs before the app (and before first paint), so the page never flashes
// the wrong theme. Keep in sync with src/lib/theme.ts.
(function () {
  var pref = "system";
  try {
    pref = localStorage.getItem("biton-web-compiler:theme") || "system";
  } catch (e) {}
  var dark = pref === "dark" || (pref !== "light" && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
})();
