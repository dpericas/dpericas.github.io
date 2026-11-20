/* Club Vòlei Santpedor — jocs web: «Toquets».
 * Port of the Android app (extras/KeepyUppy.kt + GamePhysics in FunLogic.kt): same physics and scoring.
 * Tap the ball to keep it in the air; the more touches, the faster it falls. No lives: the floor ends it. */
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

  var gk = VSPG.gk;

  // ------------------------------------------------------------------ pure logic (GamePhysics)
  // Units: px of the play field, seconds. A ball is { x, y, vx, vy }.
  var L = {
    /** From this many touches the ball turns into the Pili "rematador". */
    SPIKER_FROM: 20
  };
  L.radius = function (w) { return w * 0.11; };
  L.gravity = function (h, touches) { return h * (1.25 + Math.min(touches, 40) * 0.025); };
  L.start = function (w, h) { return { x: w / 2, y: h * 0.35, vx: 0, vy: 0 }; };

  /** Advances [dt] s; returns null when the ball reaches the floor (game over). */
  L.step = function (b, dt, w, h, touches) {
    var r = L.radius(w);
    var vx = b.vx;
    var vy = b.vy + L.gravity(h, touches) * dt;
    var x = b.x + vx * dt;
    var y = b.y + vy * dt;
    if (x < r) { x = r; vx = -vx * 0.8; }
    if (x > w - r) { x = w - r; vx = -vx * 0.8; }
    if (y > h - r) return null;
    if (y < r && vy < 0) vy = -vy * 0.5;
    return { x: x, y: Math.max(y, r), vx: vx, vy: vy };
  };

  /** A tap: kicks the ball up (and sideways, away from the tap) if it hits; null if it misses. */
  L.kick = function (b, tapX, tapY, w, h, touches) {
    var r = L.radius(w);
    var dx = b.x - tapX;
    var dy = b.y - tapY;
    if (dx * dx + dy * dy > (r * 1.6) * (r * 1.6)) return null;
    var up = Math.sqrt(2 * L.gravity(h, touches) * h * 0.42);
    return { x: b.x, y: b.y, vy: -up, vx: (dx / r) * w * 0.9 + b.vx * 0.3 };
  };
  VSPG.logic.toquets = L;

  // ------------------------------------------------------------------ game
  function start(stage, api) {
    var offs = [];
    var ball = null, touches = 0, playing = true;
    var S = gk.surface(stage, function (ow, oh, w, h) {
      // keep the ball at the same place of the (resized) field
      if (ball) ball = { x: ball.x * w / ow, y: ball.y * h / oh, vx: ball.vx * w / ow, vy: ball.vy * h / oh };
      draw();
    });
    ball = L.start(S.w, S.h);
    api.setScore(0);

    function draw() {
      var c = S.ctx, w = S.w, h = S.h;
      gk.bg(c, w, h);
      gk.text(c, api, w, String(touches), w / 2, 24, 120, "rgba(255,255,255,0.25)", "center", "top");
      // net
      c.fillStyle = "rgba(255,255,255,0.15)";
      c.fillRect(0, h - gk.px(6), w, gk.px(6));
      if (ball) gk.pili(c, ball.x, ball.y, L.radius(w), playing ? "focus" : "sad",
        touches >= L.SPIKER_FROM ? "spiker" : "green");
    }

    function frame(dt) {
      S.fit();
      if (playing && ball) {
        var next = L.step(ball, dt, S.w, S.h, touches);
        if (next === null) {
          playing = false;
          stopLoop();
          draw();
          api.end(touches);
          return;
        }
        ball = next;
      }
      draw();
    }

    gk.on(offs, S.el, "pointerdown", function (ev) {
      ev.preventDefault();
      if (!playing || !ball) return;
      var p = api.point(ev, S.el);
      var k = L.kick(ball, p.x, p.y, S.w, S.h, touches);
      if (k) {
        ball = k; touches++;
        api.setScore(touches);
        api.haptic(10);
      }
    });
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
      state: function () { return { ball: ball, touches: touches, playing: playing, w: S.w, h: S.h }; }
    };
  }

  VSPG.games.register({
    id: "toquets",
    title: "Toquets",
    emoji: "🏐",
    help: "Toca la pilota per mantenir-la a l'aire. Com més toquets, més de pressa cau!",
    lives: 0,
    action: true,
    start: start
  });
})();
