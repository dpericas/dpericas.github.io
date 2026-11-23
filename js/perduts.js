/* 🧦 Objectes perduts (#perduts, Club tab): what was lost or found at trainings and matches.
 * Same board as the app (community/LostFound.kt, LostFoundScreen.kt) and docs/firestore.rules:
 *  - anybody signed in (the browser's anonymous session) reads perduts/;
 *  - a post is perduts/<uid>_0 … <uid>_4 (at most 5 at once per browser; a slot is free while no
 *    document has that id, so resolved posts keep theirs until they are deleted);
 *  - `caduca` (now + 60 days) lets Firestore TTL delete it by itself;
 *  - only the owner marks it resolved (estat + resolt) or deletes it.
 * No phone numbers or e-mails in the texts: the club passes messages on. */
(function () {
  "use strict";
  var VSP = window.VSP, $ = VSP.$, esc = VSP.esc;
  var DAY_MS = 86400000;

  function instantOf(iso) {
    if (!iso) return null;
    var t = Date.parse(String(iso).trim());
    return isNaN(t) ? null : t;
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  /** Pure rules (LostFoundLogic), tested offline. Times are milliseconds since 1970. */
  var L = VSP.lostLogic = {
    COLLECTION: "perduts", LOST: "perdut", FOUND: "trobat", OPEN: "obert", RESOLVED: "resolt",
    MAX_TITLE: 60, MAX_DESC: 300, MAX_PLACE: 60, MAX_THUMB: 100000, KEEP_DAYS: 60, RESOLVED_DAYS: 7, MAX_SLOTS: 5,

    /** Looks like a phone number (a run of 9+ digits with spaces, dots, dashes or brackets) or an e-mail. */
    containsPersonalData: function (text) {
      text = String(text || "");
      if (/[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}/.test(text)) return true;
      var runs = text.match(/\+?\d[\d .()-]*\d/g) || [];
      return runs.some(function (r) { return r.replace(/\D/g, "").length >= 9; });
    },
    /** "YYYY-MM-DD" of a Date in local time. */
    isoDay: function (d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); },
    /** A real day, not in the future and not older than KEEP_DAYS ([today] = "YYYY-MM-DD"). */
    dayValid: function (day, today) {
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || "")), t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(today || ""));
      if (!m || !t) return false;
      var d = Date.UTC(+m[1], +m[2] - 1, +m[3]), dt = new Date(d);
      if (dt.getUTCFullYear() !== +m[1] || dt.getUTCMonth() !== +m[2] - 1 || dt.getUTCDate() !== +m[3]) return false;
      var diff = Math.round((Date.UTC(+t[1], +t[2] - 1, +t[3]) - d) / DAY_MS);
      return diff >= 0 && diff <= L.KEEP_DAYS;
    },
    /** Null = OK, else the i18n key of the error (same order as the app). */
    validate: function (tipus, titol, descripcio, lloc, day, today) {
      titol = String(titol || "").trim(); descripcio = String(descripcio || "").trim(); lloc = String(lloc || "").trim();
      if (tipus !== L.LOST && tipus !== L.FOUND) return "lf.err_type";
      if (titol.length < 2 || titol.length > L.MAX_TITLE) return "lf.err_title";
      if (descripcio.length > L.MAX_DESC || lloc.length > L.MAX_PLACE) return "lf.err_long";
      if (!L.dayValid(day, today)) return "lf.err_date";
      if (L.containsPersonalData(titol) || L.containsPersonalData(descripcio) || L.containsPersonalData(lloc)) return "lf.err_personal";
      return null;
    },
    /** The document to create (thumb: base64 JPEG or empty). caduca is a Firestore timestamp. */
    toDoc: function (tipus, titol, descripcio, lloc, day, thumb, owner, nowMs) {
      var d = { tipus: tipus, titol: String(titol).trim().slice(0, L.MAX_TITLE), descripcio: String(descripcio || "").trim().slice(0, L.MAX_DESC),
        lloc: String(lloc || "").trim().slice(0, L.MAX_PLACE), data: day, owner: owner, creat: new Date(nowMs).toISOString(), estat: L.OPEN,
        caduca: VSP.ts(new Date(nowMs + L.KEEP_DAYS * DAY_MS).toISOString()) };
      if (thumb) d.thumb = thumb;
      return d;
    },
    resolveDoc: function (nowMs) { return { estat: L.RESOLVED, resolt: new Date(nowMs).toISOString() }; },
    /** A Firestore document -> item, or null if it is not a post. */
    parse: function (d) {
      if (!d || !d.id || (d.tipus !== L.LOST && d.tipus !== L.FOUND)) return null;
      var s = function (v) { return typeof v === "string" ? v : ""; };
      var thumb = s(d.thumb);
      return { id: d.id, tipus: d.tipus, titol: s(d.titol), descripcio: s(d.descripcio), lloc: s(d.lloc), data: s(d.data),
        thumb: /^[A-Za-z0-9+/=\r\n]+$/.test(thumb) ? thumb : null, owner: s(d.owner), creat: s(d.creat),
        estat: d.estat === L.RESOLVED ? L.RESOLVED : L.OPEN, resolt: s(d.resolt) || null };
    },
    /** Older than KEEP_DAYS (unknown date: not old). */
    expired: function (item, nowMs) { var c = instantOf(item.creat); return c !== null && c < nowMs - L.KEEP_DAYS * DAY_MS; },
    /** Not expired; resolved ones only during RESOLVED_DAYS after being resolved. */
    visible: function (item, nowMs) {
      if (L.expired(item, nowMs)) return false;
      if (item.estat !== L.RESOLVED) return true;
      var since = instantOf(item.resolt); if (since === null) since = instantOf(item.creat);
      if (since === null) return true;
      return since >= nowMs - L.RESOLVED_DAYS * DAY_MS;
    },
    /** Visible ones of [type] (null = both), open first, then newest first. */
    shown: function (items, nowMs, type) {
      return items.filter(function (i) { return L.visible(i, nowMs) && (!type || i.tipus === type); }).sort(function (a, b) {
        var ra = a.estat === L.RESOLVED ? 1 : 0, rb = b.estat === L.RESOLVED ? 1 : 0;
        if (ra !== rb) return ra - rb;
        return (instantOf(b.creat) || 0) - (instantOf(a.creat) || 0);
      });
    },
    canResolve: function (item, uid) { return !!uid && item.owner === uid && item.estat !== L.RESOLVED; },
    canDelete: function (item, uid) { return !!uid && item.owner === uid; },
    /** Free slot numbers of [uid] given every document id of the collection (taken = a doc exists). */
    freeSlots: function (ids, uid) {
      var out = [];
      for (var n = 0; n < L.MAX_SLOTS; n++) if (ids.indexOf(uid + "_" + n) < 0) out.push(n);
      return out;
    },
    /** Creates [doc] in the first free slot with set(path, doc); a 403 (taken meanwhile) tries the next
     * one. No slot left -> error with .full. Resolves to the id used. */
    publish: function (set, ids, uid, doc) {
      var free = L.freeSlots(ids, uid);
      function attempt(i) {
        if (i >= free.length) { var e = new Error("full"); e.full = true; return Promise.reject(e); }
        var id = uid + "_" + free[i];
        return set(L.COLLECTION + "/" + id, doc).then(function () { return id; }, function (e) { if (e && e.status === 403) return attempt(i + 1); throw e; });
      }
      return attempt(0);
    },
    /** "2026-11-22" -> "22/11/2026". */
    shortDay: function (day) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(day || "")); return m ? m[3] + "/" + m[2] + "/" + m[1] : ""; }
  };

  VSP.pages.perduts = { tab: "club", render: function (arg, el, title) {
    title(VSP.t("lf.title"));
    var all = null, ids = [], uid = null, filter = null, busy = false, error = "", info = "", deleting = null, big = null;
    var form = null;   // open publish form: {tipus, thumb, reading}
    el.innerHTML = '<section><p>' + esc(VSP.t("lf.intro")) + '</p><p class="meta">' + esc(VSP.t("lf.contact_hint")) + "</p>" +
      '<div class="row"><button class="btn primary" type="button" id="lf-new">' + esc(VSP.t("lf.publish")) + "</button></div>" +
      '<div id="lf-form"></div>' +
      '<div class="chips" role="group" id="lf-chips"></div>' +
      '<div class="ok" id="lf-info" role="status"></div><div class="err" id="lf-err" role="alert"></div>' +
      '<div id="lf-list"><div class="empty">' + esc(VSP.t("common.loading")) + "</div></div></section>";

    function chips() {
      var opts = [[null, "lf.all"], [L.LOST, "lf.filter_lost"], [L.FOUND, "lf.filter_found"]];
      $("lf-chips").innerHTML = opts.map(function (o) {
        var on = filter === o[0];
        return '<button type="button" class="chip' + (on ? " on" : "") + '" aria-pressed="' + on + '" data-lff="' + (o[0] || "") + '">' + esc(VSP.t(o[1])) + "</button>";
      }).join("");
      VSP.each("[data-lff]", function (b) { b.onclick = function () { filter = b.getAttribute("data-lff") || null; chips(); list(); }; }, el);
    }
    function msgs() {
      if ($("lf-info")) $("lf-info").textContent = info;
      if ($("lf-err")) $("lf-err").textContent = error;
    }
    function list() {
      var box = $("lf-list"); if (!box) return;
      msgs();
      if (all === null) { box.innerHTML = '<div class="empty">' + esc(busy ? VSP.t("common.loading") : "") + "</div>"; return; }
      var items = L.shown(all, Date.now(), filter);
      if (!items.length) { box.innerHTML = '<div class="empty">' + esc(VSP.t("lf.empty")) + "</div>"; return; }
      box.innerHTML = items.map(function (it) {
        var resolved = it.estat === L.RESOLVED, place = [it.lloc, L.shortDay(it.data)].filter(Boolean).join(" · ");
        var acts = "";
        if (deleting === it.id) {
          acts = '<p class="meta">' + esc(VSP.t("lf.delete_q")) + '</p><div class="row"><button type="button" class="btn danger small" data-lfdel-ok="' + esc(it.id) + '">' + esc(VSP.t("common.delete")) +
            '</button><button type="button" class="btn ghost small" data-lfdel-no="1">' + esc(VSP.t("common.cancel")) + "</button></div>";
        } else {
          if (L.canResolve(it, uid)) acts += '<button type="button" class="btn ghost small" data-lfres="' + esc(it.id) + '"' + (busy ? " disabled" : "") + ">" + esc(VSP.t("lf.mark_resolved")) + "</button>";
          if (L.canDelete(it, uid)) acts += '<button type="button" class="btn ghost small" data-lfdel="' + esc(it.id) + '"' + (busy ? " disabled" : "") + ">" + esc(VSP.t("common.delete")) + "</button>";
          if (acts) acts = '<div class="row">' + acts + "</div>";
        }
        return '<div class="card lf-item' + (big === it.id ? " big" : "") + (resolved ? " resolved" : "") + '" data-lfid="' + esc(it.id) + '">' +
          (it.thumb ? '<button type="button" class="lf-ph" data-lfbig="' + esc(it.id) + '" aria-label="' + esc(VSP.t("lf.photo_view")) + '"><img alt="" src="data:image/jpeg;base64,' + esc(it.thumb) + '"></button>' : "") +
          '<div class="lf-body"><b class="lf-kind">' + esc(VSP.t(it.tipus === L.FOUND ? "lf.found" : "lf.lost")) + (resolved ? "  " + esc(VSP.t("lf.resolved")) : "") + "</b>" +
          '<h3 class="lf-title">' + esc(it.titol) + "</h3>" +
          (it.descripcio ? '<p class="lf-desc">' + esc(it.descripcio) + "</p>" : "") +
          (place ? '<p class="meta">' + esc(place) + "</p>" : "") +
          (uid && it.owner === uid ? '<p class="meta lf-mine">' + esc(VSP.t("lf.mine")) + "</p>" : "") + acts + "</div></div>";
      }).join("");
      VSP.each("[data-lfbig]", function (b) { b.onclick = function () { var id = b.getAttribute("data-lfbig"); big = big === id ? null : id; list(); }; }, box);
      VSP.each("[data-lfres]", function (b) {
        b.onclick = function () { var id = b.getAttribute("data-lfres"); act(function () { return VSP.fs.update(L.COLLECTION + "/" + id, L.resolveDoc(Date.now())); }); };
      }, box);
      VSP.each("[data-lfdel]", function (b) { b.onclick = function () { deleting = b.getAttribute("data-lfdel"); list(); }; }, box);
      VSP.each("[data-lfdel-no]", function (b) { b.onclick = function () { deleting = null; list(); }; }, box);
      VSP.each("[data-lfdel-ok]", function (b) {
        b.onclick = function () { var id = b.getAttribute("data-lfdel-ok"); deleting = null; act(function () { return VSP.fs.del(L.COLLECTION + "/" + id); }); };
      }, box);
    }
    function load() {
      busy = true; list();
      return VSP.token().then(function () {
        uid = VSP.uid();
        return VSP.fs.list(L.COLLECTION);
      }).then(function (docs) {
        ids = docs.map(function (d) { return d.id; });
        all = docs.map(L.parse).filter(Boolean);
        busy = false; list();
      }, function (e) { busy = false; error = VSP.errText(e); if (all === null) all = []; list(); });
    }
    function act(fn) {
      if (busy) return;
      busy = true; error = info = ""; list();
      fn().then(load, function (e) { busy = false; error = VSP.errText(e); list(); });
    }

    // ---- publish form
    function drawForm() {
      var box = $("lf-form"); if (!box) return;
      $("lf-new").hidden = !!form;
      if (!form) { box.innerHTML = ""; return; }
      var now = new Date(), today = L.isoDay(now), min = L.isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - L.KEEP_DAYS));
      box.innerHTML = '<form class="form card soft" id="lf-f" novalidate><h3 class="sub">' + esc(VSP.t("lf.new_title")) + "</h3>" +
        "<fieldset><legend>" + esc(VSP.t("lf.type")) + "</legend>" +
        '<label class="check"><input type="radio" name="lf-type" value="perdut"' + (form.tipus === L.LOST ? " checked" : "") + "> <span>" + esc(VSP.t("lf.type_lost")) + "</span></label>" +
        '<label class="check"><input type="radio" name="lf-type" value="trobat"' + (form.tipus === L.FOUND ? " checked" : "") + "> <span>" + esc(VSP.t("lf.type_found")) + "</span></label></fieldset>" +
        '<label for="lf-title">' + esc(VSP.t("lf.field_title")) + '</label><input id="lf-title" maxlength="' + L.MAX_TITLE + '">' +
        '<label for="lf-desc">' + esc(VSP.t("lf.field_desc")) + '</label><textarea id="lf-desc" rows="2" maxlength="' + L.MAX_DESC + '"></textarea><p class="meta" id="lf-count">0/' + L.MAX_DESC + "</p>" +
        '<label for="lf-place">' + esc(VSP.t("lf.field_place")) + '</label><input id="lf-place" maxlength="' + L.MAX_PLACE + '">' +
        '<label for="lf-date">' + esc(VSP.t("lf.field_date")) + '</label><input id="lf-date" type="date" value="' + today + '" min="' + min + '" max="' + today + '">' +
        '<div id="lf-photo" class="row lf-photo"></div>' +
        '<p class="meta bad">' + esc(VSP.t("lf.contact_hint")) + "</p>" +
        '<div class="err" id="lf-ferr" role="alert"></div>' +
        '<div class="row"><button class="btn primary" type="submit" id="lf-send">' + esc(VSP.t("lf.publish")) + '</button><button class="btn ghost" type="button" id="lf-cancel">' + esc(VSP.t("common.cancel")) + "</button></div></form>";
      photo();
      VSP.each("input[name=lf-type]", function (r) { r.onchange = function () { form.tipus = r.value; }; }, box);
      $("lf-desc").oninput = function () { $("lf-count").textContent = this.value.length + "/" + L.MAX_DESC; };
      $("lf-cancel").onclick = function () { form = null; drawForm(); };
      $("lf-f").onsubmit = function (ev) {
        ev.preventDefault();
        if (form.sending || form.reading) return;
        var t = $("lf-title").value, d = $("lf-desc").value, p = $("lf-place").value, day = $("lf-date").value;
        var bad = L.validate(form.tipus, t, d, p, day, L.isoDay(new Date()));
        if (bad) { $("lf-ferr").textContent = VSP.t(bad); return; }
        $("lf-ferr").textContent = ""; form.sending = true;
        var btn = $("lf-send"); btn.disabled = true; btn.textContent = VSP.t("lf.sending");
        VSP.token().then(function () {
          uid = VSP.uid();
          return VSP.fs.list(L.COLLECTION);   // fresh ids: which of my 5 slots are taken now
        }).then(function (docs) {
          var doc = L.toDoc(form.tipus, t, d, p, day, form.thumb, uid, Date.now());
          return L.publish(VSP.fs.set, docs.map(function (x) { return x.id; }), uid, doc);
        }).then(function () {
          form = null; drawForm(); info = VSP.t("lf.published"); error = ""; load();
        }, function (e) {
          if (!form) return;
          form.sending = false;
          if ($("lf-ferr")) $("lf-ferr").textContent = e && e.full ? VSP.t("lf.err_full") : VSP.errText(e);
          if ($("lf-send")) { $("lf-send").disabled = false; $("lf-send").textContent = VSP.t("lf.publish"); }
        });
      };
    }
    function photo() {
      var box = $("lf-photo"); if (!box) return;
      if (form.thumb) {
        box.innerHTML = '<img class="lf-prev" alt="" src="data:image/jpeg;base64,' + esc(form.thumb) + '"><button type="button" class="btn ghost small" id="lf-photo-rm">' + esc(VSP.t("lf.photo_remove")) + "</button>";
        $("lf-photo-rm").onclick = function () { form.thumb = null; photo(); };
        return;
      }
      box.innerHTML = '<label class="btn ghost filebtn">' + esc(VSP.t(form.reading ? "common.loading" : "lf.photo")) + '<input type="file" id="lf-file" accept="image/*"></label>';
      $("lf-file").onchange = function () {
        var f = this.files && this.files[0]; this.value = "";
        if (!f) return;
        if (!/^image\//.test(f.type)) { $("lf-ferr").textContent = VSP.t("lf.err_photo"); return; }
        form.reading = true; photo();
        if ($("lf-send")) $("lf-send").disabled = true;
        var mine = form;
        VSP.photoThumb(f).then(function (t) {
          if (form !== mine) return;
          form.reading = false; form.thumb = t;
          if ($("lf-ferr")) $("lf-ferr").textContent = t ? "" : VSP.t("lf.err_photo");
          if ($("lf-send")) $("lf-send").disabled = false;
          photo();
        });
      };
    }
    $("lf-new").onclick = function () { form = { tipus: L.LOST, thumb: null }; info = ""; msgs(); drawForm(); if ($("lf-title")) $("lf-title").focus(); };
    chips();
    load();
  } };
})();
