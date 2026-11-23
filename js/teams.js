/* Equips: every club team with ★ favourites first; team page with next matches, results,
 * training times, official federation page and (non-federated teams) the squad names. */
(function () {
  "use strict";
  var VSP = window.VSP, $ = VSP.$, esc = VSP.esc;

  /** Squad of a team: plantilles/{team} (edited in the app) or the club's bundled list. Names and numbers only. */
  VSP.squad = function (id) {
    var t = VSP.team(id); if (!t) return [];
    if (!t.fed) {
      var doc = (VSP.data.plantilles || []).filter(function (d) { return Number(d.id) === t.id; })[0];
      if (doc && Array.isArray(doc.membres)) {
        return doc.membres.map(function (m) {
          return { nom: String(m.nom || "").trim().slice(0, 50), rol: String(m.rol || "").trim().slice(0, 40), dorsal: String(m.dorsal || "").replace(/\D/g, "").slice(0, 3) };
        }).filter(function (m) { return m.nom; });
      }
    }
    return t.squad || [];
  };
  VSP.isStaff = function (m) { return /ntrenador/i.test(m.rol || "") && !m.dorsal; };
  /**
   * Names as written in the call-ups ("Laia G."): the squad's players (non-federated teams) plus
   * everybody already called in a published call-up of the team (federated squads are not public).
   */
  VSP.roster = function (id) {
    var out = [];
    function add(n) { n = String(n || "").trim(); if (n && !out.some(function (x) { return VSP.sameName(x, n); })) out.push(n); }
    VSP.squad(id).filter(function (m) { return !VSP.isStaff(m); }).forEach(function (m) { add(VSP.shortPerson(m.nom)); });
    Object.keys(VSP.convocations).forEach(function (k) { var c = VSP.convocations[k]; if (c.team === Number(id)) c.players.forEach(add); });
    return out;
  };

  function nextOf(id) {
    return VSP.sortMatches(VSP.matches.filter(function (m) { return m.team === id && VSP.upcoming(m); }));
  }
  function star(id) {
    var on = VSP.isFav(id);
    return '<button class="star' + (on ? " on" : "") + '" data-star="' + id + '" aria-pressed="' + on + '" aria-label="' +
      esc(VSP.t(on ? "teams.fav_off" : "teams.fav_on", VSP.teamName(id))) + '">' + (on ? "★" : "☆") + "</button>";
  }
  function bindStars(root) {
    VSP.each("[data-star]", function (b) {
      b.onclick = function (ev) { ev.preventDefault(); ev.stopPropagation(); var id = Number(b.getAttribute("data-star")); VSP.setFav(id, !VSP.isFav(id)); };
    }, root);
  }

  VSP.renderTeams = function () {
    var favs = VSP.favs();
    var order = VSP.TEAMS.slice().sort(function (a, b) {
      var fa = favs.indexOf(a.id) >= 0 ? 0 : 1, fb = favs.indexOf(b.id) >= 0 ? 0 : 1;
      return (fa - fb) || (VSP.TEAM_ORDER.indexOf(a.id) - VSP.TEAM_ORDER.indexOf(b.id));
    });
    var member = VSP.memberStatus ? VSP.memberStatus() : {};
    $("teams").innerHTML = order.map(function (t) {
      var n = nextOf(t.id)[0];
      var st = member[t.id];
      return '<a class="teamcard" href="#equip/' + t.id + '" data-href="#equip/' + t.id + '">' +
        '<span class="tc-main"><b>' + esc(t.name) + "</b>" +
        '<span class="meta">' + esc(VSP.teamSub(t)) + (st ? " · " + esc(st) : "") + "</span>" +
        (n ? '<span class="meta next">' + esc(VSP.t("teams.next", VSP.fmtDate(n.date) + (n.time ? " · " + n.time : ""), VSP.t(n.homeIsClub ? "teams.vs" : "teams.at", VSP.pretty(VSP.rival(n))))) + "</span>" : "") +
        "</span>" + star(t.id) + "</a>";
    }).join("");
    $("teams-hint").hidden = favs.length > 0;
    bindStars($("teams"));
  };
  VSP.on("favs", function () { if (VSP.data.agenda) VSP.renderTeams(); });

  VSP.pages.equip = { tab: "equips", render: function (arg, el, title) {
    var t = VSP.team(arg);
    if (!t) { title(VSP.t("teams.team")); el.innerHTML = '<div class="empty">' + esc(VSP.t("teams.missing")) + "</div>"; return; }
    title(t.name);
    var next = nextOf(t.id).slice(0, 6);
    var played = VSP.sortMatches(VSP.matches.filter(function (m) { return m.team === t.id && m.played; }), true).slice(0, 12);
    var ses = VSP.trainings[t.id] || [];
    var st = VSP.memberStatus ? VSP.memberStatus()[t.id] : null;
    function draw() {
      var squad = t.fed ? [] : VSP.squad(t.id);
      var players = squad.filter(function (m) { return !VSP.isStaff(m); }), staff = squad.filter(VSP.isStaff);
      var numbers = players.some(function (m) { return m.dorsal; });
      var locked = !squad.length && !VSP.member.approved().length && t.id !== -3;
      el.innerHTML =
        '<section class="team-head"><div><div class="meta">' + esc(VSP.teamSub(t)) + "</div>" +
        (st ? '<div class="meta">👤 ' + esc(st) + "</div>" : "") + "</div>" + star(t.id) + "</section>" +
        "<section><h2>" + esc(VSP.t("teams.next_matches")) + "</h2>" + (next.length ? next.map(function (m) {
          return '<div class="day-head">' + esc(VSP.fmtDate(m.date)) + "</div>" + VSP.matchRow(m);
        }).join("") : '<div class="empty">' + esc(VSP.t("teams.no_next")) + "</div>") + "</section>" +
        (played.length ? "<section><h2>🏆 " + esc(VSP.t("common.results")) + "</h2>" + played.map(function (m) {
          return '<div class="day-head">' + esc(VSP.fmtDate(m.date)) + "</div>" + VSP.matchRow(m);
        }).join("") + "</section>" : "") +
        "<section><h2>" + esc(VSP.t("teams.trainings")) + "</h2>" + (ses.length ? VSP.trainingTable(ses) : '<div class="empty">' + esc(VSP.t("common.no_trainings")) + "</div>") + "</section>" +
        (t.fed ? "<section><h2>" + esc(VSP.t("teams.official")) + '</h2><p class="muted">' + esc(VSP.t("teams.official_text")) + "</p>" +
          '<a class="btn ghost" href="' + esc(VSP.teamUrl(t.id)) + '" target="_blank" rel="noopener">' + esc(VSP.t("teams.official_btn")) + "</a></section>" : "") +
        (!t.fed ? "<section><h2>" + esc(VSP.t("teams.squad")) + "</h2>" + (squad.length ?
          (staff.length ? '<div class="meta">' + staff.map(function (m) { return esc(m.nom) + " (" + esc(m.rol) + ")"; }).join(" · ") + "</div>" : "") +
          '<ul class="squad">' + players.map(function (m) {
            return "<li>" + (numbers ? '<span class="num">' + esc(m.dorsal || "") + "</span>" : "") + esc(m.nom) + (m.rol && !/^jugador/i.test(m.rol) ? ' <span class="meta">' + esc(m.rol) + "</span>" : "") + "</li>";
          }).join("") + "</ul>" : locked ? '<div class="empty">' + esc(VSP.t("teams.squad_locked")) + "</div>"
            : '<div class="empty">' + esc(VSP.t("teams.no_squad")) + "</div>") + "</section>" : "") +
        "<section><h2>" + esc(VSP.t("teams.yours")) + '</h2><p class="muted">' + esc(VSP.t("teams.yours_text")) + "</p>" +
        '<a class="btn ghost" href="#meu-equip" data-href="#meu-equip">👤 ' + esc(VSP.t("member.title")) + "</a></section>";
      bindStars(el);
    }
    draw();
    var redraw = function () { if (location.hash === "#equip/" + arg) draw(); };
    VSP.on("favs", redraw);
    VSP.on("squads", redraw);
  } };
})();
