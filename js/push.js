/*
 * 🔔 Notifications on this phone / computer (web push), for people who use the web instead of the
 * Android app — mainly iPhone (iOS 16.4 or later, with the web added to the home screen).
 * The browser subscribes here and the subscription is saved in Firestore webpush/{uid} (only this
 * browser and the club's sending service can read it). A GitHub Action of this site
 * (.github/workflows/webpush.yml) checks every few minutes for new club notices and call-ups and
 * sends them. Same filters as the app: whole-club notices for everybody, team ones for ★ teams.
 */
(function () {
  "use strict";
  var VSP = window.VSP, $ = function (id) { return document.getElementById(id); }, esc = VSP.esc;
  /** Public half of the club's VAPID key pair (the private half is a secret of the sending Action). */
  VSP.VAPID_PUBLIC = "BDA4epRBfFWZmszB2zcclr5-1RqLPlAhjUqfL_iLmEo5DWTLzay4qzDukGhZqAO0I6OlzAfum3UGBpGCLpDtpEw";

  function b64ToBytes(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "=";
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function bytesToB64(buf) {
    var b = new Uint8Array(buf), s = ""; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  VSP.pushB64 = { toBytes: b64ToBytes, fromBytes: bytesToB64 };

  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  /** What this browser can do: "ok", "ios-install" (add to home screen first) or "no" (no web push). */
  VSP.pushSupport = function () {
    if (!("serviceWorker" in navigator)) return "no";
    if (!("PushManager" in window) || !("Notification" in window)) return isIOS && !standalone ? "ios-install" : "no";
    if (isIOS && !standalone) return "ios-install";
    return "ok";
  };

  function prefs() { return VSP.storeJson("push_prefs", undefined, { avisos: true, convocatories: true }); }
  /** Switches changed on a linked device (js/member.js): kept here and sent with this browser's subscription. */
  VSP.applyPushPrefs = function (a) {
    var q = prefs();
    Object.keys(a || {}).forEach(function (k) { if (k === "avisos" || k === "convocatories") q[k] = !!a[k]; });
    VSP.storeJson("push_prefs", q);
    current().then(function (s) { if (s) save(s); }).catch(function () {});
  };
  function registration() { return navigator.serviceWorker.ready; }

  /** The Firestore document of this browser's subscription. Pure: tested. */
  VSP.pushDoc = function (uid, sub, favs, p) {
    var j = sub.toJSON ? sub.toJSON() : sub;
    return { owner: uid, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, equips: favs.slice(0, 20),
      avisos: !!p.avisos, convocatories: !!p.convocatories, created: new Date().toISOString() };
  };

  function save(sub) {
    return VSP.token().then(function () {
      return VSP.fs.set("webpush/" + VSP.uid(), VSP.pushDoc(VSP.uid(), sub, VSP.favs(), prefs()));
    });
  }

  /** This browser's subscription, or null (also when the service worker is not registered: no waiting for it). */
  VSP.pushCurrent = function () { return current(); };
  /** Asks for permission and subscribes this browser (must run from a tap: the welcome's «Comença»). */
  VSP.pushEnable = function () { return enable(); };
  function current() {
    if (VSP.pushSupport() !== "ok") return Promise.resolve(null);
    return navigator.serviceWorker.getRegistration().then(function (r) { return r ? r.pushManager.getSubscription() : null; });
  }

  function enable() {
    return Notification.requestPermission().then(function (perm) {
      if (perm !== "granted") throw new Error("denied");
      return registration();
    }).then(function (r) {
      return r.pushManager.getSubscription().then(function (s) {
        return s || r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VSP.VAPID_PUBLIC) });
      });
    }).then(save);
  }

  function disable() {
    return current().then(function (s) {
      var gone = s ? s.unsubscribe() : Promise.resolve();
      return gone.then(function () { return VSP.token(); }).then(function () { return VSP.fs.del("webpush/" + VSP.uid()); });
    });
  }

  /** Turns the avisos off in this browser, if they are on (⚙️ Preferències › Desconnecta). */
  VSP.pushDisable = function () {
    return current().then(function (s) { return s ? disable() : null; });
  };

  /** The 🔔 box (⚙️ Preferències): draws into [box] (default #push-box); does nothing without it. */
  function render(box) {
    box = box || $("push-box"); if (!box || !box.isConnected) return Promise.resolve();
    var again = function () { return render(box); };
    var sup = VSP.pushSupport(), p = prefs();
    if (sup === "no") { box.innerHTML = '<p class="muted">' + esc(VSP.t("push.no")) + "</p>"; return Promise.resolve(); }
    if (sup === "ios-install") {
      box.innerHTML = "<p>" + esc(VSP.t("push.ios_title")) + '</p><ol class="muted"><li>' + VSP.t("push.ios_1") + "</li><li>" + esc(VSP.t("push.ios_2")) + "</li><li>" + esc(VSP.t("push.ios_3")) + "</li></ol>";
      return Promise.resolve();
    }
    return current().then(function (s) {
      if (!box.isConnected) return;
      var on = !!s && Notification.permission === "granted";
      box.innerHTML =
        '<p class="muted">' + esc(VSP.t("push.intro")) + "</p>" +
        '<label class="row"><input type="checkbox" id="push-avisos"' + (p.avisos ? " checked" : "") + "> " + esc(VSP.t("push.notices")) + "</label>" +
        '<label class="row"><input type="checkbox" id="push-conv"' + (p.convocatories ? " checked" : "") + "> " + esc(VSP.t("push.callups")) + "</label>" +
        '<div class="row" style="margin-top:8px">' + (on
          ? "<span>" + esc(VSP.t("push.on_here")) + '</span><button class="btn small" type="button" id="push-off">' + esc(VSP.t("push.disable")) + "</button>"
          : '<button class="btn primary small" type="button" id="push-on">🔔 ' + esc(VSP.t("push.enable")) + "</button>") + "</div>" +
        '<div class="err" id="push-err" role="alert"></div>';
      function setPref(k, v) {
        var q = prefs(); q[k] = v; VSP.storeJson("push_prefs", q);
        VSP.store("alerts_at", String(Date.now())); VSP.emit("alerts");   // the linked devices follow it
        if (on) current().then(function (s2) { if (s2) save(s2); });
      }
      var q = function (sel) { return box.querySelector(sel); };
      q("#push-avisos").onchange = function () { setPref("avisos", this.checked); };
      q("#push-conv").onchange = function () { setPref("convocatories", this.checked); };
      if (q("#push-on")) q("#push-on").onclick = function () {
        this.disabled = true;
        enable().then(function () { VSP.toast(VSP.t("push.toast_on")); again(); paintState(); }, function (e) {
          var msg = VSP.t(e && e.message === "denied" ? "push.denied" : "push.failed");
          again().then(function () { var err = box.querySelector("#push-err"); if (err) err.textContent = msg; });
        });
      };
      if (q("#push-off")) q("#push-off").onclick = function () { disable().then(function () { VSP.toast(VSP.t("push.toast_off")); again(); paintState(); }, again); };
    });
  }

  VSP.renderPush = render;
  /** Club tab row: whether the avisos are on here (the box itself is in ⚙️ Preferències). */
  function paintState() {
    var el = $("push-state"); if (!el) return;
    // iPhone in Safari: avisos only once the web is on the home screen; say so here, with the steps
    if (VSP.pushSupport() === "ios-install") {
      el.textContent = VSP.t("push.row_ios");
      if (!$("push-ios-steps")) {
        var d = document.createElement("div"); d.id = "push-ios-steps"; d.className = "muted";
        d.innerHTML = '<ol style="margin:4px 0 0;padding-left:20px"><li>' + VSP.t("push.ios_1") + "</li><li>" + esc(VSP.t("push.ios_2")) + "</li><li>" + esc(VSP.t("push.ios_3")) + "</li></ol>";
        $("push-sec").appendChild(d);
      }
      return;
    }
    el.textContent = el.textContent || VSP.t("push.row_off");
    current().then(function (s) {
      el.textContent = VSP.t(s && Notification.permission === "granted" ? "push.row_on" : "push.row_off");
    }).catch(function () {});
  }
  VSP.initPush = function () {
    paintState();
    // the ★ teams decide which team notices and call-ups arrive: keep the subscription up to date
    VSP.on("favs", function () { current().then(function (s) { if (s && Notification.permission === "granted") save(s); }); });
  };
})();
