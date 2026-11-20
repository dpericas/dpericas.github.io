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
  var VSP = window.VSP, $ = function (id) { return document.getElementById(id); };
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

  function current() {
    if (VSP.pushSupport() !== "ok") return Promise.resolve(null);
    return registration().then(function (r) { return r.pushManager.getSubscription(); });
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

  function render() {
    var box = $("push-box"); if (!box) return;
    var sup = VSP.pushSupport(), p = prefs();
    if (sup === "no") { box.innerHTML = '<p class="muted">Aquest navegador no pot rebre avisos. Al mòbil Android, fes servir l\'app del club.</p>'; return; }
    if (sup === "ios-install") {
      box.innerHTML = '<p>Per rebre els avisos a l\'iPhone (iOS 16.4 o posterior):</p><ol class="muted"><li>A Safari, toca <b>Compartir</b> › <b>Afegeix a la pantalla d\'inici</b>.</li><li>Obre la web des de la icona nova.</li><li>Torna aquí i toca «Activa els avisos».</li></ol>';
      return;
    }
    current().then(function (s) {
      var on = !!s && Notification.permission === "granted";
      box.innerHTML =
        '<p class="muted">Avisos del club (els de tot el club i els dels teus equips ★) i convocatòries dels teus equips, com a l\'app. Poden arribar amb uns minuts de retard.</p>' +
        '<label class="row"><input type="checkbox" id="push-avisos"' + (p.avisos ? " checked" : "") + '> Avisos del club</label>' +
        '<label class="row"><input type="checkbox" id="push-conv"' + (p.convocatories ? " checked" : "") + '> Convocatòries dels meus equips ★</label>' +
        '<div class="row" style="margin-top:8px">' + (on
          ? '<span>✅ Activats en aquest mòbil</span><button class="btn small" type="button" id="push-off">Desactiva</button>'
          : '<button class="btn primary small" type="button" id="push-on">🔔 Activa els avisos</button>') + "</div>" +
        '<div class="err" id="push-err" role="alert"></div>';
      function setPref(k, v) { var q = prefs(); q[k] = v; VSP.storeJson("push_prefs", q); if (on) current().then(function (s2) { if (s2) save(s2); }); }
      $("push-avisos").onchange = function () { setPref("avisos", this.checked); };
      $("push-conv").onchange = function () { setPref("convocatories", this.checked); };
      if ($("push-on")) $("push-on").onclick = function () {
        this.disabled = true;
        enable().then(function () { VSP.toast("Avisos activats"); render(); }, function (e) {
          $("push-err").textContent = e && e.message === "denied"
            ? "Has de permetre les notificacions per a aquesta web (a la configuració del navegador o de l'iPhone)."
            : "No s'han pogut activar els avisos. Torna-ho a provar amb connexió.";
          render();
        });
      };
      if ($("push-off")) $("push-off").onclick = function () { disable().then(function () { VSP.toast("Avisos desactivats"); render(); }, render); };
    });
  }

  VSP.initPush = function () {
    render();
    // the ★ teams decide which team notices and call-ups arrive: keep the subscription up to date
    VSP.on("favs", function () { current().then(function (s) { if (s && Notification.permission === "granted") save(s); }); });
  };
})();
