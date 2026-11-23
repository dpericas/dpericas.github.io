/* Club Vòlei Santpedor — jocs web, camí secret: «Ritme de l'afició» (id "sg_ritme").
 * Port of the Android app (extras/SecretRitme.kt + SecretRitmeLogic.kt, 01.48.01): the fans' drum hits
 * scroll down to a hit line; tap when one reaches it. Perfect = +2, good = +1; a missed note or a tap
 * near a note but off time costs a life (one, never two); a tap far from any note costs a point.
 * The tempo goes up every bar (70 → 150 bpm) and the patterns get harder. The bass drum sounds on
 * every tap. Taps are judged at their own moment (event time stamp), not at the last frame. */
(function () {
  "use strict";
  var VSPG = window.VSPG = window.VSPG || {};
  VSPG.sgLogic = VSPG.sgLogic || {};

  // >>> sgk
  // ------------------------------------------------------------------ shared kit of the secret games
  // (identical copy in every sg_*.js: the first file loaded defines it)
  if (!VSPG.sgk) VSPG.sgk = (function () {
    var K = {};
    K.ext = function (s, p) { var o = {}, k; for (k in s) o[k] = s[k]; for (k in p) o[k] = p[k]; return o; };
    K.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
    /** App colours (Effects.kt / Pili.kt) and the darker background of the secret room (SecretFrame). */
    K.C = { green: "#1E8C34", bright: "#3CC24A", dark: "#1C211E", accent: "#B9F6C0", gold: "#FFC107", skin: "#E8B98A",
      bad: "#FF8A80", red: "#FF5252", floor: "#E07B39", bgTop: "#0B1F12", bgBottom: "#173D24" };
    K.rgba = function (hex, a) {
      var n = parseInt(hex.slice(1), 16);
      return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + (a == null ? 1 : a) + ")";
    };
    /** Kotlin's Random.nextInt(n) and shuffled(random) on a float PRNG (api.rnd). */
    K.nextInt = function (rnd, n) { return Math.min(n - 1, Math.floor(rnd() * n)); };
    K.shuffled = function (list, rnd) {
      var a = list.slice();
      for (var i = a.length - 1; i >= 1; i--) { var j = K.nextInt(rnd, i + 1), t = a[i]; a[i] = a[j]; a[j] = t; }
      return a;
    };
    K.now = function () { return (window.performance && performance.now) ? performance.now() : Date.now(); };

    /** A canvas filling [stage], devicePixelRatio aware; [onResize](oldW, oldH, w, h) after a size change. */
    K.surface = function (stage, onResize) {
      var c = document.createElement("canvas");
      c.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:none;" +
        "-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent";
      stage.appendChild(c);
      var ctx = c.getContext("2d");
      var o = { el: c, ctx: ctx, w: 0, h: 0, dpr: 0 };
      o.fit = function () {
        var w = c.parentNode ? (c.parentNode.clientWidth || 1) : 1, h = c.parentNode ? (c.parentNode.clientHeight || 1) : 1;
        var dpr = window.devicePixelRatio || 1;
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

    /**
     * requestAnimationFrame loop: frame(dt, now) with dt in s capped at [opt.cap] (default 0.033) and
     * multiplied by api.speed unless [opt.raw] (games whose clock is the game: Ritme, Cursa). While
     * api.paused (pause overlay of frame.js) nothing advances and the clock restarts on resume.
     * [now] is the frame's timestamp (performance.now() clock). Returns stop().
     */
    K.loop = function (api, frame, opt) {
      opt = opt || {};
      var cap = opt.cap || 0.033, raf = 0, last = -1, alive = true;
      function tick(now) {
        if (!alive) return;
        raf = window.requestAnimationFrame(tick);
        if (api.paused) { last = -1; if (opt.onPaused) opt.onPaused(); return; }
        var dt = last < 0 ? 0 : Math.min(Math.max(0, (now - last) / 1000), cap) * (opt.raw ? 1 : (api.speed || 1));
        last = now;
        frame(dt, now);
      }
      raf = window.requestAnimationFrame(tick);
      return function () { alive = false; window.cancelAnimationFrame(raf); };
    };

    /** addEventListener remembered in [list] (array of remover functions). */
    K.on = function (list, el, type, fn, opts) {
      el.addEventListener(type, fn, opts || false);
      list.push(function () { el.removeEventListener(type, fn, opts || false); });
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
      if (!(r > 0)) return;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      if (stroke) { ctx.strokeStyle = color; ctx.lineWidth = stroke; ctx.stroke(); } else { ctx.fillStyle = color; ctx.fill(); }
    };
    /** Background of the secret games (SecretFrame): very dark green to dark green. */
    K.bg = function (ctx, w, h, top, bottom) {
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, top || K.C.bgTop); g.addColorStop(1, bottom || K.C.bgBottom);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    };
    /** Text at (x, y) of the screen, never mirrored (MIRALL flips the stage, not the texts). */
    K.text = function (ctx, api, w, s, x, y, size, color, align, base) {
      ctx.save();
      ctx.font = "900 " + size + "px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
      ctx.fillStyle = color; ctx.textAlign = align || "center"; ctx.textBaseline = base || "middle";
      if (api && api.mode && api.mode.variant === "MIRALL") { ctx.translate(w - x, y); ctx.scale(-1, 1); ctx.fillText(s, 0, 0); }
      else ctx.fillText(s, x, y);
      ctx.restore();
    };
    /** The Pili (VSPG.drawPili of pili.js; a green circle without it). */
    K.pili = function (ctx, x, y, r, mood, style, rot) {
      if (!(r > 0)) return;
      ctx.save();
      if (VSPG.drawPili) VSPG.drawPili(ctx, x, y, r, { mood: mood, style: style, rot: rot || 0 });
      else K.circle(ctx, x, y, r, K.C.green);
      ctx.restore();
    };
    /** A plain volleyball: white with three green panel lines (drawSgVolleyball of the app). */
    K.ball = function (ctx, x, y, r) {
      if (!(r > 0)) return;
      ctx.save();
      K.circle(ctx, x, y, r, "#fff");
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
      ctx.strokeStyle = K.C.green; ctx.lineWidth = r * 0.16;
      function arc(cx, cy, a0, sweep) { ctx.beginPath(); ctx.arc(cx, cy, r, a0 * Math.PI / 180, (a0 + sweep) * Math.PI / 180); ctx.stroke(); }
      arc(x - r * 0.4, y + r * 0.6, 200, 140);
      arc(x + r * 0.4, y - r * 0.6, 20, 140);
      arc(x + r * 0.8, y + r * 0.8, 100, 140);
      ctx.restore();
      K.circle(ctx, x, y, r, K.rgba(K.C.dark, 0.5), r * 0.1);
    };

    /** Time of a pointer / touch event on the performance.now() clock (precise taps), or now. */
    K.evTime = function (ev) {
      var n = K.now(), t = ev && typeof ev.timeStamp === "number" ? ev.timeStamp : NaN;
      // old engines give an epoch time stamp: then the moment of the handler is the best guess
      return t > 0 && Math.abs(n - t) < 1000 ? t : n;
    };

    // ---------------------------------------------------------------- sound (Web Audio, synthesized)
    /**
     * The games are silent unless they sound; a sound plays only when not muted: VSPG.muted (bool or
     * function, if the framework ever defines it) or localStorage "jocs_mute" = "1".
     */
    var audio = null, buffers = {};
    K.muted = function () {
      try {
        if (typeof VSPG.muted === "function" ? VSPG.muted() : VSPG.muted === true) return true;
        return window.localStorage && window.localStorage.getItem("jocs_mute") === "1";
      } catch (e) { return false; }
    };
    /** The AudioContext, created / resumed (call it from a user gesture: iOS unlocks audio there). */
    K.audio = function () {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        if (!audio) { try { audio = new AC({ latencyHint: "interactive" }); } catch (e) { audio = new AC(); } }
        if (audio.state === "suspended" && audio.resume) audio.resume();
        return audio;
      } catch (e) { return null; }
    };
    /** mulberry32 for the noise of the synthesized sounds (fixed seed: always the same sound). */
    function noise(seed) {
      var a = seed >>> 0;
      return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        var t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    /** Synth.bassDrum of the app (Sounds.kt): a deep, loud bass drum, 0.7 s. Float samples at [rate]. */
    K.bassDrumSamples = function (rate) {
      var len = Math.floor(rate * 0.7), rnd = noise(11), x = new Float32Array(len);
      var phase = 0, low = 0, release = Math.floor(rate / 40);
      for (var i = 0; i < len; i++) {
        var t = i / rate;
        var f = 42 + 98 * Math.exp(-t / 0.035);
        phase += 2 * Math.PI * f / rate;
        var body = Math.sin(phase) * Math.exp(-t / 0.28) + 0.35 * Math.sin(2 * phase) * Math.exp(-t / 0.08);
        low += 0.02 * ((rnd() * 2 - 1) - low);   // low-passed noise: the skin
        var click = (rnd() * 2 - 1) * 0.25 * Math.exp(-t / 0.003);
        var env = i < 1 ? i : (i > len - release ? (len - i) / release : 1);
        x[i] = K.clamp((body + 2.5 * low * Math.exp(-t / 0.12) + click) * env * 0.8, -1, 1);
      }
      return x;
    };
    function buffer(ac, name, make) {
      var b = buffers[name];
      if (!b || b.sampleRate !== ac.sampleRate) {
        var x = make(ac.sampleRate);
        b = buffers[name] = ac.createBuffer(1, x.length, ac.sampleRate);
        if (b.copyToChannel) b.copyToChannel(x, 0); else b.getChannelData(0).set(x);
      }
      return b;
    }
    function play(name, make) {
      if (K.muted()) return false;
      var ac = K.audio();
      if (!ac) return false;
      try {
        var b = buffer(ac, name, make);
        var src = ac.createBufferSource();
        src.buffer = b;
        src.connect(ac.destination);
        src.start(0);
        return true;
      } catch (e) { return false; }
    }
    /** The bass drum, at once (Ritme: it is an instrument, it sounds on every tap). */
    K.bassDrum = function () { return play("bombo", K.bassDrumSamples); };
    /**
     * Gets the bass drum ready: the AudioContext (unlocked if called from a user gesture, e.g. inside the
     * "Juga" click that starts the game) and its samples, so the first tap sounds at once.
     */
    K.warmBassDrum = function () {
      if (K.muted()) return;
      var ac = K.audio();
      if (ac) try { buffer(ac, "bombo", K.bassDrumSamples); } catch (e) {}
    };
    return K;
  })();
  // <<< sgk

  var K = VSPG.sgk;
  var tr = VSPG.t || function (k) { return k; };

  // ------------------------------------------------------------------ pure logic (RitmeLogic)
  // State: { t, notes: [{id, time, hit}], nextBar, bars, nextId, score, lives, combo, last, lastAt, overAt }
  // hit / last: null | "PERFECT" | "GOOD" | "MISS" | "WRONG".
  var L = {
    LIVES: 3,
    /** Seconds a note takes from the top of the lane to the hit line. */
    LEAD: 1.8,
    /** Empty time before the first bar reaches the line. */
    COUNT_IN: 0.6,
    /** Hit windows (s), wide enough for a phone's touch latency. */
    PERFECT: 0.08,
    GOOD: 0.18,
    /** A tap this close to a note but outside GOOD uses that note up as a miss (one life, never two). */
    NEAR: 0.35,
    /** Touch screens report taps a little late: the tap time is moved back this much. */
    LATENCY: 0.03,
    START_BPM: 70,
    MAX_BPM: 150,
    BPM_STEP: 2,
    END_PAUSE: 1.0,
    POINTS: { PERFECT: 2, GOOD: 1, MISS: 0, WRONG: 0 },
    INTRO: ["x...x..."],
    BEATS: ["x.x.x.x.", "x...x.x.", "x.x.x..."],
    EASY: ["x.x.x.x.", "x...x...", "x.x.x...", "x...x.x."],
    MEDIUM: ["x.x.xx..", "xx..x.x.", "x..x..x.", "x.x.x.xx", "xx.xx..."],
    HARD: ["xx.x.xx.", "x.xxx.x.", "xx.xx.xx", "x..xx..x", "xxx.x.x."],
    /** Secret path (SecretPath.kt RITME): star thresholds and score cap. */
    THRESHOLDS: [10, 25, 45, 70, 100],
    CAP: 1000
  };
  L.bpm = function (bars) { return Math.min(L.START_BPM + bars * L.BPM_STEP, L.MAX_BPM); };
  /** Patterns available at bar [bars]: few hits at the start, harder ones little by little. */
  L.patterns = function (bars) {
    if (bars < 4) return L.INTRO;
    if (bars < 8) return L.INTRO.concat(L.BEATS);
    if (bars < 14) return L.EASY;
    if (bars < 22) return L.EASY.concat(L.MEDIUM);
    if (bars < 32) return L.MEDIUM.concat(L.HARD);
    return L.HARD;
  };
  L.judge = function (delta) {
    var a = Math.abs(delta);
    return a <= L.PERFECT ? "PERFECT" : (a <= L.GOOD ? "GOOD" : null);
  };
  L.over = function (s) { return s.lives <= 0; };
  /** Game over and the last feedback has been shown: time to finish. */
  L.ended = function (s) { return s.overAt != null && s.t - s.overAt >= L.END_PAUSE; };
  L.start = function () {
    return { t: 0, notes: [], nextBar: L.LEAD + L.COUNT_IN, bars: 0, nextId: 0, score: 0, lives: L.LIVES, combo: 0,
      last: null, lastAt: -10, overAt: null };
  };

  /** Advances [dt] s: schedules bars ahead, judges the notes that went past the line. rnd() in [0, 1). */
  L.step = function (s, dt, rnd) {
    var t = s.t + dt;
    if (L.over(s)) return K.ext(s, { t: t });
    var lives = s.lives, combo = s.combo, last = s.last, lastAt = s.lastAt;
    var notes = s.notes.map(function (n) {
      if (n.hit == null && t - n.time > L.GOOD && lives > 0) {
        lives--; combo = 0; last = "MISS"; lastAt = t;
        return K.ext(n, { hit: "MISS" });
      }
      return n;
    });
    var nextBar = s.nextBar, bars = s.bars, id = s.nextId;
    while (nextBar < t + L.LEAD + 0.5) {
      var eighth = 30 / L.bpm(bars);
      var list = L.patterns(bars);
      var pattern = list[K.nextInt(rnd, list.length)];
      for (var i = 0; i < pattern.length; i++) {
        if (pattern.charAt(i) === "x") notes.push({ id: id + i, time: nextBar + i * eighth, hit: null });
      }
      id += pattern.length;
      nextBar += 8 * eighth;
      bars++;
    }
    // forget the old ones (kept a little for the hit / miss animation)
    notes = notes.filter(function (n) { return n.time > t - 0.6; });
    return K.ext(s, { t: t, notes: notes, nextBar: nextBar, bars: bars, nextId: id, lives: lives, combo: combo,
      last: last, lastAt: lastAt, overAt: lives <= 0 ? t : null });
  };

  /**
   * A tap at game time [at] (the exact moment of the touch, between two frames; default s.t): the
   * nearest note still to play is judged. Too early / too late but near it: that note is a miss (one
   * life). Far from any note: −1 point and the combo is lost, but no life (a late tap after a note was
   * already missed never costs a second life, and the next notes can always be played).
   */
  L.tap = function (s, at) {
    if (L.over(s)) return s;
    var t = (at == null ? s.t : at) - L.LATENCY;
    var n = null;
    s.notes.forEach(function (o) { if (o.hit == null && (n === null || Math.abs(o.time - t) < Math.abs(n.time - t))) n = o; });
    var delta = n ? t - n.time : null;
    var hit = n ? L.judge(delta) : null;
    if (n && hit) {
      return K.ext(s, { notes: s.notes.map(function (o) { return o.id === n.id ? K.ext(o, { hit: hit }) : o; }),
        score: s.score + L.POINTS[hit], combo: s.combo + 1, last: hit, lastAt: s.t });
    }
    if (n && Math.abs(delta) <= L.NEAR) {
      var lives = s.lives - 1;
      return K.ext(s, { notes: s.notes.map(function (o) { return o.id === n.id ? K.ext(o, { hit: "MISS" }) : o; }),
        lives: lives, combo: 0, last: "MISS", lastAt: s.t, overAt: lives <= 0 ? s.t : null });
    }
    return K.ext(s, { score: Math.max(0, s.score - 1), combo: 0, last: "WRONG", lastAt: s.t });
  };

  /** Position of a note on the lane: 0 = top (it appears), 1 = the hit line, > 1 = past it. */
  L.lane = function (note, t) { return 1 - (note.time - t) / L.LEAD; };
  /** Game time of a tap: the frame's game time plus the time since that frame (s), at most 50 ms either way. */
  L.tapTime = function (frameT, sinceFrame) { return frameT + K.clamp(sinceFrame, -0.05, 0.05); };

  VSPG.sgLogic.ritme = L;

  // ------------------------------------------------------------------ game
  var LINE = 0.8;   // hit line (fraction of the field height)
  var SCARF = [K.C.green, "#fff", K.C.bright, K.C.gold, K.C.accent];

  function start(stage, api) {
    var offs = [];
    var s = L.start(), playing = true, frameNow = -1;
    var S = K.surface(stage, function () { draw(); });
    S.el.setAttribute("role", "button");
    S.el.setAttribute("aria-label", tr("sg.ritme.area"));
    api.setScore(0);
    api.setLives(L.LIVES);
    // start() runs inside the "Juga" click: the audio unlocks there and the drum is ready for the first tap
    K.warmBassDrum();

    function draw() {
      var c = S.ctx, w = S.w, h = S.h, t = s.t;
      K.bg(c, w, h);
      K.text(c, api, w, String(s.score), w / 2, h / 2, 110, "rgba(255,255,255,0.18)");
      var lineY = h * LINE, laneTop = h * 0.16, laneW = Math.min(w * 0.42, h * 0.35), laneX = (w - laneW) / 2;
      // fans: they jump when a hit is played
      var jumpAge = (s.last === "PERFECT" || s.last === "GOOD") ? t - s.lastAt : 9;
      var jump = jumpAge < 0.35 ? Math.exp(-jumpAge * 8) : 0;
      var fans = 7, fr = w / fans * 0.22;
      for (var i = 0; i < fans; i++) {
        var cx = w / fans * (i + 0.5), cy = h * 0.09 - jump * fr * (i % 2 === 0 ? 1.6 : 1.0);
        c.fillStyle = SCARF[i % SCARF.length];
        K.rr(c, cx - fr * 1.1, cy + fr * 0.9, fr * 2.2, fr * 1.6, fr * 0.5); c.fill();
        K.circle(c, cx, cy, fr, K.C.skin);
        var armY = cy + fr * (1.2 - jump * 2.4);
        K.line(c, cx - fr, cy + fr * 1.2, cx - fr * 1.6, armY, K.C.skin, fr * 0.35, true);
        K.line(c, cx + fr, cy + fr * 1.2, cx + fr * 1.6, armY, K.C.skin, fr * 0.35, true);
      }
      // lane and hit zone (good: light, perfect: stronger)
      c.fillStyle = "rgba(255,255,255,0.06)";
      K.rr(c, laneX, laneTop, laneW, h - laneTop, laneW * 0.12); c.fill();
      var span = lineY - laneTop, goodH = span * L.GOOD / L.LEAD, perfH = span * L.PERFECT / L.LEAD;
      c.fillStyle = K.rgba(K.C.accent, 0.12); c.fillRect(laneX, lineY - goodH, laneW, goodH * 2);
      c.fillStyle = K.rgba(K.C.accent, 0.22); c.fillRect(laneX, lineY - perfH, laneW, perfH * 2);
      K.line(c, laneX - 4, lineY, laneX + laneW + 4, lineY, K.C.accent, 3, true);
      // the big drum under the line
      var dr = laneW * 0.32, beat = jumpAge < 0.2 ? 1 + 0.12 * (1 - jumpAge / 0.2) : 1, dy = lineY + dr * 1.25;
      K.circle(c, w / 2, dy, dr * beat, K.C.green);
      K.circle(c, w / 2, dy, dr * beat * 0.8, "#fff");
      K.circle(c, w / 2, dy, dr * beat * 0.8, K.rgba(K.C.dark, 0.3), 2);
      // the drum hits coming down
      var nr = laneW * 0.2;
      s.notes.forEach(function (n) {
        var p = L.lane(n, t);
        if (p < -0.05) return;
        var y = laneTop + p * span, x = w / 2;
        if (n.hit == null) {
          K.circle(c, x, y, nr, K.C.green);
          K.circle(c, x, y, nr * 0.72, "#fff");
          K.line(c, x - nr * 0.5, y - nr * 0.5, x + nr * 0.2, y + nr * 0.1, K.C.dark, nr * 0.14, true);
        } else if (n.hit === "MISS") {
          K.circle(c, x, y, nr * 0.8, K.rgba(K.C.bad, 0.5));
        } else {
          // a burst at the line that fades out
          var age = Math.max(0, t - n.time), a = K.clamp(1 - age / 0.4, 0, 1);
          if (a > 0) K.circle(c, x, lineY, nr * (1 + age * 3), K.rgba(n.hit === "PERFECT" ? K.C.gold : K.C.accent, a), 4);
        }
      });
      // feedback and streak
      if (s.last && t - s.lastAt < 0.5 && playing) {
        var txt = { PERFECT: tr("sg.perfect"), GOOD: tr("sg.good"), MISS: tr("sg.miss"), WRONG: tr("sg.wrong") }[s.last];
        var col = s.last === "PERFECT" ? K.C.accent : (s.last === "GOOD" ? "#fff" : K.C.bad);
        K.text(c, api, w, txt, w / 2, h / 2 + 80, Math.min(28, w / 14), col);
      }
      if (s.combo >= 4 && playing) K.text(c, api, w, tr("sg.combo", s.combo), w - 12, 14, 16, K.C.gold, "right", "top");
    }

    function frame(dt, now) {
      S.fit();
      if (playing) {
        var before = s;
        s = L.step(s, dt, api.rnd);
        frameNow = now;
        if (s.lives < before.lives) { api.setLives(s.lives); api.haptic(40); }
        if (L.ended(s)) {
          playing = false;
          stopLoop();
          draw();
          api.end(Math.min(s.score, L.CAP));
          return;
        }
      }
      draw();
    }

    function tap(ev) {
      if (!playing || L.over(s) || api.paused) return;
      // the bass drum sounds on every tap, at once (it is an instrument)
      K.bassDrum();
      var since = frameNow < 0 ? 0 : (K.evTime(ev) - frameNow) / 1000;
      var before = s;
      s = L.tap(s, L.tapTime(s.t, since));
      if (s.score !== before.score) api.setScore(s.score);
      if (s.lives !== before.lives) api.setLives(s.lives);
      api.haptic(L.POINTS[s.last] > 0 ? 10 : 40);
    }

    K.on(offs, S.el, "pointerdown", function (ev) {
      ev.preventDefault();
      if (ev.button != null && ev.button > 0) return;
      tap(ev);
    });
    K.on(offs, S.el, "contextmenu", function (ev) { ev.preventDefault(); });
    // older iOS only unlocks the audio at the end of a touch
    K.on(offs, S.el, "pointerup", function () { if (!K.muted()) K.audio(); });
    // keyboard: Space / Enter also hit the drum (desktop)
    K.on(offs, document, "keydown", function (ev) {
      if (ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.target && /^(BUTTON|INPUT|SELECT|TEXTAREA|A)$/.test(ev.target.tagName || "")) return;
      if (ev.key === " " || ev.key === "Enter" || ev.key === "Spacebar") { ev.preventDefault(); tap(ev); }
    });

    draw();
    // the rhythm is the game: no TURBO scaling of the clock, frames up to 50 ms (app: coerceAtMost(0.05f))
    var stopLoop = K.loop(api, frame, { raw: true, cap: 0.05, onPaused: function () { frameNow = -1; } });
    return {
      stop: function () {
        playing = false;
        stopLoop();
        while (offs.length) offs.pop()();
        S.destroy();
      },
      /** For tests. */
      state: function () { return s; },
      tap: tap
    };
  }

  if (VSPG.GESTURES && !VSPG.GESTURES.sg_ritme) VSPG.GESTURES.sg_ritme = ["🥁", "sg.ritme.g"];
  if (VSPG.games) VSPG.games.register({
    id: "sg_ritme",
    title: tr("sg.ritme.title"),
    emoji: "🥁",
    help: tr("sg.ritme.help"),
    lives: L.LIVES,
    action: true,
    start: start
  });
})();
