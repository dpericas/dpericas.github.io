/* 🖼️ Match poster of the club web (like the app's share/ClubImages.poster): a picture in the club
 * colours with the team, the rival, the day, the time, the hall and the Pili, to share on WhatsApp or
 * Instagram. Post (1080 × 1350) or story (1080 × 1920). Drawn in the browser; nothing is uploaded.
 */
(function () {
  "use strict";
  var GREEN = "#1e8c34", DARK = "#0f1512", MINT = "#b9f6c0", WHITE = "#ffffff";

  function loadImg(src) {
    return new Promise(function (ok) {
      var i = new Image();
      i.onload = function () { ok(i); }; i.onerror = function () { ok(null); };
      i.src = src;
    });
  }
  /** The Pili of the header (inline SVG of index.html), as a picture. */
  function piliImg() {
    var svg = document.querySelector("header.hero svg.pili");
    if (!svg) return Promise.resolve(null);
    var s = new XMLSerializer().serializeToString(svg);
    if (s.indexOf("xmlns=") < 0) s = s.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    return loadImg("data:image/svg+xml;charset=utf-8," + encodeURIComponent(s));
  }
  /** Lines of [text] that fit [max] px, shrinking the font down to [min]. */
  function fit(c, text, size, min, max, weight) {
    var s = size;
    for (; s >= min; s -= 2) { c.font = weight + " " + s + "px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"; if (c.measureText(text).width <= max) return s; }
    return min;
  }
  function wrap(c, text, max) {
    var words = String(text).split(/\s+/), lines = [], cur = "";
    words.forEach(function (w) { var t = cur ? cur + " " + w : w; if (c.measureText(t).width > max && cur) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur);
    return lines.slice(0, 2);
  }

  /** Draws the poster of match [m] (js/agenda.js) on a new canvas. */
  VSP.matchPoster = function (m, story) {
    var W = 1080, H = story ? 1920 : 1350, cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    var c = cv.getContext("2d");
    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, GREEN); g.addColorStop(0.55, "#145c26"); g.addColorStop(1, DARK);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // diagonal stripes, very soft, like the club shirt
    c.save(); c.globalAlpha = 0.07; c.fillStyle = WHITE;
    for (var x = -H; x < W; x += 120) { c.beginPath(); c.moveTo(x, H); c.lineTo(x + 60, H); c.lineTo(x + 60 + H, 0); c.lineTo(x + H, 0); c.closePath(); c.fill(); }
    c.restore();
    return Promise.all([loadImg("live/logo.jpg"), piliImg()]).then(function (imgs) {
      var logo = imgs[0], pili = imgs[1], y = story ? 150 : 90;
      if (logo) {
        c.save(); c.beginPath(); c.arc(W / 2, y + 80, 86, 0, Math.PI * 2); c.fillStyle = WHITE; c.fill();
        c.clip(); c.drawImage(logo, W / 2 - 80, y, 160, 160); c.restore();
        c.lineWidth = 8; c.strokeStyle = MINT; c.beginPath(); c.arc(W / 2, y + 80, 86, 0, Math.PI * 2); c.stroke();
      }
      y += 210;
      c.textAlign = "center"; c.fillStyle = MINT;
      c.font = "800 44px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
      c.fillText(VSP.t(m.played ? "poster.result" : "poster.next").toUpperCase(), W / 2, y); y += 90;
      // our team, big
      c.fillStyle = WHITE;
      var team = VSP.teamName(m.team);
      var ts = fit(c, team, 96, 56, W - 140, "900");
      c.fillText(team, W / 2, y + ts * 0.3); y += ts + 40;
      c.font = "700 44px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"; c.fillStyle = MINT;
      c.fillText(m.homeIsClub ? "vs" : "@", W / 2, y); y += 70;
      c.fillStyle = WHITE;
      var rival = VSP.niceTeam(VSP.rival(m));
      c.font = "800 64px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
      wrap(c, rival, W - 160).forEach(function (l) { fit(c, l, 64, 40, W - 160, "800"); c.fillText(l, W / 2, y); y += 76; });
      y += 30;
      if (m.played) {
        c.font = "900 150px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"; c.fillStyle = MINT;
        c.fillText((m.homeIsClub ? m.hs + " – " + m.as : m.as + " – " + m.hs), W / 2, y + 110); y += 190;
      }
      // the day and the time, in a mint pill
      var when = VSP.pretty(VSP.fmtDate(m.date)) + (m.time ? " · " + m.time : "");
      c.font = "800 52px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
      var pw = Math.min(W - 120, c.measureText(when).width + 90);
      c.fillStyle = MINT;
      c.beginPath(); if (c.roundRect) c.roundRect((W - pw) / 2, y, pw, 100, 50); else c.rect((W - pw) / 2, y, pw, 100); c.fill();
      c.fillStyle = DARK; fit(c, when, 52, 34, pw - 60, "800"); c.fillText(when, W / 2, y + 66); y += 150;
      if (m.venue) {
        c.fillStyle = WHITE; var v = "📍 " + VSP.niceVenue(m.venue);
        fit(c, v, 42, 28, W - 140, "600"); c.fillText(v, W / 2, y); y += 60;
      }
      // the Pili, bottom right, and the club at the bottom
      if (pili) { var ps = story ? 420 : 300; c.drawImage(pili, W - ps - 40, H - ps - 150, ps, ps); }
      c.fillStyle = MINT; c.textAlign = "left";
      c.font = "800 40px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
      c.fillText("💚🖤 Club Vòlei Santpedor", 60, H - 70);
      return cv;
    });
  };

  /** Shares the poster (phone: share sheet with the picture) or downloads it. */
  VSP.sharePoster = function (m, story) {
    return VSP.matchPoster(m, story).then(function (cv) {
      return new Promise(function (ok) { cv.toBlob(ok, "image/png"); });
    }).then(function (blob) {
      if (!blob) throw new Error("png");
      var name = "partit-" + m.date + (story ? "-story" : "") + ".png";
      var file = typeof File === "function" ? new File([blob], name, { type: "image/png" }) : null;
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file], title: VSP.teamName(m.team) }).catch(function () {});
      }
      var a = document.createElement("a"), url = URL.createObjectURL(blob);
      a.href = url; a.download = name; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
    });
  };
})();
