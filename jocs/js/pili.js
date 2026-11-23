/* El camí de la Pili (web) — the Pili, the club mascot, drawn on a <canvas>: a green-and-black
 * volleyball (three groups of curved panels meeting at the centre) with a face. Port of
 * extras/Pili.kt of the Android app (same 200×200 design units: ball centre 100,100, radius 80).
 *
 *   VSPG.drawPili(ctx, x, y, r, { mood, rot, style, prop, blink, shadow })
 *     mood:  "happy" | "focus" | "wink" | "sad" | "cheer" | "wow" | "sleep"   (default "happy")
 *     rot:   radians, the whole drawing turns around (x, y)
 *     style: "green" (default) | "spiker" (headband) | "stripes" | "champion" (arms, shoes, stars)
 *     prop:  festivity costume: "santa" | "bunny" | "mask" | "rose" | "chestnuts" | "party" | "sparkler" | "senyera" | "glasses"
 *     shadow: true draws the shadow under her (mascot use, not for a flying ball)
 *   VSPG.setupCanvas(canvas, w, h) -> ctx scaled for devicePixelRatio (CSS px units)
 *   VSPG.piliWidget(el, size, opts) -> { set(opts), stop() }: an animated Pili (bounce + blink) in el
 */
(function () {
  "use strict";
  var VSPG = window.VSPG = window.VSPG || {};

  var GREEN = "#1E8C34", BRIGHT = "#3CC24A", DARK = "#1C211E", ACCENT = "#B9F6C0", W = "#FFFFFF";
  var INK = "#263238", PINK = "rgba(244,143,177,0.75)", PINK_SOLID = "#F48FB1", TONGUE = "#EF6F8A";
  var GOLD = "#FCDD09", RED = "#C8102E";

  var PANELS = {
    green: [[W, GREEN], [DARK, W], [W]],
    stripes: [[GREEN, DARK], [DARK, GREEN], [W]],
    champion: [[GREEN, DARK], [DARK, GREEN], [W]],
    spiker: [[GREEN, W], [W, DARK], [W]]
  };

  /** Festivity (VSPG.festivityOn) -> costume (PiliLook.propFor). */
  VSPG.propFor = function (fest) {
    return { NADAL: "santa", PASQUA: "bunny", CARNAVAL: "mask", SANT_JORDI: "rose", CASTANYADA: "chestnuts",
      FESTA_MAJOR: "party", SANT_JOAN: "sparkler", DIADA: "senyera" }[fest] || null;
  };

  function rad(a) { return a * Math.PI / 180; }

  VSPG.drawPili = function (ctx, x, y, r, opts) {
    opts = opts || {};
    var mood = opts.mood || "happy", style = PANELS[opts.style] ? opts.style : "green", prop = opts.prop || null;
    var s = r / 80;
    if (!(s > 0)) return;
    ctx.save();
    ctx.translate(x, y);
    if (opts.rot) ctx.rotate(opts.rot);
    ctx.scale(s, s);
    ctx.translate(-100, -100);
    ctx.lineJoin = "round";

    function path(p, close) {
      ctx.beginPath(); ctx.moveTo(p[0], p[1]);
      for (var i = 2; i + 3 < p.length; i += 4) ctx.quadraticCurveTo(p[i], p[i + 1], p[i + 2], p[i + 3]);
      if (close) ctx.closePath();
    }
    function line(p, width, color) { path(p, false); ctx.lineCap = "round"; ctx.lineWidth = width; ctx.strokeStyle = color || INK; ctx.stroke(); }
    function filled(p, color) { path(p, true); ctx.fillStyle = color; ctx.fill(); }
    function seg(x1, y1, x2, y2, width, color, butt) {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineCap = butt ? "butt" : "round"; ctx.lineWidth = width; ctx.strokeStyle = color || INK; ctx.stroke();
    }
    function oval(cx, cy, rx, ry, color, stroke) {
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (stroke) { ctx.lineWidth = stroke; ctx.strokeStyle = color; ctx.stroke(); } else { ctx.fillStyle = color; ctx.fill(); }
    }
    function circle(cx, cy, rr, color, stroke) { oval(cx, cy, rr, rr, color, stroke); }
    function eye(ex, ey, size) {
      if (opts.blink) { line([ex - size, ey, ex, ey + size * 0.6, ex + size, ey], 5); return; }
      oval(ex, ey, size, size * 1.25, INK);
      circle(ex + size * 0.35, ey - size * 0.45, size * 0.38, W);
    }
    function cheeks() { oval(64, 128, 9, 6, PINK); oval(136, 128, 9, 6, PINK); }
    function rotateAbout(deg, px, py, fn) { ctx.save(); ctx.translate(px, py); ctx.rotate(rad(deg)); ctx.translate(-px, -py); fn(); ctx.restore(); }
    function star(cx, cy, rr, fill) {
      ctx.beginPath();
      ctx.moveTo(cx, cy - rr); ctx.lineTo(cx + rr * 0.3, cy - rr * 0.3); ctx.lineTo(cx + rr, cy); ctx.lineTo(cx + rr * 0.3, cy + rr * 0.3);
      ctx.lineTo(cx, cy + rr); ctx.lineTo(cx - rr * 0.3, cy + rr * 0.3); ctx.lineTo(cx - rr, cy); ctx.lineTo(cx - rr * 0.3, cy - rr * 0.3); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = rr * 0.2; ctx.strokeStyle = INK; ctx.stroke();
    }

    // --- behind the ball
    if (opts.shadow) oval(100, 194, 52, 7, "rgba(0,0,0,0.12)");
    if (style === "champion") {
      line([30, 118, 12, 96, 16, 70], 7); line([170, 118, 188, 96, 184, 70], 7);
      [16, 184].forEach(function (hx) { circle(hx, 66, 8, W); circle(hx, 66, 8, INK, 4); });
    }
    if (style === "spiker") {
      [[2, 84, 20, 86], [-4, 108, 16, 108], [4, 132, 22, 128]].forEach(function (l) { seg(l[0], l[1], l[2], l[3], 5, "rgba(30,140,52,0.85)"); });
    }
    if (prop === "bunny") {
      [[72, -14], [128, 14]].forEach(function (e) {
        rotateAbout(e[1], e[0], 30, function () {
          oval(e[0], 18, 14, 32, W); oval(e[0], 18, 14, 32, INK, 3.5); oval(e[0], 18, 7, 22, PINK_SOLID);
        });
      });
    }

    // --- the ball
    circle(100, 100, 80, W);
    var rot = style === "spiker" ? 72 : 60;
    var curve = style === "stripes" ? 30 : 24;
    var rc = 150, edges = [42, 82, 122];
    var seams = [90, 210, 330].map(function (a) { return a + rot; });
    function p(a, d) { return [100 + d * Math.cos(rad(a)), 100 + d * Math.sin(rad(a))]; }
    var panels = PANELS[style];
    var seamColor = (style === "stripes" || style === "champion") ? W : INK;
    ctx.save();
    ctx.beginPath(); ctx.arc(100, 100, 80, 0, Math.PI * 2); ctx.clip();
    for (var k = 0; k < 3; k++) {
      var a1 = seams[k], a2 = seams[(k + 1) % 3];
      if (a2 < a1) a2 += 360;
      var q1 = p(a1 + curve, 55), p1 = p(a1, 200), q2 = p(a2 + curve, 55), p2 = p(a2, 200), far = p((a1 + a2) / 2, 320);
      var centre = p((a1 + a2) / 2, rc);
      var bounds = [0].concat(edges.map(function (e) { return rc - 80 + e; })).concat([rc + 100]);
      ctx.save();
      ctx.beginPath(); ctx.moveTo(100, 100); ctx.quadraticCurveTo(q1[0], q1[1], p1[0], p1[1]); ctx.lineTo(far[0], far[1]);
      ctx.lineTo(p2[0], p2[1]); ctx.quadraticCurveTo(q2[0], q2[1], 100, 100); ctx.closePath(); ctx.clip();
      var cols = panels[k];
      for (var i = 0; i < bounds.length - 1; i++) circle(centre[0], centre[1], (bounds[i] + bounds[i + 1]) / 2, cols[i % cols.length], bounds[i + 1] - bounds[i] + 0.6);
      edges.forEach(function (e) { circle(centre[0], centre[1], rc - 80 + e, seamColor, 2.4); });
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(100, 100); ctx.quadraticCurveTo(q1[0], q1[1], p1[0], p1[1]); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.lineCap = "butt"; ctx.stroke();
    }
    ctx.restore();
    var g = ctx.createRadialGradient(78, 74, 0, 78, 74, 130);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.5, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.18)");
    circle(100, 100, 80, g);
    var h = ctx.createRadialGradient(74, 68, 0, 74, 68, 36);
    h.addColorStop(0, "rgba(255,255,255,0.85)"); h.addColorStop(1, "rgba(255,255,255,0)");
    circle(100, 100, 80, h);
    circle(100, 100, 80, INK, 5);

    // --- costume behind the face
    if (prop === "mask") {
      filled([58, 112, 64, 94, 100, 102, 136, 94, 142, 112, 136, 128, 100, 120, 64, 128, 58, 112], "#7B1FA2");
      circle(100, 106, 4, ACCENT);
      line([140, 100, 156, 70, 150, 50], 4, "#E91E63"); line([146, 104, 168, 82, 170, 60], 4, "#00BCD4");
    }

    // --- face
    switch (mood) {
      case "wink":
        eye(78, 112, 9); line([112, 113, 122, 104, 132, 113], 5); cheeks();
        filled([84, 131, 100, 150, 116, 131], INK); filled([93, 139, 100, 152, 108, 139], TONGUE);
        break;
      case "cheer":
        line([70, 113, 78, 103, 86, 113], 5); line([114, 113, 122, 103, 130, 113], 5); cheeks();
        filled([80, 126, 100, 156, 120, 126], INK); filled([90, 141, 100, 152, 110, 141, 100, 137, 90, 141], TONGUE);
        break;
      case "focus":
        eye(80, 116, 8); eye(120, 116, 8);
        seg(66, 100, 90, 108, 6); seg(134, 100, 110, 108, 6); seg(88, 138, 112, 136, 5);
        break;
      case "sad":
        eye(78, 114, 8); eye(122, 114, 8);
        seg(66, 102, 86, 98, 4); seg(134, 102, 114, 98, 4);
        line([86, 140, 100, 128, 114, 140], 5);
        filled([132, 122, 127, 131, 132, 134, 137, 131, 132, 122], "#7CC4F2");
        break;
      case "wow":
        eye(78, 110, 10); eye(122, 110, 10); cheeks(); oval(100, 138, 8, 10, INK);
        break;
      case "sleep":
        line([70, 114, 78, 120, 86, 114], 5); line([114, 114, 122, 120, 130, 114], 5); cheeks();
        oval(100, 134, 5, 4, INK);
        seg(150, 30, 162, 30, 3.5); seg(162, 30, 150, 44, 3.5); seg(150, 44, 162, 44, 3.5);
        break;
      default:
        eye(78, 112, 9); eye(122, 112, 9); cheeks(); line([84, 132, 100, 148, 116, 132], 5);
    }

    // --- costume over the face / around
    if (prop === "santa") {
      filled([40, 56, 90, 0, 168, -6, 160, 30, 150, 50, 100, 30, 40, 56], "#D32F2F");
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(34, 40, 132, 20, 10); else ctx.rect(34, 40, 132, 20);
      ctx.fillStyle = W; ctx.fill();
      circle(168, -6, 11, W);
    } else if (prop === "party") {
      ctx.save();
      ctx.beginPath(); ctx.moveTo(76, 34); ctx.lineTo(100, -24); ctx.lineTo(124, 34); ctx.closePath();
      ctx.fillStyle = GREEN; ctx.fill(); ctx.clip();
      for (var j = 0; j < 4; j++) seg(70, 30 - j * 16, 130, 18 - j * 16, 6, DARK, true);
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(76, 34); ctx.lineTo(100, -24); ctx.lineTo(124, 34); ctx.closePath();
      ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
      circle(100, -26, 7, BRIGHT);
    } else if (prop === "rose") {
      line([158, 176, 168, 150, 162, 128], 4, "#2E7D32");
      oval(170, 152.5, 8, 4.5, "#43A047");
      circle(162, 122, 13, "#C62828"); circle(160, 119, 8, "#E53935");
      line([155, 120, 162, 112, 168, 121], 2.5, "#8E0000");
    } else if (prop === "chestnuts") {
      ctx.beginPath(); ctx.moveTo(140, 150); ctx.lineTo(184, 140); ctx.lineTo(170, 196); ctx.closePath();
      ctx.fillStyle = "#F5E6C8"; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
      [[150, 142], [164, 136], [176, 138]].forEach(function (c) { circle(c[0], c[1], 8, "#6D4C41"); circle(c[0] - 2, c[1] - 3, 3, "#A1887F"); });
    } else if (prop === "sparkler") {
      seg(150, 176, 176, 112, 4, "#9E9E9E");
      for (var n = 0; n < 10; n++) {
        var a = rad(n * 36);
        seg(176, 112, 176 + 16 * Math.cos(a), 112 + 16 * Math.sin(a), 3, n % 2 === 0 ? "#FFB300" : "#FF7043");
      }
    } else if (prop === "senyera") {
      seg(168, 190, 168, 92, 4, "#795548");
      ctx.fillStyle = GOLD; ctx.fillRect(168, 92, 40, 28);
      ctx.fillStyle = RED; for (var m = 0; m < 4; m++) ctx.fillRect(168, 95 + m * 6.6, 40, 3.3);
      ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.strokeRect(168, 92, 40, 28);
    } else if (prop === "glasses") {
      circle(78, 112, 16, INK, 4); circle(122, 112, 16, INK, 4);
      seg(94, 110, 106, 110, 4, INK, true); seg(62, 108, 44, 102, 4); seg(138, 108, 156, 102, 4);
      filled([84, 138, 92, 130, 100, 136, 108, 130, 116, 138, 100, 146, 84, 138], "#E0E0E0");
    }

    // --- in front of the ball
    if (style === "champion") {
      seg(84, 176, 80, 194, 7); seg(116, 176, 120, 194, 7);
      filled([66, 196, 66, 186, 80, 188, 90, 198, 80, 199, 66, 196], GREEN);
      filled([134, 196, 134, 186, 120, 188, 110, 198, 120, 199, 134, 196], GREEN);
      star(30, 28, 11, BRIGHT); star(172, 30, 9, BRIGHT); star(18, 150, 7, BRIGHT);
    } else if (style === "spiker" && (!prop || prop === "rose" || prop === "chestnuts" || prop === "sparkler" || prop === "senyera")) {
      rotateAbout(-8, 100, 60, function () {
        for (var b = 0; b < 9; b++) { ctx.fillStyle = b % 2 === 0 ? GREEN : DARK; ctx.fillRect(34 + b * 132 / 9, 52, 132 / 9 + 0.4, 15); }
        ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.strokeRect(34, 52, 132, 15);
      });
    }
    ctx.restore();
  };

  /** Sizes a canvas for the screen density; returns its 2D context in CSS pixels. */
  VSPG.setupCanvas = function (canvas, w, h) {
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  };

  var reduced = false;
  try { reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  /** An animated Pili (gentle bounce, blinks now and then) of [size] CSS px inside [el]. */
  VSPG.piliWidget = function (el, size, opts) {
    opts = opts || {};
    var c = document.createElement("canvas");
    c.className = "pili-canvas";
    c.setAttribute("role", "img");
    c.setAttribute("aria-label", opts.label || (VSPG.t ? VSPG.t("pili.aria") : "La Pili"));
    el.appendChild(c);
    var ctx = VSPG.setupCanvas(c, size, size);
    var t0 = Date.now(), nextBlink = t0 + 2500 + Math.random() * 3000, raf = 0, alive = true;
    function frame() {
      if (!alive) return;
      if (!c.isConnected) { alive = false; return; }
      var now = Date.now();
      var t = reduced ? 0.5 : (Math.sin((now - t0) / 700 * Math.PI) + 1) / 2;
      var blink = false;
      if (!reduced && now > nextBlink) { blink = true; if (now > nextBlink + 130) nextBlink = now + 2500 + Math.random() * 3000; }
      var r = size * 0.36;
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      // a little squash when she lands (t = 0 is the lowest point)
      var sy = 1 - 0.04 * (1 - t), sx = 1 + 0.03 * (1 - t);
      ctx.translate(size / 2, size * 0.85); ctx.scale(sx, sy); ctx.translate(-size / 2, -size * 0.85);
      VSPG.drawPili(ctx, size / 2, size / 2 + r * 0.05 + (0.5 - t) * r * 0.1, r, {
        mood: opts.mood, style: opts.style, prop: opts.prop, blink: blink, shadow: opts.shadow !== false
      });
      ctx.restore();
      raf = requestAnimationFrame(frame);
    }
    frame();
    return {
      canvas: c,
      set: function (o) { for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) opts[k] = o[k]; },
      stop: function () { alive = false; cancelAnimationFrame(raf); }
    };
  };
})();
