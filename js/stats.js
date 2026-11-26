/* 📊 Anonymous usage statistics of the club web (like the app's stats/UsageStats.kt), ONLY if this
 * browser says yes (welcome, the one-time question on Inici or ⚙️ Preferències › Privacitat):
 * at most once a day it writes installs/{anonymous id} with the web version, the ★ teams, whether the
 * avisos are on, iPhone or not, whether it is on the home screen and the last day each section was
 * used (core.js VSP.statsTouch). No name, e-mail, phone or what was looked at. Only the board reads it.
 */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); }, esc = VSP.esc;

  /** "1" yes, "0" no, null not asked yet. */
  VSP.statsOn = function () { return VSP.store("stats") === "1"; };

  /** The record (pure: tested). */
  VSP.statsRecord = function (o) {
    var limit = VSP.addDays(o.today, -60);
    var sec = {};
    VSP.STATS_SECTIONS.forEach(function (k) {
      var d = o.sec && o.sec[k];
      if (/^\d{4}-\d{2}-\d{2}$/.test(d || "") && d >= limit && d <= o.today) sec[k] = d;
    });
    // 🎮 games of the last 7 days (jocs/js/progress.js counts them per day)
    var jp = 0, week = VSP.addDays(o.today, -6);
    Object.keys(o.games || {}).forEach(function (d) { if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d >= week && d <= o.today) jp += Math.max(0, Number(o.games[d]) || 0); });
    return { v: String(o.version || "web").slice(0, 20), first: o.first || o.today, last: o.today,
      favs: (o.favs || []).slice(0, 20), notif: !!o.notif, pl: o.ios ? "iphone" : "web", pwa: !!o.standalone, sec: sec,
      jp: Math.min(1000, jp), cals: (o.cals || []).map(Number).filter(function (x) { return x; }).slice(0, 20) };
  };
  /** 📅 A team calendar subscribed here (8.7). */
  VSP.statsCal = function (id) {
    if (!VSP.statsOn() || !id) return;
    var l = VSP.storeJson("stats_cals", undefined, []) || [];
    if (l.indexOf(id) < 0) { l.push(id); VSP.storeJson("stats_cals", l.slice(-20)); VSP.store("stats_last", null); }
  };

  function standalone() { return window.navigator.standalone === true || (window.matchMedia && matchMedia("(display-mode: standalone)").matches); }
  function ios() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }

  /** Once a day at most; errors ignored (rules from before 01.53 refuse the web's record: then nothing is sent). */
  VSP.statsPing = function (force) {
    if (!VSP.statsOn() || !VSP.FIREBASE_KEY) return Promise.resolve();
    var today = VSP.isoDay(new Date());
    if (!force && VSP.store("stats_last") === today) return Promise.resolve();
    var sec = {}; try { sec = JSON.parse(VSP.store("stats_sec") || "{}") || {}; } catch (e) { sec = {}; }
    var games = {}; try { games = JSON.parse(VSP.store("stats_games") || "{}") || {}; } catch (e) { games = {}; }
    var first = VSP.store("stats_first") || today;
    var push = VSP.pushCurrent ? VSP.pushCurrent().then(function (s) { return !!s; }, function () { return false; }) : Promise.resolve(false);
    return push.then(function (notif) {
      return VSP.token().then(function () {
        var uid = VSP.uid(); if (!uid) return;
        var rec = VSP.statsRecord({ today: today, first: first, version: VSP.WEB_VERSION, favs: VSP.favs(), notif: notif, ios: ios(), standalone: standalone(), sec: sec,
          games: games, cals: VSP.storeJson("stats_cals", undefined, []) });
        function done() { VSP.store("stats_last", today); VSP.store("stats_first", first); }
        // rules of 01.53 without the 01.54 keys: then the record without them
        return VSP.fs.set("installs/" + uid, rec).then(done, function () {
          delete rec.jp; delete rec.cals;
          return VSP.fs.set("installs/" + uid, rec).then(done);
        });
      });
    }).catch(function () {});
  };

  /** Yes / no, from any of the three places. No = this browser's record is deleted. */
  VSP.statsAnswer = function (yes) {
    VSP.store("stats", yes ? "1" : "0");
    if (yes) { VSP.statsTouch(VSP.currentTab || "inici"); return VSP.statsPing(true); }
    VSP.store("stats_sec", null); VSP.store("stats_last", null); VSP.store("stats_games", null); VSP.store("stats_cals", null);
    var uid = VSP.uid();
    return uid ? VSP.fs.del("installs/" + uid).catch(function () {}) : Promise.resolve();
  };

  /** One-time question on Inici (browsers that were already here before the question existed). */
  VSP.renderStatsAsk = function () {
    var box = $("stats-ask"); if (!box) return;
    box.hidden = VSP.store("stats") !== null || VSP.store("welcomed") !== "1";
    if (box.hidden) return;
    box.innerHTML = "<h2>" + esc(VSP.t("st.ask_title")) + '</h2><p class="muted">' + esc(VSP.t("st.ask_text")) + "</p>" +
      '<div class="row"><button type="button" class="btn primary small" id="stats-yes">' + esc(VSP.t("st.yes")) + "</button>" +
      '<button type="button" class="btn ghost small" id="stats-no">' + esc(VSP.t("st.no")) + "</button></div>" +
      '<p class="muted" style="margin:8px 0 0">' + esc(VSP.t("st.later")) + "</p>";
    $("stats-yes").onclick = function () { VSP.statsAnswer(true); box.hidden = true; VSP.toast(VSP.t("st.thanks")); };
    $("stats-no").onclick = function () { VSP.statsAnswer(false); box.hidden = true; };
  };
})();
