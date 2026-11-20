/* Club Vòlei Santpedor · Jocs · "Quiz del vòlei" (port of Quiz.kt / QuizLogic).
   10 random questions of the rules bank, 20 s each; 10 points per right answer plus up to 10 for speed. */
(function () {
  "use strict";
  var VSPG = window.VSPG = window.VSPG || {};

  // ------------------------------------------------------------------ logic (QuizLogic)
  var ROUND = 10;
  var SECONDS = 20;
  /* strings_quiz.xml (values = català): "question|A|B|C|D|correct index|explanation" */
  var BANK = [
    "Quants jugadors té cada equip a la pista?|4|5|6|7|2|Sis per equip; el líbero entra substituint un jugador de darrere.",
    "Quants tocs pot fer un equip abans de passar la pilota?|2|3|4|Tants com vulgui|1|Tres tocs com a màxim; el toc del bloqueig no compta.",
    "A quants punts s'acaba un set normal?|15|21|25|30|2|A 25 punts, sempre amb 2 punts de diferència (26-24, 27-25…).",
    "I el cinquè set, el decisiu?|10|15|21|25|1|El set decisiu es juga a 15 punts, també amb 2 de diferència.",
    "En un partit al millor de 5 sets, quants sets cal guanyar?|2|3|4|5|1|Qui guanya 3 sets guanya el partit.",
    "Qui juga amb una samarreta d'un color diferent?|El capità|El col·locador|El líbero|L'entrenador|2|El líbero és l'especialista en defensa i porta un color diferent.",
    "Pot el líbero rematar per sobre de la xarxa?|Sí, sempre|Només al cinquè set|No|Només si és el capità|2|No: el líbero no pot atacar amb la pilota per sobre de la xarxa.",
    "Quan l'equip recupera el saque, cap on roten els jugadors?|Sentit horari|Sentit antihorari|No roten|Ho decideix l'entrenador|0|Roten una posició en el sentit de les agulles del rellotge.",
    "Quina alçada té la xarxa sènior femenina?|2,10 m|2,24 m|2,35 m|2,43 m|1|2,24 m per a dones i 2,43 m per a homes.",
    "Quina alçada té la xarxa sènior masculina?|2,24 m|2,35 m|2,43 m|2,50 m|2|2,43 m per a homes.",
    "El toc del bloqueig compta com un dels tres tocs?|Sí|No|Només el primer|Depèn de l'àrbitre|1|No compta: després del bloqueig l'equip encara té tres tocs.",
    "Pot un jugador tocar la pilota dues vegades seguides?|Sí|No, és falta de dobles|Només el líbero|Només de cap|1|És falta de dobles, excepte després de bloquejar o en una única acció del primer toc.",
    "Quant dura un temps mort?|15 segons|30 segons|1 minut|2 minuts|1|Cada temps mort dura 30 segons.",
    "Quants temps morts té cada equip per set?|1|2|3|4|1|Dos temps morts per equip i set.",
    "Com es diu el punt directe de saque?|Ace|Smash|Block|Let|0|Un ace és un saque que el rival no pot tornar.",
    "Quines mides té la pista de vòlei?|18 × 9 m|20 × 10 m|16 × 8 m|24 × 12 m|0|18 metres de llarg per 9 d'ample; cada camp fa 9 × 9 m.",
    "A quina distància de la xarxa és la línia d'atac?|2 m|3 m|4 m|5 m|1|La línia d'atac és a 3 m i separa la zona d'atac de la de defensa.",
    "Si la pilota toca la línia del camp, és…|Fora|Dins|Es repeteix|Depèn de la línia|1|Les línies formen part del camp: la pilota és bona.",
    "Quant temps hi ha per sacar després del xiulet?|3 segons|5 segons|8 segons|10 segons|2|El jugador té 8 segons per sacar.",
    "Quan es canvia de camp al set decisiu?|Als 5 punts|Als 8 punts|Als 10 punts|No es canvia|1|Quan un equip arriba a 8 punts.",
    "Es pot jugar la pilota amb el peu?|No, mai|Sí, amb qualsevol part del cos|Només el líbero|Només en defensa|1|Es pot tocar amb qualsevol part del cos.",
    "Qui fa normalment el segon toc?|El líbero|El col·locador|El central|El rematador|1|El col·locador prepara la pilota perquè ataquin els companys.",
    "Quina posició fa el saque?|1 (dreta darrere)|3 (centre davant)|4 (esquerra davant)|6 (centre darrere)|0|Saca el jugador que és a la posició 1.",
    "Quants canvis pot fer cada equip per set (reglament FIVB)?|3|6|8|Il·limitats|1|Sis substitucions per set; les del líbero no compten.",
    "En quin any es va inventar el vòlei?|1895|1920|1948|1964|0|El va inventar William G. Morgan el 1895, als Estats Units.",
    "Des de quan és esport olímpic el vòlei?|1936|1964|1980|1992|1|Des dels Jocs de Tòquio de 1964.",
    "Què és una falta de posició?|Sacar fora|No estar en l'ordre de rotació en el moment del saque|Tocar la xarxa|Entrar a l'altre camp|1|En el moment del saque cada jugador ha d'estar en el seu lloc de la rotació.",
    "Tocar la xarxa mentre jugues la pilota és…|Vàlid|Falta|Només falta al cinquè set|Punt per a tu|1|És falta tocar la xarxa entre les antenes durant l'acció de jugar la pilota."
  ];

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
      col.appendChild(el("div", "vg-label", "Pregunta " + (index + 1) + " de " + questions.length));
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
      t.appendChild(el("b", null, chosen === q.correct ? "Correcte! 🎉" : (chosen === -1 ? "Temps!" : "Ui! No és aquesta 😅")));
      t.appendChild(el("div", "vg-small", q.explanation));
      fb.appendChild(t);
      col.appendChild(fb);
      var next = el("button", "vg-btn", "Següent");
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
      col.appendChild(el("div", "vg-big", "Has fet " + score + " punts"));
      col.appendChild(el("div", null, hits + " de " + questions.length + " encerts"));
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
    title: "Quiz del vòlei",
    emoji: "🧠",
    help: "10 preguntes de reglament. Com més de pressa encertis, més punts!",
    lives: 0,
    action: false,
    start: start,
    logic: { ROUND: ROUND, SECONDS: SECONDS, parse: parse, round: round, points: points, shuffled: shuffled, bank: bank }
  };
  if (VSPG.games && typeof VSPG.games.register === "function") VSPG.games.register(def);
})();
