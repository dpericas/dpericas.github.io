/* Club Vòlei Santpedor — jocs web: «Recepció».
 * Port of the Android app (extras/Reception.kt + ReceptionLogic in GamesLogic.kt): same rules and scoring.
 * Balls are served from the top; drag the forearms along the bottom to receive them. 3 misses end it. */
(function () {
  "use strict";
  var VSPG = window.VSPG = window.VSPG || {};
  VSPG.logic = VSPG.logic || {};

  // ------------------------------------------------------------------ shared drawing kit
  // (identical copy in toquets/recepcio/bloqueig/servei/colocacio.js: the first file loaded defines it)
  if (!VSPG.gk) VSPG.gk = (function () {
    var K = {};
    K.ext = function (s, p) { var o = {}, k; for (k in s) o[k] = s[k]; for (k in p) o[k] = p[k]; return o; };
    K.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
    /** The app draws in device pixels: a fixed size of n device px is n / devicePixelRatio CSS px. */
    K.px = function (n) { return n / (window.devicePixelRatio || 1); };
    K.rgba = function (hex, a) {
      var n = parseInt(hex.slice(1), 16);
      return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + (a == null ? 1 : a) + ")";
    };
    K.C = { green: "#1E8C34", dark: "#1C211E", accent: "#B9F6C0", skin: "#E8B98A", bad: "#FF8A80", bgTop: "#0D3B1E" };

    /** A canvas filling [stage], devicePixelRatio aware; [onResize](oldW, oldH, w, h) after a size change. */
    K.surface = function (stage, onResize) {
      var c = document.createElement("canvas");
      c.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:none;" +
        "-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent";
      stage.appendChild(c);
      var ctx = c.getContext("2d");
      var o = { el: c, ctx: ctx, w: 0, h: 0, dpr: 0 };
      o.fit = function () {
        var w = stage.clientWidth || 1, h = stage.clientHeight || 1, dpr = window.devicePixelRatio || 1;
        if (w === o.w && h === o.h && dpr === o.dpr) return false;
        var ow = o.w, oh = o.h;
        o.w = w; o.h = h; o.dpr = dpr;
        c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (ow && onResize) onResize(ow, oh, w, h);
        return true;
      };
      o.fit();
      var ro = null;
      if (window.ResizeObserver) { ro = new window.ResizeObserver(function () { o.fit(); }); ro.observe(stage); }
      window.addEventListener("resize", o.fit, false);
      o.destroy = function () {
        if (ro) ro.disconnect();
        window.removeEventListener("resize", o.fit, false);
        if (c.parentNode) c.parentNode.removeChild(c);
      };
      return o;
    };

    /** requestAnimationFrame loop: frame(dt) with dt in s, capped at 0.033 and multiplied by api.speed. Returns stop(). */
    K.loop = function (api, frame) {
      var raf = 0, last = -1, alive = true;
      function tick(now) {
        if (!alive) return;
        var dt = last < 0 ? 0 : Math.min(Math.max(0, (now - last) / 1000), 0.033) * (api.speed || 1);
        last = now;
        raf = window.requestAnimationFrame(tick);
        frame(dt);
      }
      raf = window.requestAnimationFrame(tick);
      return function () { alive = false; window.cancelAnimationFrame(raf); };
    };

    /** addEventListener remembered in [list] (array of remover functions). */
    K.on = function (list, el, type, fn) {
      el.addEventListener(type, fn, false);
      list.push(function () { el.removeEventListener(type, fn, false); });
    };

    K.rr = function (ctx, x, y, w, h, r) {
      r = Math.max(0, Math.min(r, w / 2, h / 2));
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };
    K.line = function (ctx, x0, y0, x1, y1, color, width, round) {
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = round ? "round" : "butt"; ctx.stroke();
    };
    K.circle = function (ctx, x, y, r, color, stroke) {
      if (r <= 0) return;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      if (stroke) { ctx.strokeStyle = color; ctx.lineWidth = stroke; ctx.stroke(); } else { ctx.fillStyle = color; ctx.fill(); }
    };
    /** Game background (GameFrame of the app): dark green to club green. */
    K.bg = function (ctx, w, h) {
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, K.C.bgTop); g.addColorStop(1, K.C.green);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    };
    /** Text at (x, y) of the screen, never mirrored (MIRALL flips the stage, not the texts). */
    K.text = function (ctx, api, w, s, x, y, size, color, align, base) {
      ctx.save();
      ctx.font = "900 " + size + "px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
      ctx.fillStyle = color; ctx.textAlign = align || "center"; ctx.textBaseline = base || "middle";
      if (api.mode && api.mode.variant === "MIRALL") { ctx.translate(w - x, y); ctx.scale(-1, 1); ctx.fillText(s, 0, 0); }
      else ctx.fillText(s, x, y);
      ctx.restore();
    };
    /** The Pili ball (moods of the contract: happy, focus, wink, sad, cheer; [style] is only a hint). */
    K.pili = function (ctx, x, y, r, mood, style) {
      if (!(r > 0)) return;
      ctx.save();
      if (VSPG.drawPili) VSPG.drawPili(ctx, x, y, r, { mood: mood, style: style });
      else K.circle(ctx, x, y, r, K.C.green);
      ctx.restore();
    };
    return K;
  })();

  var gk = VSPG.gk, ext = gk.ext, clamp = gk.clamp;

  // ------------------------------------------------------------------ pure logic (ReceptionLogic)
  // Units: px, seconds. A serve is { x, y, vx, vy, received, age }; received balls fly up and fade for FADE s.
  var L = { LIVES: 3, FADE: 0.7 };
  L.radius = function (w) { return w * 0.06; };
  L.paddleWidth = function (w) { return w * 0.28; };
  /** Top of the forearms (the contact line). */
  L.paddleY = function (h) { return h * 0.9; };
  /** Falling speed (px/s): faster with every reception, capped. */
  L.fallSpeed = function (h, score) { return h * (0.32 + Math.min(score, 60) * 0.012); };
  /** Seconds between serves: shorter with the score, never below 0.7 s. */
  L.serveInterval = function (score) { return Math.max(0.7, 2.2 - score * 0.04); };

  L.state = function (p) { return ext({ balls: [], paddleX: 0, score: 0, lives: L.LIVES, nextServe: 0.6 }, p || {}); };
  L.over = function (s) { return s.lives <= 0; };
  L.start = function (w) { return L.state({ paddleX: w / 2 }); };
  L.ball = function (x, y, vx, vy) { return { x: x, y: y, vx: vx, vy: vy, received: false, age: 0 }; };

  /** A new serve at a random x and angle (the ball always lands inside the court). */
  L.serve = function (w, h, score, rnd) {
    var r = L.radius(w);
    var x = r + rnd() * (w - 2 * r);
    var vy = L.fallSpeed(h, score);
    var travel = (L.paddleY(h) + r) / vy;
    var target = r + rnd() * (w - 2 * r);
    return L.ball(x, -r, (target - x) / travel, vy);
  };

  L.movePaddle = function (s, x, w) {
    var half = L.paddleWidth(w) / 2;
    return ext(s, { paddleX: clamp(x, half, w - half) });
  };

  /** True if the falling ball touches the forearms this frame. */
  L.catches = function (b, paddleX, w, h) {
    var r = L.radius(w);
    var top = L.paddleY(h);
    return !b.received && b.vy > 0 && b.y + r >= top && b.y - r <= top + r &&
      Math.abs(b.x - paddleX) <= L.paddleWidth(w) / 2 + r * 0.5;
  };

  /** Advances [dt] s: moves the balls, receptions (+1), misses (-1 life) and new serves. */
  L.step = function (s, dt, w, h, rnd) {
    if (L.over(s)) return s;
    var r = L.radius(w);
    var score = s.score, lives = s.lives, balls = [], i;
    for (i = 0; i < s.balls.length; i++) {
      var b = s.balls[i];
      if (b.received) {
        var age = b.age + dt;
        if (age < L.FADE) balls.push(ext(b, { x: b.x + b.vx * dt, y: b.y + b.vy * dt, vy: b.vy + h * 1.2 * dt, age: age }));
        continue;
      }
      var x = b.x + b.vx * dt;
      var vx = b.vx;
      if (x < r) { x = r; vx = -vx; }
      if (x > w - r) { x = w - r; vx = -vx; }
      var moved = ext(b, { x: x, y: b.y + b.vy * dt, vx: vx });
      if (L.catches(moved, s.paddleX, w, h)) {
        score++;
        var side = clamp((moved.x - s.paddleX) / (L.paddleWidth(w) / 2), -1, 1);
        balls.push(ext(moved, { vx: side * w * 0.8, vy: -h * 1.1, received: true, age: 0 }));
      } else if (moved.y - r > h) lives--;
      else balls.push(moved);
    }
    var next = s.nextServe - dt;
    if (next <= 0 && lives > 0) {
      balls.push(L.serve(w, h, score, rnd));
      next = L.serveInterval(score);
    }
    return ext(s, { balls: balls, score: score, lives: Math.max(0, lives), nextServe: next });
  };
  VSPG.logic.recepcio = L;

  // ------------------------------------------------------------------ game
  function start(stage, api) {
    var offs = [], rnd = api.rnd;
    var playing = true, pressed = false;
    var S = gk.surface(stage, function (ow, oh, w, h) {
      // keep the balls and the forearms at the same place of the (resized) field
      var fx = w / ow, fy = h / oh;
      state = ext(state, {
        paddleX: state.paddleX * fx,
        balls: state.balls.map(function (b) { return ext(b, { x: b.x * fx, vx: b.vx * fx, y: b.y * fy, vy: b.vy * fy }); })
      });
      paddleX = paddleX * fx;
      draw();
    });
    var state = L.start(S.w);
    var paddleX = S.w / 2;
    api.setScore(0); api.setLives(L.LIVES);

    function draw() {
      var c = S.ctx, w = S.w, h = S.h, C = gk.C;
      var r = L.radius(w);
      gk.bg(c, w, h);
      gk.text(c, api, w, String(state.score), w / 2, 24, 110, "rgba(255,255,255,0.25)", "center", "top");
      // court: floor line and attack line
      c.fillStyle = "rgba(255,255,255,0.15)"; c.fillRect(0, h - gk.px(6), w, gk.px(6));
      c.fillStyle = "rgba(255,255,255,0.08)"; c.fillRect(0, h * 0.33, w, gk.px(3));
      for (var i = 0; i < state.balls.length; i++) {
        var b = state.balls[i];
        if (b.received) {
          var k = clamp(b.age / L.FADE, 0, 1);
          gk.circle(c, b.x, b.y, r * (1 + k * 1.8), gk.rgba(C.accent, 1 - k), r * 0.18);
          gk.pili(c, b.x, b.y, r * (1 - k * 0.7), "happy", "green");
        } else gk.pili(c, b.x, b.y, r, "focus", "green");
      }
      // the forearms: two arms joined (platform) with dark sleeves at the ends
      var pw = L.paddleWidth(w), top = L.paddleY(h), armH = r * 0.75, left = state.paddleX - pw / 2;
      c.fillStyle = C.skin; gk.rr(c, left, top, pw, armH, armH / 2); c.fill();
      gk.line(c, state.paddleX, top + armH * 0.15, state.paddleX, top + armH * 0.85, "#B98660", gk.px(2));
      c.fillStyle = C.dark;
      gk.rr(c, left - pw * 0.08, top - armH * 0.1, pw * 0.2, armH * 1.2, armH / 3); c.fill();
      gk.rr(c, left + pw * 0.88, top - armH * 0.1, pw * 0.2, armH * 1.2, armH / 3); c.fill();
    }

    function frame(dt) {
      S.fit();
      if (!playing) return;
      var s = state;
      var moved = L.movePaddle(s, paddleX, S.w);
      var next = L.step(moved, dt, S.w, S.h, rnd);
      if (next.score > s.score || next.lives < s.lives) api.haptic(10);
      if (next.score !== s.score) api.setScore(next.score);
      if (next.lives !== s.lives) api.setLives(next.lives);
      state = next;
      draw();
      if (L.over(next)) {
        playing = false;
        stopLoop();
        api.end(next.score);
      }
    }

    function move(ev) {
      if (!playing) return;
      paddleX = api.point(ev, S.el).x;
    }
    gk.on(offs, S.el, "pointerdown", function (ev) {
      ev.preventDefault();
      pressed = true;
      try { S.el.setPointerCapture(ev.pointerId); } catch (e) { /* not supported */ }
      move(ev);
    });
    gk.on(offs, S.el, "pointermove", function (ev) {
      if (pressed || ev.pointerType === "touch" || ev.pointerType === "pen") { ev.preventDefault(); move(ev); }
    });
    var up = function () { pressed = false; };
    gk.on(offs, S.el, "pointerup", up);
    gk.on(offs, S.el, "pointercancel", up);
    gk.on(offs, S.el, "contextmenu", function (ev) { ev.preventDefault(); });

    draw();
    var stopLoop = gk.loop(api, frame);
    return {
      stop: function () {
        playing = false;
        stopLoop();
        while (offs.length) offs.pop()();
        S.destroy();
      },
      /** For tests. */
      state: function () { return { s: state, playing: playing, w: S.w, h: S.h }; }
    };
  }

  VSPG.games.register({
    id: "recepcio",
    title: "Recepció",
    emoji: "🙌",
    help: "Arrossega el dit per moure els braços i rep les pilotes. Cada cop serveixen més fort. Si se t'escapen 3, s'acaba!",
    lives: L.LIVES,
    action: true,
    start: start
  });
})();
