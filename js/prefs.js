/* ⚙️ Preferències (#preferencies): language, theme, ★ teams, avisos (web push box of js/push.js),
 * the tab shown when the web opens, Agenda default, bigger text, this browser's privacy (forget
 * saved data / disconnect) and "Quant a" (web version, update now, links). Everything is kept in
 * this browser (localStorage); nothing here is sent anywhere except leaving teams and turning
 * avisos off. */
(function () {
  "use strict";
  var VSP = window.VSP, $ = VSP.$, esc = VSP.esc;

  /** Remembered to fill forms again (names, phone) and small UI state: "Esborra les dades desades". */
  VSP.SAVED_DATA_KEYS = ["cp_name", "cp_phone", "tip_name", "ord_name", "pp_name", "rc_closed", "ios-install-closed", "teams", "tab", "ag_mine", "welcomed", "who"];
  /** This browser's identity: "Desconnecta" (after leaving the teams). mem_* keys go too. */
  VSP.SESSION_KEYS = ["fb_uid", "fb_refresh", "cache_data", "cp_mine"];

  function chip(on, attrs, label) {
    return '<button type="button" class="chip' + (on ? " on" : "") + '" aria-pressed="' + on + '" ' + attrs + ">" + label + "</button>";
  }
  function sw(id, on, label) {
    return '<label class="sw" for="' + id + '"><span>' + esc(label) + '</span><input type="checkbox" class="switch" role="switch" id="' + id + '"' + (on ? " checked" : "") + "></label>";
  }
  function langChips() {
    // each language in its own name (and lang attribute), whatever the page language is
    return [["ca", "Català"], ["es", "Castellano"], ["en", "English"]].map(function (o) {
      return chip(VSP.lang === o[0], 'data-lang="' + o[0] + '" lang="' + o[0] + '"', esc(o[1]));
    }).join("");
  }
  function themeChips() {
    var cur = VSP.themeMode ? VSP.themeMode() : "auto";
    return [["auto", "pf.theme_auto"], ["light", "pf.theme_light"], ["dark", "pf.theme_dark"]].map(function (o) {
      return chip(cur === o[0], 'data-theme-mode="' + o[0] + '"', esc(VSP.t(o[1])));
    }).join("");
  }
  function teamChips() {
    return VSP.TEAMS.map(function (t) {
      var on = VSP.isFav(t.id);
      return chip(on, 'data-fav="' + t.id + '"', (on ? "★ " : "☆ ") + esc(t.name));
    }).join("");
  }
  function startChips() {
    var cur = VSP.store("start_tab") === "inici" ? "inici" : "last";
    return [["inici", "pf.start_home"], ["last", "pf.start_last"]].map(function (o) {
      return chip(cur === o[0], 'data-start="' + o[0] + '"', esc(VSP.t(o[1])));
    }).join("");
  }
  function bindThemes(root) { VSP.each("[data-theme-mode]", function (b) { b.onclick = function () { VSP.setTheme(b.getAttribute("data-theme-mode")); }; }, root); }
  function bindFavs(root) { VSP.each("[data-fav]", function (b) { b.onclick = function () { var id = Number(b.getAttribute("data-fav")); VSP.setFav(id, !VSP.isFav(id)); }; }, root); }

  /** Removes the keys of [list] and every mem_* key when [withMem]. Works on any Storage: tested. */
  VSP.forgetKeys = function (storage, list, withMem) {
    var all = [];
    for (var i = 0; i < storage.length; i++) all.push(storage.key(i));
    all.forEach(function (k) { if (list.indexOf(k) >= 0 || (withMem && /^mem_/.test(k))) storage.removeItem(k); });
  };

  /** Turns the avisos off, leaves every team and forgets this browser's anonymous session. */
  VSP.disconnectBrowser = function () {
    var M = VSP.member, uid = VSP.uid();
    var push = VSP.pushDisable ? VSP.pushDisable() : Promise.resolve();
    return push.then(function () {
      return M.requested().reduce(function (p, t) { return p.then(function () { return M.leave(t); }); }, Promise.resolve());
    }).then(function () {
      // the pointer that lets an approved member read the squads (member.js ensurePointer)
      if (uid && VSP.store("mem_soci")) return VSP.fs.del("socis/" + uid).catch(function () {});
    }).then(function () {
      try { VSP.forgetKeys(localStorage, VSP.SESSION_KEYS, true); } catch (e) {}
    });
  };

  /** Links of the "Quant a" section. */
  function linkRow(href, title, sub) {
    return '<a class="linkrow" href="' + esc(VSP.langHref ? VSP.langHref(href) : href) + '"><span><b>' + esc(title) + '</b><span class="meta">' + esc(sub) +
      '</span></span><span aria-hidden="true">›</span></a>';
  }

  VSP.pages.preferencies = { tab: "club", render: function (arg, el, title) {
    title(VSP.t("pf.title"));
    var confirmFor = null, busy = false, err = "";
    function draw() {
      var pushOk = !!VSP.renderPush, T = VSP.t;
      var teams = VSP.member.requested().map(VSP.teamName).join(", ");
      el.innerHTML =
        // 🔗 the person's other devices, also from here (not only Club)
        '<section><a class="linkrow" href="#dispositius" data-href="#dispositius"><span><b>' + esc(T("idx.c_devices")) + '</b><span class="meta">' +
        esc(T("idx.c_devices_sub")) + '</span></span><span aria-hidden="true">›</span></a></section>' +
        "<section><h2>🌐 " + esc(T("pf.lang")) + '</h2><div class="chips" role="group" aria-label="' + esc(T("pf.lang")) + '" id="pf-lang">' + langChips() + "</div>" +
        '<p class="muted">' + esc(T("pf.lang_note")) + "</p></section>" +

        "<section><h2>🎨 " + esc(T("pf.theme")) + '</h2><div class="chips" role="group" aria-label="' + esc(T("pf.theme")) + '" id="pf-theme">' + themeChips() + "</div>" +
        '<p class="muted">' + esc(T("pf.theme_note")) + "</p></section>" +

        "<section><h2>⭐ " + esc(T("pf.teams")) + '</h2><p class="muted">' + esc(T("pf.teams_note")) + "</p>" +
        '<div class="chips" role="group" aria-label="' + esc(T("pf.teams")) + '" id="pf-teams">' + teamChips() + "</div></section>" +

        (pushOk ? "<section><h2>🔔 " + esc(T("pf.push")) + '</h2><div id="push-box"><p class="muted">' + esc(T("common.loading")) + "</p></div></section>" : "") +

        "<section><h2>🏠 " + esc(T("pf.start")) + '</h2><div class="chips" role="group" aria-label="' + esc(T("pf.start")) + '" id="pf-start">' + startChips() + "</div></section>" +

        "<section><h2>📅 " + esc(T("pf.agenda")) + "</h2>" + sw("pf-agmine", VSP.store("ag_mine_default") === "1", T("pf.agenda_mine")) +
        '<p class="muted">' + esc(T("pf.agenda_note")) + "</p></section>" +

        "<section><h2>📢 " + esc(T("pf.notices")) + "</h2>" + sw("pf-urgent", VSP.store("notices_urgent") !== "0", T("pf.notices_urgent")) +
        '<p class="muted">' + esc(T("pf.notices_note")) + "</p></section>" +

        "<section><h2>🔠 " + esc(T("pf.text")) + "</h2>" + sw("pf-text", VSP.store("text_size") === "large", T("pf.text_sw")) + "</section>" +

        "<section><h2>🧹 " + esc(T("pf.privacy")) + "</h2>" +
        '<p class="muted">' + esc(T("pf.forget_note")) + "</p>" +
        '<div class="row"><button type="button" class="btn ghost small" id="pf-forget"' + (busy ? " disabled" : "") + ">🧹 " + esc(T("pf.forget")) + "</button></div>" +
        (confirmFor === "forget" ? '<div class="confirm" role="alertdialog" aria-label="' + esc(T("pf.forget")) + '"><p>' + esc(T("pf.forget_q")) + "</p>" +
          '<div class="row"><button type="button" class="btn danger small" id="pf-forget-yes">' + esc(T("pf.forget_yes")) + '</button><button type="button" class="btn ghost small" id="pf-cancel">' + esc(T("common.cancel")) + "</button></div></div>" : "") +
        '<p class="muted" style="margin-top:14px">' + esc(T("pf.disc_note")) + "</p>" +
        '<div class="row"><button type="button" class="btn ghost small" id="pf-disc"' + (busy ? " disabled" : "") + ">🔌 " + esc(T("pf.disc")) + "</button></div>" +
        (confirmFor === "disc" ? '<div class="confirm" role="alertdialog" aria-label="' + esc(T("pf.disc")) + '"><p>' + esc(T("pf.disc_will")) + "</p><ul>" +
          "<li>" + esc(T("pf.disc_1", teams || T("pf.disc_none"))) + "</li><li>" + esc(T("pf.disc_2")) + "</li><li>" + esc(T("pf.disc_3")) + "</li></ul>" +
          "<p>" + esc(T("pf.disc_keep")) + "</p>" +
          '<div class="row"><button type="button" class="btn danger small" id="pf-disc-yes"' + (busy ? " disabled" : "") + ">" + esc(T("pf.disc_yes")) + '</button><button type="button" class="btn ghost small" id="pf-cancel">' + esc(T("common.cancel")) + "</button></div></div>" : "") +
        '<div class="err" role="alert" id="pf-err">' + esc(err) + "</div></section>" +

        "<section><h2>ℹ️ " + esc(T("pf.about")) + "</h2><p>" + esc(T("pf.version")) + " <b>" + esc(VSP.WEB_VERSION) + "</b></p>" +
        '<div class="row"><button type="button" class="btn ghost small" id="pf-update">🔄 ' + esc(T("pf.update")) + "</button></div>" +
        '<p class="muted">' + esc(T("pf.update_note")) + "</p>" +
        (VSP.isIOS ? "" : linkRow("app/", T("pf.app"), T("pf.app_sub"))) +
        linkRow("manual/", T("pf.manual"), T("pf.manual_sub")) +
        linkRow("#benvinguda", T("wel.again"), T("wel.again_sub")) +
        linkRow("privacitat/", T("pf.privacy_page"), T("pf.privacy_page_sub")) + "</section>";
      bind();
      if (pushOk) VSP.renderPush($("push-box"));
    }
    function bind() {
      VSP.each("[data-lang]", function (b) { b.onclick = function () { if (VSP.setLang) VSP.setLang(b.getAttribute("data-lang")); }; }, el);
      bindThemes(el); bindFavs(el);
      VSP.each("[data-start]", function (b) {
        b.onclick = function () {
          VSP.store("start_tab", b.getAttribute("data-start") === "inici" ? "inici" : null);
          $("pf-start").innerHTML = startChips(); bind();
        };
      }, el);
      $("pf-agmine").onchange = function () { if (VSP.setAgendaMineDefault) VSP.setAgendaMineDefault(this.checked); else VSP.store("ag_mine_default", this.checked ? "1" : null); };
      $("pf-urgent").onchange = function () { VSP.store("notices_urgent", this.checked ? null : "0"); if (VSP.renderNotices) VSP.renderNotices(); };
      $("pf-text").onchange = function () {
        VSP.store("text_size", this.checked ? "large" : null);
        if (this.checked) document.documentElement.setAttribute("data-text", "large"); else document.documentElement.removeAttribute("data-text");
      };
      $("pf-forget").onclick = function () { confirmFor = confirmFor === "forget" ? null : "forget"; err = ""; draw(); };
      $("pf-disc").onclick = function () { confirmFor = confirmFor === "disc" ? null : "disc"; err = ""; draw(); };
      if ($("pf-cancel")) $("pf-cancel").onclick = function () { confirmFor = null; draw(); };
      if ($("pf-forget-yes")) $("pf-forget-yes").onclick = function () {
        try { VSP.forgetKeys(localStorage, VSP.SAVED_DATA_KEYS, false); } catch (e) {}
        try { sessionStorage.clear(); } catch (e) {}
        confirmFor = null; draw(); VSP.toast(VSP.t("pf.forget_done"));
      };
      if ($("pf-disc-yes")) $("pf-disc-yes").onclick = function () {
        if (busy) return; busy = true; err = ""; draw();
        VSP.disconnectBrowser().then(function () { VSP.reload(); }, function (e) {
          busy = false; err = VSP.t("pf.disc_err", VSP.errText(e)); draw();
        });
      };
      $("pf-update").onclick = function () {
        this.disabled = true;
        var clear = window.caches ? caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }) : Promise.resolve();
        // never stuck: reload anyway after 3 s (the network-first service worker fetches the new files)
        var late = new Promise(function (ok) { setTimeout(ok, 3000); });
        Promise.race([clear.catch(function () {}), late]).then(function () { VSP.reload(); });
      };
    }
    draw();
  } };
  /** Reloads the page (a function of its own so the tests can watch it). */
  VSP.reload = function () { location.reload(); };

  // keep the open page in step with the ★ stars and the 🌙/☀️ button
  VSP.on("favs", function () { var b = $("pf-teams"); if (b) { b.innerHTML = teamChips(); bindFavs(b); } });
  VSP.on("theme", function () { var b = $("pf-theme"); if (b) { b.innerHTML = themeChips(); bindThemes(b); } });
})();
