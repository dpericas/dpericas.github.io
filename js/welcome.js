/* 👋 Benvinguda (first visit, as the app's): «Qui ets?» with several answers («Només segueixo el
 * club» goes alone) and the ★ teams, so «El teu proper partit» and the team notices work from the
 * first minute. Then: players / families → El meu equip; coaches / board → Zona d'editors. */
(function () {
  "use strict";
  var VSP = window.VSP, $ = VSP.$, esc = VSP.esc, T = function () { return VSP.t.apply(null, arguments); };

  // same profiles as the app (extras/Onboarding.kt Who): member = asks to join a team, editor = Zona d'editors
  VSP.WHO = [
    { k: "player", icon: "🏐", member: true },
    { k: "family", icon: "👨‍👩‍👧", member: true },
    { k: "coach", icon: "📋", editor: true },
    { k: "board", icon: "🏛️", editor: true },
    { k: "fan", icon: "📣" }
  ];
  function who(k) { for (var i = 0; i < VSP.WHO.length; i++) if (VSP.WHO[i].k === k) return VSP.WHO[i]; return null; }
  /** Same as Onboarding.toggle: «fan» goes alone; emptying the choice leaves «fan». Pure: tested. */
  VSP.whoToggle = function (sel, k) {
    if (k === "fan") return ["fan"];
    var out = sel.filter(function (x) { return x !== "fan"; });
    var i = out.indexOf(k);
    if (i >= 0) out.splice(i, 1); else out.push(k);
    return out.length ? out : ["fan"];
  };
  /** Where to go after the welcome: "both", "member", "editor" or "home". Pure: tested. */
  VSP.whoNext = function (sel) {
    var m = sel.some(function (k) { return who(k) && who(k).member; }), e = sel.some(function (k) { return who(k) && who(k).editor; });
    return m && e ? "both" : m ? "member" : e ? "editor" : "home";
  };
  VSP.savedWho = function () { var w = VSP.storeJson("who", undefined, null); return Array.isArray(w) && w.length ? w : null; };

  VSP.pages.benvinguda = { tab: "inici", render: function (arg, el, title) {
    title(T("wel.title"));
    var sel = VSP.savedWho() || ["fan"], favs = VSP.favs(), done = false;
    function draw() {
      if (done) return drawNext();
      el.innerHTML = '<section><p style="margin-top:0">' + esc(T("wel.intro")) + "</p>" +
        "<h2>" + esc(T("wel.who")) + "</h2>" +
        '<p class="muted">' + esc(T("wel.several")) + "</p>" +
        '<div class="whos" role="group" aria-label="' + esc(T("wel.who")) + '">' + VSP.WHO.map(function (w) {
          var on = sel.indexOf(w.k) >= 0;
          return '<button type="button" class="who' + (on ? " on" : "") + '" data-who="' + w.k + '" aria-pressed="' + on + '">' +
            '<span class="wi" aria-hidden="true">' + w.icon + "</span><span><b>" + esc(T("wel." + w.k)) + "</b>" +
            '<span class="meta">' + esc(T("wel." + w.k + "_sub")) + "</span></span>" + (on ? '<span class="tick" aria-hidden="true">✓</span>' : "") + "</button>";
        }).join("") + "</div></section>" +
        "<section><h2>" + esc(T("wel.teams")) + "</h2>" +
        '<p class="muted">' + esc(T("wel.teams_sub")) + "</p>" +
        '<div class="chips" role="group" aria-label="' + esc(T("wel.teams")) + '">' + VSP.TEAM_ORDER.map(function (id) {
          var on = favs.indexOf(id) >= 0;
          return '<button type="button" class="chip' + (on ? " on" : "") + '" data-fav="' + id + '" aria-pressed="' + on + '">' + (on ? "★ " : "☆ ") + esc(VSP.teamName(id)) + "</button>";
        }).join("") + "</div></section>" +
        '<div class="row" style="margin-top:14px"><button type="button" class="btn primary" id="wel-go">' + esc(T("wel.go")) + "</button>" +
        '<button type="button" class="btn ghost" id="wel-skip">' + esc(T("wel.skip")) + "</button></div>";
      VSP.each("[data-who]", function (b) { b.onclick = function () { sel = VSP.whoToggle(sel, b.getAttribute("data-who")); draw(); }; }, el);
      VSP.each("[data-fav]", function (b) {
        b.onclick = function () { var id = Number(b.getAttribute("data-fav")), i = favs.indexOf(id); if (i >= 0) favs.splice(i, 1); else favs.push(id); draw(); };
      }, el);
      $("wel-skip").onclick = function () { VSP.store("welcomed", "1"); location.hash = "inici"; };
      $("wel-go").onclick = finish;
    }
    function finish() {
      VSP.store("welcomed", "1");
      VSP.storeJson("who", sel);
      VSP.TEAM_ORDER.forEach(function (id) { var on = favs.indexOf(id) >= 0; if (on !== VSP.isFav(id)) VSP.setFav(id, on); });
      var next = VSP.whoNext(sel);
      if (next === "member") VSP.go("#meu-equip");
      else if (next === "editor") location.href = "editors/";
      else if (next === "home") location.hash = "inici";
      else { done = true; draw(); }
    }
    // a player or family AND a coach or board member: both doors
    function drawNext() {
      el.innerHTML = "<section><h2>" + esc(T("wel.both_h")) + '</h2><p class="muted">' + esc(T("wel.both_text")) + "</p>" +
        '<a class="linkrow" href="#meu-equip" data-href="#meu-equip"><span><b>' + esc(T("idx.c_team")) + '</b><span class="meta">' + esc(T("idx.c_team_sub")) + '</span></span><span aria-hidden="true">›</span></a>' +
        '<a class="linkrow" href="editors/"><span><b>' + esc(T("wel.editors")) + '</b><span class="meta">' + esc(T("wel.editors_sub")) + '</span></span><span aria-hidden="true">›</span></a></section>';
    }
    draw();
  } };

  /** First visit (no tab or page in the address): the welcome, once. */
  VSP.maybeWelcome = function () {
    if (VSP.store("welcomed") === "1") return;
    var h = (location.hash || "").replace(/^#/, "");
    if (h && VSP.TABS.indexOf(h) < 0) return;   // opened from a link to a page (a match, an invitation…): not now
    if (VSP.favs().length) { VSP.store("welcomed", "1"); return; }   // already using the web before the welcome existed
    VSP.go("#benvinguda");
  };
})();
