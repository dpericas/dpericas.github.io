/* Start-up: theme, tabs, install hint, data loading and first render. */
(function () {
  "use strict";
  var VSP = window.VSP, $ = VSP.$;

  // theme
  var saved = VSP.store("theme"); if (saved) document.documentElement.setAttribute("data-theme", saved);
  // the button shows what it switches to: 🌙 (go dark) in the light theme, ☀️ (go light) in the dark one
  function isDark() {
    var cur = document.documentElement.getAttribute("data-theme");
    return cur ? cur === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function paintTheme() {
    var b = $("theme"), dark = isDark();
    b.textContent = dark ? "☀️" : "🌙";
    b.title = VSP.t(dark ? "main.to_light" : "main.to_dark");
    b.setAttribute("aria-label", b.title);
  }
  /** "auto" (follows the device: nothing stored), "light" or "dark". */
  VSP.themeMode = function () { var t = VSP.store("theme"); return t === "light" || t === "dark" ? t : "auto"; };
  VSP.setTheme = function (mode) {
    if (mode === "light" || mode === "dark") { document.documentElement.setAttribute("data-theme", mode); VSP.store("theme", mode); }
    else { document.documentElement.removeAttribute("data-theme"); VSP.store("theme", null); }
    paintTheme();
    VSP.emit("theme", VSP.themeMode());
  };
  $("theme").onclick = function () { VSP.setTheme(isDark() ? "light" : "dark"); };
  paintTheme();
  if (window.matchMedia) { var mq = matchMedia("(prefers-color-scheme: dark)"); if (mq.addEventListener) mq.addEventListener("change", paintTheme); }
  $("prefs-btn").onclick = function () { if (location.hash === "#preferencies") VSP.route(); else VSP.go("#preferencies"); };
  $("year").textContent = new Date().getFullYear();

  // tabs
  VSP.each("nav.tabs button", function (b) {
    b.onclick = function () { var t = b.getAttribute("data-go"); if (location.hash === "#" + t) VSP.route(); else location.hash = t; };
  });

  // iPhone: install hint; Android-only parts hidden on iOS
  var ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var standalone = window.navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
  VSP.isIOS = ios;
  if (ios) $("android-app").hidden = true;
  if (ios && !standalone && VSP.store("ios-install-closed") !== "1") $("ios-install").hidden = false;
  $("ios-close").onclick = function () { $("ios-install").hidden = true; VSP.store("ios-install-closed", "1"); };
  if ("serviceWorker" in navigator) { try { navigator.serviceWorker.register("sw.js").catch(function () {}); } catch (e) {} }

  VSP.initAgenda();
  VSP.initLive();
  if (VSP.initPush) VSP.initPush();

  VSP.loaded = VSP.load().then(function (d) {
    VSP.renderBanner();
    VSP.setupMatches(d.agenda, d.amistosos, d.convocatories);
    VSP.setupTrainings(d.horarisWeb, d.horaris);
    VSP.renderNotices(d.avisos);
    VSP.renderActivities(d.activitats);
    VSP.renderResults(d.resultats);
    VSP.renderTrainings();
    VSP.renderTeams();
    VSP.renderAgendaTab();
    VSP.renderToday();
    VSP.renderFriendlies();
    VSP.renderOrders();
    $("tips-link").hidden = !VSP.featureOn("consells");
    $("propose-link").hidden = !VSP.featureOn("fotos");
    if (VSP.offline) VSP.toast(VSP.t("main.offline"));
    return d;
  }).catch(function (e) { if (window.console) console.error(e); });
  VSP.route();

  // memberships: approved teams → team-only notices and full call-ups; then the status chips
  VSP.loaded.then(function () {
    VSP.member.loadPrivate();
    if (VSP.member.requested().length) VSP.member.check().then(function () { VSP.member.loadPrivate(); }, function () {});
    VSP.carpoolCleanup();
  });
  VSP.on("member", function () { VSP.renderTeams(); });

  // latest Android app version
  function code(tag) { var m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag); return m ? (+m[1]) * 10000 + (+m[2]) * 100 + (+m[3]) : -1; }
  if (!ios) VSP.getJson("https://api.github.com/repos/dpericas/voleimanagerV/tags?per_page=100").then(function (tags) {
    var best = tags.map(function (t) { return t.name; }).filter(function (n) { return code(n) >= 0; })
      .sort(function (a, b) { return code(b) - code(a); })[0];
    if (best) $("ver").textContent = VSP.t("main.version", best.replace(/^v/, ""));
  }).catch(function () {});
})();
