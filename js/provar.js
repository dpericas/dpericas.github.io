/* «Vull provar el vòlei» (provar/index.html): anybody asks the board for a trial training.
 * Creates provatures/{autoId} with this browser's anonymous Firebase session; nobody but the board
 * (junta / admin) can read it back. Same fields and limits as the app (community/TryVolleyball.kt)
 * and docs/firestore.rules. Loaded in <head> after core.js (no inline scripts: strict CSP). */
(function () {
  "use strict";
  var VSP = window.VSP;
  // theme and text size chosen on the main page (before the first paint)
  var saved = VSP.store("theme"); if (saved) document.documentElement.setAttribute("data-theme", saved);
  if (VSP.store("text_size") === "large") document.documentElement.setAttribute("data-text", "large");

  var MIN_YEAR = 1950, DAYS = ["dl", "dt", "dc", "dj", "dv"], EXP = ["no", "poc", "si"];

  function cleanPhone(s) { return String(s || "").replace(/[^0-9+ ]/g, "").slice(0, 20); }
  function phoneValid(p) {
    p = String(p || "").trim();
    if (!p || p.length > 20 || !/^[0-9+ ]+$/.test(p) || p.lastIndexOf("+") > 0) return false;
    var digits = p.replace(/\D/g, "").length;
    return digits >= 6 && digits <= 15;
  }
  function emailValid(e) { e = String(e || "").trim(); return e.length <= 80 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); }
  /** Under 18 the whole of this year: a guardian must send it (TryLogic.mustBeGuardian). */
  function mustBeGuardian(y, now) { return now - y < 18; }
  function mayBeMinor(y, now) { return now - y <= 18; }

  /** The form -> {data} or {err} (TryLogic.validate, same order). */
  function read(f, now) {
    var $ = VSP.$;
    var nom = $("t-nom").value.trim(), any = parseInt($("t-any").value, 10);
    var rol = (f.querySelector("input[name=t-rol]:checked") || {}).value || "jugador";
    var contacte = $("t-contacte").value.trim() || (rol === "jugador" ? nom : "");
    var tel = $("t-tel").value.trim().replace(/\s+/g, " "), email = $("t-email").value.trim().toLowerCase();
    var com = $("t-com").value.trim();
    var dies = DAYS.filter(function (d) { var c = f.querySelector("input[name=t-dia][value=" + d + "]"); return c && c.checked; });
    var exp = (f.querySelector("input[name=t-exp]:checked") || {}).value;
    if (EXP.indexOf(exp) < 0) exp = "no";
    if (nom.length < 2 || nom.length > 60) return { err: VSP.t("try.err_name"), el: "t-nom" };
    if (!(any >= MIN_YEAR && any <= now)) return { err: VSP.t("try.err_year"), el: "t-any" };
    if (rol === "jugador" && mustBeGuardian(any, now)) return { err: VSP.t("try.err_minor") };
    if (contacte.length < 2 || contacte.length > 60) return { err: VSP.t("try.err_contact"), el: "t-contacte" };
    if (!tel && !email) return { err: VSP.t("try.err_reach"), el: "t-tel" };
    if (tel && !phoneValid(tel)) return { err: VSP.t("try.err_phone"), el: "t-tel" };
    if (email && !emailValid(email)) return { err: VSP.t("try.err_email"), el: "t-email" };
    if (com.length > 300) return { err: VSP.t("try.err_comment"), el: "t-com" };
    if (!$("t-ok").checked) return { err: VSP.t("try.err_ok"), el: "t-ok" };
    return { data: {
      nom: nom.slice(0, 60), any: any, rol: rol, contacte: contacte.slice(0, 60), telefon: tel.slice(0, 20), email: email.slice(0, 80),
      dies: dies, experiencia: exp, comentari: com.slice(0, 300), creat: new Date().toISOString(), estat: "nova"
    } };
  }

  function start() {
    var $ = VSP.$, f = $("try-f"); if (!f) return;
    var now = new Date().getFullYear(), sel = $("t-any");
    for (var y = now; y >= MIN_YEAR; y--) { var o = document.createElement("option"); o.value = String(y); o.textContent = String(y); sel.appendChild(o); }
    function minorNote() {
      var y = parseInt(sel.value, 10);
      $("t-minor").hidden = !(y && mayBeMinor(y, now));
    }
    sel.addEventListener("change", minorNote);
    $("t-tel").addEventListener("input", function () { var c = cleanPhone(this.value); if (c !== this.value) this.value = c; });
    $("try-again").addEventListener("click", function () {
      f.reset(); minorNote(); $("t-err").textContent = "";
      $("try-done").hidden = true; $("try-sec").hidden = false; window.scrollTo(0, 0);
    });
    var busy = false;
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (busy) return;
      var r = read(f, now), err = $("t-err");
      if (r.err) { err.textContent = r.err; if (r.el && $(r.el)) $(r.el).focus(); return; }
      err.textContent = ""; busy = true;
      var btn = $("t-send"); btn.disabled = true; btn.textContent = VSP.t("try.sending");
      VSP.fs.add("provatures", r.data).then(function () {
        $("try-sec").hidden = true; $("try-done").hidden = false; window.scrollTo(0, 0);
      }, function (e) {
        err.textContent = VSP.errText(e);
      }).then(function () { busy = false; btn.disabled = false; btn.textContent = VSP.t("common.send"); });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
