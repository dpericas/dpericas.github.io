/* Club Vòlei Santpedor · Jocs · "Quiz del vòlei" (port of Quiz.kt / QuizLogic).
   10 random questions of the rules bank, 20 s each; 10 points per right answer plus up to 10 for speed. */
(function () {
  "use strict";
  var VSPG = window.VSPG = window.VSPG || {};
  var tr = VSPG.t || function (k) { return k; };

  // ------------------------------------------------------------------ logic (QuizLogic)
  var ROUND = 10;
  var SECONDS = 20;
  /* The rules bank in the chosen language (jocs/js/i18n.js ← strings_quiz.xml of the app):
     "question|A|B|C|D|correct index|explanation", same order in every language. */
  var BANK = VSPG.bank ? VSPG.bank("quiz") : [];

  /** "question|A|B|C|D|index|explanation" → question, or null if malformed. */
  function parse(item) {
    var p = String(item).split("|");
    if (p.length !== 7) return null;
    var t = p[5].trim();
    if (!/^[+-]?\d+$/.test(t)) return null;
    var idx = parseInt(t, 10);
    if (idx < 0 || idx > 3) return null;
    return { text: p[0].trim(), answers: [p[1].trim(), p[2].trim(), p[3].trim(), p[4].trim()], correct: idx, explanation: p[6].trim() };
  }

  /** Kotlin's shuffled(random): Fisher-Yates from the end, j = nextInt(i + 1). */
  function shuffled(list, rnd) {
    var a = list.slice();
    for (var i = a.length - 1; i >= 1; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /** A round: ROUND different questions in random order, answers shuffled (keeping the right one). */
  function round(all, rnd) {
    return shuffled(all, rnd).slice(0, ROUND).map(function (q) {
      var order = shuffled([0, 1, 2, 3], rnd);
      return { text: q.text, answers: order.map(function (i) { return q.answers[i]; }),
        correct: order.indexOf(q.correct), explanation: q.explanation };
    });
  }

  /** Points of an answer: 10 if right plus up to 10 for speed; 0 if wrong or out of time. */
  function points(correct, secondsLeft) {
    if (!correct || secondsLeft <= 0) return 0;
    var bonus = Math.floor((secondsLeft / SECONDS) * 10);
    return 10 + Math.max(0, Math.min(10, bonus));
  }

  function bank() {
    var out = [];
    for (var i = 0; i < BANK.length; i++) { var q = parse(BANK[i]); if (q) out.push(q); }
    return out;
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
  function injectCss() {
    if (document.getElementById("vg-common-css")) return;
    var s = document.createElement("style");
    s.id = "vg-common-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
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

    var questions = round(bank(), api.rnd);
    var index = 0, chosen = null, score = 0, hits = 0, left = SECONDS;
    var ended = false, stopped = false, raf = 0, last = 0;
    var bar = null, buttons = [];

    api.setScore(0);

    function answer(i) {
      if (chosen !== null || ended) return;
      var q = questions[index];
      chosen = (i === null) ? -1 : i;
      var pts = points(i === q.correct, left);
      score += pts;
      if (pts > 0) hits++;
      api.setScore(score);
      api.haptic(pts > 0 ? 15 : 60);
      renderFeedback();
    }

    function renderQuestion() {
      var q = questions[index];
      chosen = null;
      left = SECONDS;
      col.innerHTML = "";
      col.appendChild(el("div", "vg-label", tr("quiz.q", index + 1, questions.length)));
      var b = el("div", "vg-bar");
      bar = el("i");
      b.appendChild(bar);
      col.appendChild(b);
      col.appendChild(el("div", "vg-q", q.text));
      buttons = [];
      q.answers.forEach(function (a, i) {
        var btn = el("button", "vg-ans", a);
        btn.type = "button";
        btn.setAttribute("data-i", String(i));
        btn.addEventListener("click", function () { answer(i); });
        col.appendChild(btn);
        buttons.push(btn);
      });
      updateBar();
      last = 0;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    }

    function updateBar() {
      if (!bar) return;
      var k = Math.max(0, Math.min(1, left / SECONDS));
      bar.style.width = (k * 100) + "%";
      bar.style.background = left < 5 ? "#C8102E" : "#3CC24A";
    }

    function tick(now) {
      if (stopped || ended || chosen !== null) return;
      if (api.paused) { last = 0; raf = requestAnimationFrame(tick); return; }   // pause overlay: the 20 s stop
      var dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      left -= dt * (api.speed || 1);
      updateBar();
      if (left <= 0) { left = 0; answer(null); return; }
      raf = requestAnimationFrame(tick);
    }

    function renderFeedback() {
      var q = questions[index];
      buttons.forEach(function (btn, i) {
        btn.disabled = true;
        if (i === q.correct) btn.className = "vg-ans ok";
        else if (i === chosen) btn.className = "vg-ans ko";
        else btn.className = "vg-ans dim";
      });
      var fb = el("div", "vg-fb");
      fb.appendChild(pili(60, chosen === q.correct ? "cheer" : "sad"));
      var t = el("div", "vg-grow");
      t.appendChild(el("b", null, chosen === q.correct ? tr("quiz.ok") : (chosen === -1 ? tr("quiz.time") : tr("quiz.ko"))));
      t.appendChild(el("div", "vg-small", q.explanation));
      fb.appendChild(t);
      col.appendChild(fb);
      var next = el("button", "vg-btn", tr("quiz.next"));
      next.type = "button";
      next.setAttribute("data-act", "next");
      next.addEventListener("click", function () {
        if (index + 1 < questions.length) { index++; renderQuestion(); root.scrollTop = 0; }
        else finish();
      });
      col.appendChild(next);
      next.scrollIntoView && next.scrollIntoView({ block: "nearest" });
    }

    function finish() {
      if (ended) return;
      ended = true;
      cancelAnimationFrame(raf);
      col.innerHTML = "";
      col.className = "vg-col vg-center";
      col.appendChild(pili(140, hits >= 7 ? "cheer" : hits >= 4 ? "wink" : "sad", "champion"));
      col.appendChild(el("div", "vg-big", tr("quiz.end", score)));
      col.appendChild(el("div", null, tr("quiz.hits", hits, questions.length)));
      api.end(score);
    }

    renderQuestion();

    return {
      stop: function () {
        stopped = true;
        cancelAnimationFrame(raf);
        if (root.parentNode) root.parentNode.removeChild(root);
      },
      // for the tests
      _state: function () { return { index: index, chosen: chosen, score: score, hits: hits, left: left, questions: questions, ended: ended }; }
    };
  }

  var def = {
    id: "quiz",
    title: tr("game.quiz"),
    emoji: "🧠",
    help: tr("help.quiz"),
    lives: 0,
    action: false,
    start: start,
    logic: { ROUND: ROUND, SECONDS: SECONDS, parse: parse, round: round, points: points, shuffled: shuffled, bank: bank }
  };
  if (VSPG.games && typeof VSPG.games.register === "function") VSPG.games.register(def);
})();
