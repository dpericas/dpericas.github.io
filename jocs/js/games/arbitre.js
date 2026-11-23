/* Club Vòlei Santpedor · Jocs · "Carnet d'àrbitre" (port of Referee.kt / RefereeLogic.kt).
   Four exam levels opened in order; 10 random questions, passed with 8; score = 25 × highest level
   passed, 110 for a 10/10 in Internacional, never below the stored best. One exam = one run. */
(function () {
  "use strict";
  var VSPG = window.VSPG = window.VSPG || {};
  var tr = VSPG.t || function (k) { return k; };

  // ------------------------------------------------------------------ logic (RefereeLogic)
  var LEVELS = 4;
  var QUESTIONS = 10;
  var PASS = 8;
  var POINTS_PER_LEVEL = 25;
  var PERFECT = 110;
  var MIN_BANK = 15;
  var STORE = "jocs_referee";

  /* The four exam banks in the chosen language (jocs/js/i18n.js ← ref_q_0 … ref_q_3 of strings_referee.xml). */
  var BANKS = [0, 1, 2, 3].map(function (l) { return VSPG.bank ? VSPG.bank("ref" + l) : []; });
  var LEVEL_NAMES = [0, 1, 2, 3].map(function (l) { return tr("ref.lv" + l); });
  var LEVEL_DESCS = [0, 1, 2, 3].map(function (l) { return tr("ref.lv_desc" + l); });
  var LEVEL_EMOJI = ["📋", "🟨", "🟥", "🌍"];

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function passed(hits) { return hits >= PASS; }
  /** Levels passed (0..4) from the stored best score. */
  function levelsPassed(best) { return clamp(Math.floor((best || 0) / POINTS_PER_LEVEL), 0, LEVELS); }
  /** A level (0-based) is open when all the previous ones are passed. */
  function open(level, best) { return level >= 0 && level < LEVELS && level <= levelsPassed(best); }
  /** Score after an exam of level with hits: never below the levels already passed. */
  function score(best, level, hits) {
    var now = passed(hits) ? level + 1 : 0;
    if (level === LEVELS - 1 && hits >= QUESTIONS) return PERFECT;
    return Math.max(clamp(best || 0, 0, PERFECT), POINTS_PER_LEVEL * Math.max(levelsPassed(best), now));
  }

  function parse(item) {
    var p = String(item).split("|");
    if (p.length !== 7) return null;
    var t = p[5].trim();
    if (!/^[+-]?\d+$/.test(t)) return null;
    var idx = parseInt(t, 10);
    if (idx < 0 || idx > 3) return null;
    return { text: p[0].trim(), answers: [p[1].trim(), p[2].trim(), p[3].trim(), p[4].trim()], correct: idx, explanation: p[6].trim() };
  }
  function shuffled(list, rnd) {
    var a = list.slice();
    for (var i = a.length - 1; i >= 1; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  /** An exam: QUESTIONS different questions in random order, answers shuffled (keeping the right one). */
  function exam(bank, rnd) {
    return shuffled(bank, rnd).slice(0, QUESTIONS).map(function (q) {
      var order = shuffled(q.answers.map(function (_, i) { return i; }), rnd);
      return { text: q.text, answers: order.map(function (i) { return q.answers[i]; }),
        correct: order.indexOf(q.correct), explanation: q.explanation };
    });
  }
  function bank(level) {
    var out = [];
    (BANKS[level] || []).forEach(function (s) { var q = parse(s); if (q) out.push(q); });
    return out;
  }

  // ------------------------------------------------------------------ pass dates ({"0":"YYYY-MM-DD",...})
  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function dates() {
    try {
      var o = JSON.parse(localStorage.getItem(STORE) || "{}");
      return (o && typeof o === "object") ? o : {};
    } catch (e) { return {}; }
  }
  function date(level) {
    var v = dates()[String(level)];
    return (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : null;
  }
  /** First pass date of a level (kept if already there). */
  function markPassed(level, day) {
    if (date(level)) return;
    var o = dates();
    o[String(level)] = day || today();
    try { localStorage.setItem(STORE, JSON.stringify(o)); } catch (e) { /* private mode */ }
  }
  function nickname() {
    try {
      var n = VSPG.progress && typeof VSPG.progress.nickname === "function" ? VSPG.progress.nickname() : null;
      return n ? String(n) : "—";
    } catch (e) { return "—"; }
  }

  // ------------------------------------------------------------------ the referee card (1200 × 760)
  var CARD_W = 1200, CARD_H = 760;

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  /** One line of text from its top-left corner, cut with an ellipsis to maxW. */
  function cardText(ctx, s, x, y, px, color, bold, maxW) {
    ctx.font = (bold ? "bold " : "") + Math.round(px) + "px system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    var t = s;
    if (ctx.measureText(t).width > maxW) {
      while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
      t += "…";
    }
    ctx.fillText(t, x, y);
  }
  function drawCard(canvas, level) {
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    var ctx = canvas.getContext("2d");
    var w = CARD_W, h = CARD_H, corner = h * 0.06;
    var g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#1C211E"); g.addColorStop(0.5, "#0D3B1E"); g.addColorStop(1, "#1E8C34");
    ctx.save();
    roundRect(ctx, 0, 0, w, h, corner);
    ctx.fillStyle = g; ctx.fill();
    ctx.clip();
    // header band in club green
    ctx.fillStyle = "#1E8C34";
    ctx.fillRect(0, 0, w, h * 0.26);
    ctx.fillStyle = "#B9F6C0";
    ctx.fillRect(0, h * 0.26, w, h * 0.012);
    ctx.restore();
    cardText(ctx, tr("ref.card_title"), w * 0.05, h * 0.04, h * 0.09, "#fff", true, w * 0.75);
    cardText(ctx, tr("ref.card_club"), w * 0.05, h * 0.155, h * 0.05, "#B9F6C0", true, w * 0.75);
    cardText(ctx, "🟨🟥", w * 0.82, h * 0.065, h * 0.09, "#fff", false, w * 0.17);
    // the Pili, champion style
    var px = w * 0.2, py = h * 0.62;
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.beginPath(); ctx.arc(px, py, h * 0.26, 0, Math.PI * 2); ctx.fill();
    if (typeof VSPG.drawPili === "function") VSPG.drawPili(ctx, px, py, h * 0.16, { mood: "cheer", style: "champion" });
    else { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(px, py, h * 0.16, 0, Math.PI * 2); ctx.fill(); }
    // fields
    var x = w * 0.42, maxW = w * 0.54;
    var stars = "", k;
    for (k = 0; k < LEVELS; k++) stars += k <= level ? "★" : "☆";
    var d = date(level) || today();
    var shown = d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4);
    var rows = [[tr("ref.card_name"), nickname()], [tr("ref.card_level"), LEVEL_NAMES[level] + "  " + stars], [tr("ref.card_date"), shown]];
    rows.forEach(function (r, i) {
      var y = h * (0.32 + i * 0.18);
      cardText(ctx, r[0], x, y, h * 0.04, "#B9F6C0", true, maxW);
      cardText(ctx, r[1], x, y + h * 0.05, h * 0.075, "#fff", true, maxW);
    });
    cardText(ctx, tr("ref.card_rules"), x, h * 0.88, h * 0.036, "rgba(255,255,255,0.7)", false, maxW);
    ctx.strokeStyle = "#B9F6C0";
    ctx.lineWidth = h * 0.012;
    roundRect(ctx, h * 0.006, h * 0.006, w - h * 0.012, h - h * 0.012, corner);
    ctx.stroke();
  }

  /** Shares the card as a PNG (Web Share with files) or downloads it. */
  function shareCard(canvas, onError) {
    function fail() { if (onError) onError(); }
    function download(blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "carnet_arbitre.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }
    try {
      canvas.toBlob(function (blob) {
        if (!blob) { fail(); return; }
        var file = null;
        try { file = new File([blob], "carnet_arbitre.png", { type: "image/png" }); } catch (e) { file = null; }
        if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: tr("game.arbitre") })["catch"](function () {});
        } else download(blob);
      }, "image/png");
    } catch (e) { fail(); }
  }

  // ------------------------------------------------------------------ shared UI helpers
  var CSS = ".vg-root{position:absolute;top:0;left:0;right:0;bottom:0;overflow-y:auto;-webkit-overflow-scrolling:touch;background:linear-gradient(180deg,#0D3B1E,#1E8C34);color:#fff;padding:16px 16px 24px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;line-height:1.35}" +
    ".vg-root *{box-sizing:border-box}" +
    ".vg-col{width:100%;max-width:520px;display:flex;flex-direction:column;gap:12px;align-items:stretch}" +
    ".vg-center{align-items:center;text-align:center}" +
    ".vg-label{color:#B9F6C0;font-weight:700;font-size:14px;text-align:center}" +
    ".vg-bar{height:6px;border-radius:3px;background:rgba(255,255,255,.2);overflow:hidden;flex:none}" +
    ".vg-bar>i{display:block;height:100%;background:#B9F6C0;border-radius:3px}" +
    ".vg-q{font-size:19px;font-weight:700;text-align:center}" +
    ".vg-big{font-size:24px;font-weight:900}" +
    ".vg-small{font-size:14px;opacity:.9;margin-top:2px}" +
    ".vg-grow{flex:1;min-width:0}" +
    ".vg-pili{flex:none;display:block}" +
    ".vg-ans{width:100%;min-height:48px;border:0;border-radius:14px;padding:10px 14px;background:rgba(255,255,255,.14);color:#fff;font:inherit;font-size:16px;cursor:pointer;text-align:center}" +
    ".vg-ans:hover:not([disabled]){background:rgba(255,255,255,.22)}" +
    ".vg-ans.ok{background:#3CC24A}.vg-ans.ko{background:#C62828}.vg-ans.dim{background:rgba(255,255,255,.08)}" +
    ".vg-ans[disabled]{cursor:default;opacity:1;color:#fff}" +
    ".vg-fb{display:flex;align-items:center;gap:10px;background:rgba(0,0,0,.35);border-radius:14px;padding:10px}" +
    ".vg-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;align-self:center;padding:12px 20px;min-height:44px;border-radius:12px;border:0;background:#B9F6C0;color:#1a1a1a;font:inherit;font-size:16px;font-weight:700;cursor:pointer}" +
    ".vg-btn.white{background:#fff;color:#000}" +
    ".vg-btn.ghost{background:transparent;color:#fff;border:2px solid rgba(255,255,255,.6)}" +
    ".vg-btn.wide{align-self:stretch;width:100%}" +
    ".vg-box{background:rgba(0,0,0,.35);border-radius:20px;padding:20px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center}";
  var REF_CSS =
    ".vg-ref-lv{width:100%;border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:8px}" +
    ".vg-ref-row{display:flex;align-items:center;gap:12px}" +
    ".vg-ref-emoji{font-size:30px;flex:none}" +
    ".vg-ref-name{font-weight:700;font-size:18px}" +
    ".vg-ref-desc{font-size:13px;opacity:.8}" +
    ".vg-ref-ok{color:#B9F6C0;font-weight:700;font-size:13px;flex:none}" +
    ".vg-ref-lock{font-size:13px;opacity:.7}" +
    ".vg-ref-card{width:100%;max-width:460px;height:auto;display:block;border-radius:10px;align-self:center}" +
    ".vg-ref-hint{color:#B9F6C0;text-align:center;font-size:13px}" +
    ".vg-ref-dlg{position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:16px;z-index:5}" +
    ".vg-ref-dlg>div{background:#1C211E;border-radius:18px;padding:16px;width:100%;max-width:500px;display:flex;flex-direction:column;gap:12px;align-items:center}";
  function injectCss() {
    if (!document.getElementById("vg-common-css")) {
      var s = document.createElement("style");
      s.id = "vg-common-css";
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    if (!document.getElementById("vg-ref-css")) {
      var m = document.createElement("style");
      m.id = "vg-ref-css";
      m.textContent = REF_CSS;
      document.head.appendChild(m);
    }
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function button(cls, text, onClick, act) {
    var b = el("button", cls, text);
    b.type = "button";
    if (act) b.setAttribute("data-act", act);
    b.addEventListener("click", onClick);
    return b;
  }
  function pili(size, mood, style, prop) {
    var c = document.createElement("canvas");
    var dpr = window.devicePixelRatio || 1;
    c.width = c.height = Math.round(size * dpr);
    c.style.width = c.style.height = size + "px";
    c.className = "vg-pili";
    var ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    if (typeof VSPG.drawPili === "function") VSPG.drawPili(ctx, size / 2, size / 2, size * 0.42, { mood: mood, style: style, prop: prop });
    else { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2); ctx.fill(); }
    return c;
  }

  // ------------------------------------------------------------------ game
  function start(stage, api) {
    injectCss();
    var root = el("div", "vg-root");
    stage.appendChild(root);
    var col = el("div", "vg-col");
    root.appendChild(col);

    var best = api.best || 0;
    var level = 0, questions = [], index = 0, chosen = null, hits = 0;
    var ended = false, stopped = false, dialog = null;

    api.setScore(best);
    levelsPage();

    function clear() { col.innerHTML = ""; col.className = "vg-col"; root.scrollTop = 0; }

    function carnet(parent, l) {
      var cv = document.createElement("canvas");
      cv.className = "vg-ref-card";
      drawCard(cv, l);
      cv.setAttribute("role", "img");
      cv.setAttribute("aria-label", tr("ref.card_aria", LEVEL_NAMES[l]));
      parent.appendChild(cv);
      var err = el("div", "vg-small");
      parent.appendChild(button("vg-btn white", "📤 " + tr("ref.share"), function () {
        err.textContent = "";
        shareCard(cv, function () { err.textContent = tr("ref.share_error"); });
      }, "share"));
      parent.appendChild(err);
    }

    function levelsPage() {
      clear();
      var done = levelsPassed(best);
      var head = el("div", "vg-col vg-center");
      head.appendChild(pili(110, "happy", "green", "glasses"));
      head.appendChild(el("div", null, tr("help.arbitre")));
      col.appendChild(head);
      for (var l = 0; l < LEVELS; l++) (function (l) {
        var isOpen = open(l, best), isDone = l < done;
        var box = el("div", "vg-ref-lv");
        box.style.background = "rgba(255,255,255," + (isOpen ? 0.12 : 0.05) + ")";
        var row = el("div", "vg-ref-row");
        row.appendChild(el("span", "vg-ref-emoji", LEVEL_EMOJI[l]));
        var txt = el("div", "vg-grow");
        txt.appendChild(el("div", "vg-ref-name", LEVEL_NAMES[l]));
        txt.appendChild(el("div", "vg-ref-desc", LEVEL_DESCS[l]));
        row.appendChild(txt);
        if (isDone) row.appendChild(el("span", "vg-ref-ok", tr("ref.passed")));
        box.appendChild(row);
        if (isOpen) {
          var b = button("vg-btn wide" + (isDone ? " white" : ""), isDone ? tr("ref.retake") : tr("ref.start"), function () { startExam(l); }, "level-" + l);
          box.appendChild(b);
        } else box.appendChild(el("div", "vg-ref-lock", tr("ref.locked", LEVEL_NAMES[l - 1])));
        col.appendChild(box);
      })(l);
      col.appendChild(el("div", "vg-ref-hint", best >= PERFECT ? tr("ref.perfect_done") : tr("ref.perfect_hint")));
      if (done > 0) col.appendChild(button("vg-btn", tr("ref.my_card"), function () { showCard(done - 1); }, "mycard"));
    }

    function showCard(l) {
      closeCard();
      dialog = el("div", "vg-ref-dlg");
      var box = el("div");
      carnet(box, l);
      box.appendChild(button("vg-btn ghost", tr("fr.close"), closeCard, "close"));
      dialog.appendChild(box);
      dialog.addEventListener("click", function (e) { if (e.target === dialog) closeCard(); });
      stage.appendChild(dialog);
    }
    function closeCard() { if (dialog && dialog.parentNode) dialog.parentNode.removeChild(dialog); dialog = null; }

    function startExam(l) {
      if (ended || !open(l, best)) return;
      level = l;
      questions = exam(bank(l), api.rnd);
      index = 0; chosen = null; hits = 0;
      examPage();
    }

    function examPage() {
      clear();
      var q = questions[index];
      chosen = null;
      col.appendChild(el("div", "vg-label", tr("ref.q", LEVEL_NAMES[level], index + 1, questions.length)));
      var bar = el("div", "vg-bar");
      var fill = el("i");
      fill.style.width = ((index + 1) / questions.length * 100) + "%";
      bar.appendChild(fill);
      col.appendChild(bar);
      col.appendChild(el("div", "vg-q", q.text));
      var btns = [];
      q.answers.forEach(function (a, i) {
        var b = button("vg-ans", a, function () {
          if (chosen !== null) return;
          chosen = i;
          if (i === q.correct) hits++;
          api.haptic(i === q.correct ? 15 : 60);
          btns.forEach(function (bb, k) {
            bb.disabled = true;
            bb.className = "vg-ans" + (k === q.correct ? " ok" : k === i ? " ko" : " dim");
          });
          feedback(q);
        });
        b.setAttribute("data-i", String(i));
        btns.push(b);
        col.appendChild(b);
      });
    }

    function feedback(q) {
      var ok = chosen === q.correct;
      var fb = el("div", "vg-fb");
      fb.appendChild(pili(60, ok ? "cheer" : "sad"));
      var t = el("div", "vg-grow");
      t.appendChild(el("b", null, ok ? tr("ref.ok") : tr("ref.ko")));
      t.appendChild(el("div", "vg-small", q.explanation));
      fb.appendChild(t);
      col.appendChild(fb);
      var lastQ = index + 1 >= questions.length;
      var b = button("vg-btn", lastQ ? tr("ref.see_result") : tr("ref.next"), function () {
        if (lastQ) finishExam(); else { index++; examPage(); }
      }, "next");
      col.appendChild(b);
      if (b.scrollIntoView) b.scrollIntoView({ block: "nearest" });
    }

    function finishExam() {
      if (ended) return;
      ended = true;
      var ok = passed(hits);
      if (ok) markPassed(level);
      var sc = score(best, level, hits);
      clear();
      col.className = "vg-col vg-center";
      col.appendChild(pili(120, ok ? "cheer" : "sad", ok ? "champion" : "green"));
      col.appendChild(el("div", "vg-big", tr("ref.result", hits, questions.length)));
      var msg = el("div", null, ok ? tr("ref.pass", LEVEL_NAMES[level]) : tr("ref.fail", PASS));
      msg.style.fontWeight = "700";
      if (ok) msg.style.color = "#B9F6C0";
      col.appendChild(msg);
      if (ok) carnet(col, level);
      api.setScore(sc);
      api.haptic(ok ? 80 : 40);
      api.end(sc);
    }

    return {
      stop: function () {
        stopped = true;
        closeCard();
        if (root.parentNode) root.parentNode.removeChild(root);
      },
      // for the tests
      _state: function () { return { level: level, index: index, hits: hits, questions: questions, ended: ended, chosen: chosen }; }
    };
  }

  var def = {
    id: "arbitre",
    title: tr("game.arbitre"),
    emoji: "🟨",
    help: tr("help.arbitre"),
    lives: 0,
    action: false,
    pausable: false,   // turn-based: nothing runs while the page is hidden
    start: start,
    logic: { LEVELS: LEVELS, QUESTIONS: QUESTIONS, PASS: PASS, POINTS_PER_LEVEL: POINTS_PER_LEVEL, PERFECT: PERFECT,
      MIN_BANK: MIN_BANK, passed: passed, levelsPassed: levelsPassed, open: open, score: score, exam: exam,
      parse: parse, bank: bank, markPassed: markPassed, date: date, drawCard: drawCard, STORE: STORE }
  };
  if (VSPG.games && typeof VSPG.games.register === "function") VSPG.games.register(def);
})();
