/* Club Vòlei Santpedor · Jocs · "Joc de temporada" (port of SeasonGameScreen.kt / SeasonalGame.kt).
   Only during a festivity: catch its items with the Pili's basket (+1), avoid the bad ones (−1 life, 3 lives).
   Without a festivity: the message and what every festivity brings. Units: CSS px, seconds. */
(function () {
  "use strict";
  var VSPG = window.VSPG = window.VSPG || {};

  // ------------------------------------------------------------------ festivities (season/Festivities.kt)
  var FEST_ORDER = ["NADAL", "CARNAVAL", "PASQUA", "SANT_JORDI", "FESTA_MAJOR", "SANT_JOAN", "DIADA", "CASTANYADA"];
  var FEST = {
    NADAL: { title: "Nadal", emoji: "❄️", colors: ["#B71C1C", "#1B5E20"], prop: "santa" },
    CARNAVAL: { title: "Carnaval", emoji: "🎭", colors: ["#6A1B9A", "#F57C00"], prop: "mask" },
    PASQUA: { title: "Setmana Santa", emoji: "🐰", colors: ["#8E24AA", "#FFB300"], prop: "bunny" },
    SANT_JORDI: { title: "Sant Jordi", emoji: "🌹", colors: ["#C62828", "#F9A825"], prop: "rose" },
    FESTA_MAJOR: { title: "Festa Major de Santpedor", emoji: "🎉", colors: ["#1E8C34", "#C8102E"], prop: "party" },
    SANT_JOAN: { title: "Sant Joan", emoji: "🎆", colors: ["#E65100", "#1A237E"], prop: "sparkler" },
    DIADA: { title: "Diada", emoji: "🎗️", colors: ["#FCD116", "#C8102E"], prop: "senyera" },
    CASTANYADA: { title: "Castanyada", emoji: "🌰", colors: ["#6D4C41", "#EF6C00"], prop: "chestnuts" }
  };

  /* SeasonalGame.theme + the "when" texts (strings_season.xml) and the album prizes (AlbumCatalog). */
  var THEMES = {
    NADAL: { good: ["🎁", "⭐", "🍬", "🎄"], bad: ["❄️"], when: "7 de desembre – 7 de gener", prize: ["🍫 Torrons de Nadal", "🪵 El Tió"] },
    CARNAVAL: { good: ["🎭", "🎊", "🍬", "🎉"], bad: ["🌧️"], when: "Dijous Gras – Dimecres de Cendra", prize: ["🎭 Disfressa de Carnaval"] },
    PASQUA: { good: ["🥚", "🐣", "🍫", "🐰"], bad: ["🐝"], when: "Diumenge de Rams – Dilluns de Pasqua", prize: ["🥚 La mona de Pasqua"] },
    SANT_JORDI: { good: ["🌹", "📚", "🌹", "📖"], bad: ["🔥"], when: "23 d'abril", prize: ["🌹 La rosa de Sant Jordi", "📚 El llibre de Sant Jordi"] },
    FESTA_MAJOR: { good: ["🎉", "🎶", "🍭", "🎈"], bad: ["🧨"], when: "Al voltant del segon diumenge de juny", prize: ["🎆 Festa Major de Santpedor"] },
    SANT_JOAN: { good: ["✨", "🍰", "🎇", "⭐"], bad: ["🧨"], when: "23 i 24 de juny", prize: ["🔥 La revetlla de Sant Joan"] },
    DIADA: { good: ["⭐", "🎗️", "🏐", "🎵"], bad: ["🌧️"], when: "11 de setembre", prize: ["🎗️ L'Onze de Setembre"] },
    CASTANYADA: { good: ["🌰", "🍠", "🍂", "🌰"], bad: ["🔥"], when: "30 d'octubre – 1 de novembre", prize: ["🌰 Castanyes calentes"] }
  };

  function ymd(y, m, d) { return y * 10000 + m * 100 + d; }
  function key(date) { return ymd(date.getFullYear(), date.getMonth() + 1, date.getDate()); }
  function addDays(date, n) { return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n); }

  /** Easter Sunday (Gregorian calendar, anonymous algorithm). */
  function easter(year) {
    var a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
    var f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31);
    var day = (h + l - 7 * m + 114) % 31 + 1;
    return new Date(year, month - 1, day);
  }
  /** Second Sunday of June: the Festa Major runs from the Thursday before to the Monday after. */
  function festaMajor(year) {
    var first = new Date(year, 5, 1);
    var sunday = new Date(year, 5, 1 + ((7 - first.getDay()) % 7) + 7);
    return [addDays(sunday, -3), addDays(sunday, 1)];
  }
  /** Festivities.on(date): the festivity key or null. */
  function festivityOn(date) {
    var y = date.getFullYear(), md = (date.getMonth() + 1) * 100 + date.getDate(), k = key(date);
    var e = easter(y), fm = festaMajor(y);
    if (md >= 1207 || md <= 107) return "NADAL";
    if (k >= key(addDays(e, -52)) && k <= key(addDays(e, -46))) return "CARNAVAL";
    if (k >= key(addDays(e, -7)) && k <= key(addDays(e, 1))) return "PASQUA";
    if (md === 423) return "SANT_JORDI";
    if (k >= key(fm[0]) && k <= key(fm[1])) return "FESTA_MAJOR";
    if (md === 623 || md === 624) return "SANT_JOAN";
    if (md === 911) return "DIADA";
    if (md >= 1030 && md <= 1101) return "CASTANYADA";
    return null;
  }

  /** Normalises whatever the framework's VSPG.festivityOn returns ("NADAL", "nadal", {id:…}, …). */
  function normalise(f) {
    if (f == null || f === false) return null;
    var s = f;
    if (typeof f === "object") s = f.id || f.key || f.name || f.festivity || f.code || null;
    if (typeof s !== "string") return null;
    s = s.toUpperCase().replace(/[\s-]+/g, "_");
    return FEST[s] ? s : null;
  }
  function today() {
    var now = new Date();
    if (typeof VSPG.festivityOn === "function") {
      var r;
      try { r = VSPG.festivityOn(now); } catch (e) { r = undefined; }
      if (r === null) return null;
      if (r !== undefined) { var n = normalise(r); if (n) return n; }
    }
    return festivityOn(now);
  }

  // ------------------------------------------------------------------ logic (SeasonalGame)
  var LIVES = 3, FADE = 0.35, HURT = 0.4;

  function itemSize(w) { return w * 0.11; }
  function basketWidth(w) { return w * 0.26; }
  /** Top of the basket (the catching line). */
  function basketY(h) { return h * 0.84; }
  /** Falling speed (px/s): faster with the score, capped at 60 points. */
  function fallSpeed(h, score) { return h * (0.26 + Math.min(score, 60) * 0.009); }
  /** Seconds between items: shorter with the score, never below 0.45 s. */
  function dropInterval(score) { return Math.max(0.45, 1.1 - score * 0.014); }
  /** Chance that a new item is a bad one: 25 % at the start, up to 45 %. */
  function badChance(score) { return 0.25 + Math.min(score, 50) * 0.004; }

  function newState(w) { return { drops: [], basketX: w / 2, score: 0, lives: LIVES, nextDrop: 0.6, hurt: 0 }; }
  function over(s) { return s.lives <= 0; }
  function pick(list, rnd) { return list[Math.floor(rnd() * list.length)]; }

  function spawn(w, h, score, theme, rnd) {
    var r = itemSize(w) / 2;
    var x = r + rnd() * (w - 2 * r);
    var good = rnd() >= badChance(score);
    var emoji = good ? pick(theme.good, rnd) : pick(theme.bad, rnd);
    return { x: x, y: -r, vy: fallSpeed(h, score) * (0.85 + rnd() * 0.3), emoji: emoji, good: good, hit: false, age: 0 };
  }

  function moveBasket(s, x, w) {
    var half = basketWidth(w) / 2;
    var n = clone(s);
    n.basketX = Math.max(half, Math.min(w - half, x));
    return n;
  }

  /** True if the item falls into the basket this frame. */
  function catches(d, basketX, w, h) {
    var r = itemSize(w) / 2;
    var top = basketY(h);
    return !d.hit && d.y + r >= top && d.y - r <= top + r * 1.2 && Math.abs(d.x - basketX) <= basketWidth(w) / 2 + r * 0.3;
  }

  function clone(s) {
    return { drops: s.drops, basketX: s.basketX, score: s.score, lives: s.lives, nextDrop: s.nextDrop, hurt: s.hurt };
  }
  function cloneDrop(d) { return { x: d.x, y: d.y, vy: d.vy, emoji: d.emoji, good: d.good, hit: d.hit, age: d.age }; }

  /** Advances dt s: moves the items, catches (+1 or −1 life), drops the lost ones and spawns new ones. */
  function step(s, dt, w, h, theme, rnd) {
    if (over(s)) return s;
    var score = s.score, lives = s.lives, hurt = Math.max(0, s.hurt - dt);
    var r = itemSize(w) / 2;
    var drops = [];
    for (var i = 0; i < s.drops.length; i++) {
      var d = s.drops[i];
      if (d.hit) {
        var aged = cloneDrop(d);
        aged.age = d.age + dt;
        if (aged.age < FADE) drops.push(aged);
        continue;
      }
      var moved = cloneDrop(d);
      moved.y = d.y + d.vy * dt;
      if (catches(moved, s.basketX, w, h)) {
        if (moved.good) score++; else { lives--; hurt = HURT; }
        moved.hit = true;
        drops.push(moved);
      } else if (moved.y - r > h) {
        // missed: no penalty
      } else drops.push(moved);
    }
    var next = s.nextDrop - dt;
    if (next <= 0 && lives > 0) {
      drops.push(spawn(w, h, score, theme, rnd));
      next = dropInterval(score);
    }
    return { drops: drops, basketX: s.basketX, score: score, lives: Math.max(0, lives), nextDrop: next, hurt: hurt };
  }

  // ------------------------------------------------------------------ UI
  var CSS =
    ".vg-sea{position:absolute;top:0;left:0;right:0;bottom:0;overflow-y:auto;-webkit-overflow-scrolling:touch;background:linear-gradient(180deg,#0D3B1E,#1E8C34);color:#fff;padding:16px 16px 24px;box-sizing:border-box;line-height:1.35}" +
    ".vg-sea *{box-sizing:border-box}" +
    ".vg-sea-col{max-width:520px;margin:0 auto;display:flex;flex-direction:column;gap:10px;align-items:center}" +
    ".vg-sea-msg{font-weight:700;text-align:center}" +
    ".vg-sea-h{color:#B9F6C0;font-weight:700;font-size:18px;align-self:stretch;margin-top:8px}" +
    ".vg-sea-row{align-self:stretch;display:flex;align-items:center;gap:12px;border-radius:16px;padding:14px}" +
    ".vg-sea-row .e{font-size:32px;flex:none}.vg-sea-row .t{flex:1;min-width:0}" +
    ".vg-sea-row b{display:block;font-size:17px}.vg-sea-row .w{font-size:12px;opacity:.85}" +
    ".vg-sea-row .i{font-size:13px}.vg-sea-row .p{font-size:13px;font-weight:700;color:#B9F6C0}" +
    ".vg-sea-cv{position:absolute;top:0;left:0;width:100%;height:100%;display:block;touch-action:none;-webkit-user-select:none;user-select:none}";
  function injectCss() {
    if (document.getElementById("vg-sea-css")) return;
    var s = document.createElement("style");
    s.id = "vg-sea-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }
  function drawPili(ctx, x, y, r, mood, prop) {
    if (typeof VSPG.drawPili === "function") VSPG.drawPili(ctx, x, y, r, { mood: mood, prop: prop });
    else { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  }
  function distinct(list) {
    var out = [];
    list.forEach(function (x) { if (out.indexOf(x) < 0) out.push(x); });
    return out;
  }
  function itemsText(t) { return "Atrapa " + distinct(t.good).join(" ") + " · esquiva " + t.bad.join(" "); }

  /** No festivity today: the message and what every festivity brings. */
  function seasonOff(stage) {
    var root = el("div", "vg-sea");
    var col = el("div", "vg-sea-col");
    var c = document.createElement("canvas");
    var dpr = window.devicePixelRatio || 1;
    c.width = c.height = Math.round(110 * dpr);
    c.style.width = c.style.height = "110px";
    var ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    drawPili(ctx, 55, 55, 46, "sleep");
    col.appendChild(c);
    col.appendChild(el("div", "vg-sea-msg", "🔒 Torna-hi per una festa (Castanyada, Nadal, Carnestoltes, Sant Jordi, Sant Joan…)"));
    col.appendChild(el("div", "vg-sea-h", "Festes amb joc"));
    FEST_ORDER.forEach(function (k) {
      var f = FEST[k], t = THEMES[k];
      var row = el("div", "vg-sea-row");
      row.setAttribute("data-fest", k);
      row.style.background = "linear-gradient(90deg," + hexA(f.colors[0], 0.55) + "," + hexA(f.colors[1], 0.35) + ")";
      row.appendChild(el("span", "e", f.emoji));
      var txt = el("div", "t");
      txt.appendChild(el("b", null, f.title));
      txt.appendChild(el("div", "w", t.when));
      txt.appendChild(el("div", "i", itemsText(t)));
      if (t.prize.length) txt.appendChild(el("div", "p", "Premi: " + t.prize.join(" · ")));
      row.appendChild(txt);
      col.appendChild(row);
    });
    root.appendChild(col);
    stage.appendChild(root);
    return { stop: function () { if (root.parentNode) root.parentNode.removeChild(root); } };
  }

  function start(stage, api) {
    injectCss();
    var fest = today();
    if (!fest) return seasonOff(stage);
    var f = FEST[fest], theme = THEMES[fest];
    var prop = typeof VSPG.propFor === "function" ? VSPG.propFor(fest) : f.prop;

    var cv = document.createElement("canvas");
    cv.className = "vg-sea-cv";
    stage.appendChild(cv);
    var ctx = cv.getContext("2d");
    var w = 0, h = 0, dpr = 1;
    function resize() {
      dpr = window.devicePixelRatio || 1;
      w = stage.clientWidth || 320;
      h = stage.clientHeight || 480;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    resize();

    var state = newState(w);
    var dragX = w / 2, pressed = false, playing = true, stopped = false, ended = false, raf = 0, last = 0;
    api.setScore(0);
    api.setLives(LIVES);

    function onDown(e) {
      pressed = true;
      try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      dragX = api.point(e, cv).x;
      e.preventDefault();
    }
    function onMove(e) {
      if (!(pressed || e.pointerType === "touch") || !playing) return;
      dragX = api.point(e, cv).x;
      e.preventDefault();
    }
    function onUp() { pressed = false; }
    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointercancel", onUp);
    window.addEventListener("resize", resize);

    function frame(now) {
      if (stopped) return;
      var dt = last ? Math.min((now - last) / 1000, 0.033) * (api.speed || 1) : 0;
      last = now;
      if (playing) {
        var s = state;
        var moved = dragX >= 0 ? moveBasket(s, dragX, w) : s;
        var next = step(moved, dt, w, h, theme, api.rnd);
        if (next.lives < s.lives) { api.haptic(60); api.setLives(next.lives); }
        else if (next.score > s.score) api.haptic(10);
        if (next.score !== s.score) api.setScore(next.score);
        state = next;
        if (over(next)) {
          playing = false;
          if (!ended) { ended = true; api.end(next.score); }
        }
      }
      draw();
      if (playing) raf = requestAnimationFrame(frame);
    }

    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#0D3B1E"); bg.addColorStop(1, "#1E8C34");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      // festive tint at the top and the floor line
      var tint = ctx.createLinearGradient(0, 0, 0, h * 0.5);
      tint.addColorStop(0, hexA(f.colors[0], 0.35)); tint.addColorStop(1, hexA(f.colors[0], 0));
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, w, h * 0.5);
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(0, h - 6, w, 6);
      var st = state;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      // the score, big and faint
      ctx.font = "bold " + Math.round(w * 0.28) + "px system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.235)";
      ctx.fillText(String(st.score), w / 2, h * 0.3);
      // falling items
      var item = itemSize(w);
      for (var i = 0; i < st.drops.length; i++) {
        var d = st.drops[i];
        var k = d.hit ? 1 - Math.max(0, Math.min(1, d.age / FADE)) : 1;
        if (k <= 0) continue;
        ctx.globalAlpha = k;
        ctx.fillStyle = "#000";
        ctx.font = Math.max(1, Math.round(item * k)) + "px sans-serif";
        ctx.fillText(d.emoji, d.x, d.y + item * k * 0.35);
        if (d.hit) {
          ctx.strokeStyle = d.good ? "#B9F6C0" : "#FF5252";
          ctx.lineWidth = item * 0.08;
          ctx.beginPath(); ctx.arc(d.x, d.y, item * (1.4 - k * 0.6), 0, Math.PI * 2); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      // the Pili behind her basket
      var bw = basketWidth(w), top = basketY(h), bh = bw * 0.38, r = bw * 0.36;
      var cheer = false;
      for (var j = 0; j < st.drops.length; j++) if (st.drops[j].hit && st.drops[j].good) cheer = true;
      var px = st.basketX, py = top - r * 0.35;
      drawPili(ctx, px, py, r, st.hurt > 0 ? "sad" : cheer ? "cheer" : "happy", prop);
      var left = st.basketX - bw / 2;
      ctx.fillStyle = "#8D6E63";
      ctx.beginPath();
      ctx.moveTo(left, top); ctx.lineTo(left + bw, top); ctx.lineTo(left + bw * 0.86, top + bh); ctx.lineTo(left + bw * 0.14, top + bh);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#5D4037";
      ctx.lineWidth = bh * 0.06;
      for (var n = 1; n <= 3; n++) {
        var y = top + bh * n / 4;
        ctx.beginPath(); ctx.moveTo(left + bw * 0.04 * n, y); ctx.lineTo(left + bw - bw * 0.04 * n, y); ctx.stroke();
      }
      ctx.fillStyle = "#5D4037";
      var rx = left - bw * 0.03, ry = top - bh * 0.08, rw = bw * 1.06, rh = bh * 0.18, rr = bh * 0.09;
      ctx.beginPath();
      ctx.moveTo(rx + rr, ry); ctx.lineTo(rx + rw - rr, ry); ctx.arc(rx + rw - rr, ry + rr, rr, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(rx + rr, ry + rh); ctx.arc(rx + rr, ry + rr, rr, Math.PI / 2, Math.PI * 1.5);
      ctx.closePath(); ctx.fill();
      if (st.hurt > 0) {
        ctx.fillStyle = "rgba(255,23,68," + (0.3 * st.hurt / HURT) + ")";
        ctx.fillRect(0, 0, w, h);
      }
    }

    raf = requestAnimationFrame(frame);

    return {
      stop: function () {
        stopped = true;
        playing = false;
        cancelAnimationFrame(raf);
        cv.removeEventListener("pointerdown", onDown);
        cv.removeEventListener("pointermove", onMove);
        cv.removeEventListener("pointerup", onUp);
        cv.removeEventListener("pointercancel", onUp);
        window.removeEventListener("resize", resize);
        if (cv.parentNode) cv.parentNode.removeChild(cv);
      },
      // for the tests
      _state: function () { return { state: state, w: w, h: h, festivity: fest, ended: ended }; }
    };
  }

  function helpText() {
    var k = today();
    if (!k) return "🔒 Torna-hi per una festa (Castanyada, Nadal, Carnestoltes, Sant Jordi, Sant Joan…)";
    var t = THEMES[k];
    return "Avui és " + FEST[k].title + "! Arrossega la Pili per atrapar " + distinct(t.good).join(" ") +
      " i esquiva " + t.bad.join(" ") + ". Tens 3 vides!";
  }

  var def = {
    id: "temporada",
    title: "Joc de temporada",
    emoji: "🎉",
    help: helpText(),
    lives: LIVES,
    action: true,
    start: start,
    logic: { LIVES: LIVES, FADE: FADE, HURT: HURT, THEMES: THEMES, FEST: FEST, FEST_ORDER: FEST_ORDER,
      festivityOn: festivityOn, easter: easter, festaMajor: festaMajor, today: today, normalise: normalise,
      itemSize: itemSize, basketWidth: basketWidth, basketY: basketY, fallSpeed: fallSpeed,
      dropInterval: dropInterval, badChance: badChance, newState: newState, over: over, spawn: spawn,
      moveBasket: moveBasket, catches: catches, step: step }
  };
  if (VSPG.games && typeof VSPG.games.register === "function") VSPG.games.register(def);
})();
