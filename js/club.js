/* Club tab extras: photo gallery, friendlies, halls guide (families' tips), club values, kit
 * orders and "propose a photo". Same Firestore documents and limits as the app. */
(function () {
  "use strict";
  var VSP = window.VSP, $ = VSP.$, esc = VSP.esc;

  // ---------- gallery (albums/{id} made in the app with photos fotos/{id}; web galeria.json albums)
  function albums() {
    var out = (VSP.data.albums || []).filter(function (a) { return Array.isArray(a.fotos) && a.fotos.length; }).map(function (a) {
      return { id: "fs-" + a.id, title: a.titol || "", date: a.data || "", teams: a.equips || [], cover: "fs:" + (a.portada || a.fotos[0]),
        photos: a.fotos.map(function (f) { return "fs:" + f; }) };
    });
    (VSP.data.albumsWeb || []).forEach(function (a) {
      var photos = (a.fotos || []).map(function (f) { return /^https:\/\//.test(f) ? f : "club/" + String(f).replace(/^\/+/, ""); })
        .filter(function (f) { return !/\.\.|^club\/[a-z]+:/i.test(f); });
      var link = VSP.safeUrl(a.enllac);
      if (!a.titol || (!photos.length && !link)) return;
      out.push({ id: "w-" + (a.id || a.data + a.titol), title: a.titol, date: a.data || "", teams: a.equips || [], cover: photos[0] || null, photos: photos, link: link });
    });
    return out.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
  }
  var thumbCache = {};
  /** Fills <img data-thumb="fs:ID"> with the photos' thumbnails (one batch request). */
  function loadThumbs(root) {
    var imgs = Array.prototype.slice.call(root.querySelectorAll("img[data-thumb]"));
    var need = [];
    imgs.forEach(function (img) {
      var src = img.getAttribute("data-thumb");
      if (src.indexOf("fs:") !== 0) { img.src = src; return; }
      var id = src.slice(3);
      if (thumbCache[id]) img.src = thumbCache[id]; else if (need.indexOf(id) < 0 && /^[A-Za-z0-9]+$/.test(id)) need.push(id);
    });
    for (var i = 0; i < need.length; i += 50) {
      VSP.fs.batchGet(need.slice(i, i + 50).map(function (id) { return "fotos/" + id; }), ["thumb"]).then(function (docs) {
        docs.forEach(function (d) { if (d.thumb) thumbCache[d.id] = "data:image/jpeg;base64," + d.thumb; });
        imgs.forEach(function (img) { var s = img.getAttribute("data-thumb"); if (s.indexOf("fs:") === 0 && thumbCache[s.slice(3)]) img.src = thumbCache[s.slice(3)]; });
      }).catch(function () {});
    }
  }
  VSP.pages.galeria = { tab: "club", render: function (arg, el, title) {
    title("Galeria de fotos");
    var list = albums();
    el.innerHTML = (VSP.featureOn("fotos") ? '<div class="row" style="margin:12px 0"><a class="btn ghost" href="#proposa" data-href="#proposa">📷 Proposa una foto</a></div>' : "") +
      (list.length ? '<div class="albums">' + list.map(function (a) {
        return '<a class="album" href="#album/' + esc(a.id) + '" data-href="#album/' + esc(a.id) + '">' +
          (a.cover ? '<img alt="" loading="lazy" data-thumb="' + esc(a.cover) + '">' : '<span class="noimg">🖼️</span>') +
          "<b>" + esc(a.title) + '</b><span class="meta">' + esc(VSP.fmtDate(a.date)) + " · " + a.photos.length + " fotos</span></a>";
      }).join("") + "</div>" : '<section><div class="empty">Encara no hi ha àlbums.</div></section>');
    loadThumbs(el);
  } };
  VSP.pages.album = { tab: "club", render: function (id, el, title) {
    var a = albums().filter(function (x) { return x.id === id; })[0];
    if (!a) { title("Àlbum"); el.innerHTML = '<div class="empty">No trobo aquest àlbum.</div>'; return; }
    title(a.title);
    el.innerHTML = '<p class="meta">' + esc(VSP.fmtDate(a.date, true)) + "</p>" + VSP.chips(VSP.teamsOf({ equips: a.teams })) +
      (a.link ? '<p><a class="btn ghost small" href="' + esc(a.link) + '" target="_blank" rel="noopener">Obre l\'àlbum ↗</a></p>' : "") +
      '<div class="grid">' + a.photos.map(function (p, i) {
        return '<button class="ph" data-ph="' + i + '" aria-label="Foto ' + (i + 1) + ' de ' + a.photos.length + '"><img alt="" loading="lazy" data-thumb="' + esc(p) + '"></button>';
      }).join("") + "</div>";
    loadThumbs(el);
    VSP.each("[data-ph]", function (b) { b.onclick = function () { lightbox(a.photos, +b.getAttribute("data-ph")); }; }, el);
  } };
  function lightbox(photos, i) {
    var box = $("lightbox");
    function show() {
      var src = photos[i];
      box.innerHTML = '<button class="lb-close" aria-label="Tancar">×</button>' +
        (photos.length > 1 ? '<button class="lb-prev" aria-label="Anterior">‹</button><button class="lb-next" aria-label="Següent">›</button>' : "") +
        '<div class="lb-img"><div class="empty" style="color:#fff">Carregant…</div></div><div class="lb-n">' + (i + 1) + " / " + photos.length + "</div>";
      box.querySelector(".lb-close").onclick = close;
      if (photos.length > 1) {
        box.querySelector(".lb-prev").onclick = function () { i = (i + photos.length - 1) % photos.length; show(); };
        box.querySelector(".lb-next").onclick = function () { i = (i + 1) % photos.length; show(); };
      }
      var put = function (url) { var holder = box.querySelector(".lb-img"); if (!holder) return; holder.innerHTML = ""; var img = document.createElement("img"); img.alt = ""; img.src = url; holder.appendChild(img); };
      if (src.indexOf("fs:") === 0) {
        VSP.blob("fotos/" + src.slice(3), "jpeg").then(function (j) { if (photos[i] === src) put("data:image/jpeg;base64," + j); })
          .catch(function () { var h = box.querySelector(".lb-img"); if (h) h.innerHTML = '<div class="empty" style="color:#fff">No s\'ha pogut carregar la foto.</div>'; });
      } else put(src);
    }
    function close() { box.hidden = true; box.innerHTML = ""; document.removeEventListener("keydown", key); }
    function key(e) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft" && photos.length > 1) { i = (i + photos.length - 1) % photos.length; show(); }
      else if (e.key === "ArrowRight" && photos.length > 1) { i = (i + 1) % photos.length; show(); }
    }
    box.hidden = false; show(); document.addEventListener("keydown", key);
    box.querySelector(".lb-close").focus();
  }

  // ---------- friendlies and tournaments (amistosos)
  VSP.renderFriendlies = function () {
    var t = VSP.today();
    var list = VSP.matches.filter(function (m) { return m.friendly; });
    var next = VSP.sortMatches(list.filter(function (m) { return m.date >= t && !m.played; }));
    var done = VSP.sortMatches(list.filter(function (m) { return m.played; }), true).slice(0, 6);
    $("friendly-sec").hidden = !next.length && !done.length;
    $("friendlies").innerHTML = (next.length ? next.map(function (m) { return '<div class="day-head">' + esc(VSP.fmtDate(m.date)) + "</div>" + VSP.matchRow(m); }).join("") : "") +
      (done.length ? '<h3 class="sub">Resultats</h3>' + done.map(VSP.matchRow).join("") : "");
  };

  // ---------- halls guide (pavellons/{key}/notes, venues/Venues.kt)
  var KINDS = { parking: ["🅿️", "Aparcament"], bar: ["☕", "Bar"], acces: ["🚪", "Accés"], altres: ["📝", "Altres"] };
  var KIND_ORDER = ["parking", "bar", "acces", "altres"];
  function venues() {
    var by = {};
    VSP.matches.forEach(function (m) {
      if (!m.venue) return;
      var k = VSP.venueKey(m.venue), v = by[k];
      if (!v) v = by[k] = { key: k, name: m.venue, address: m.address, lat: m.lat, lon: m.lon, n: 0, home: false };
      v.n++; if (!v.address && m.address) v.address = m.address; if (v.lat == null && m.lat != null) { v.lat = m.lat; v.lon = m.lon; }
      if (/santpedor|rafa-martinez/.test(VSP.venueKey(m.venue + " " + m.address))) v.home = true;
    });
    return Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return (b.home - a.home) || a.name.localeCompare(b.name, "ca"); });
  }
  VSP.pages.pavellons = { tab: "club", render: function (arg, el, title) {
    title("Guia de pavellons");
    var list = venues();
    el.innerHTML = '<section><p class="muted">Consells de les famílies per a cada pavelló on juguem: on aparcar, si hi ha bar, per on s\'entra… Toca\'n un per veure\'ls o afegir-ne.</p>' +
      (list.length ? list.map(function (v) {
        return '<a class="linkrow" href="#pavello/' + esc(v.key) + '" data-href="#pavello/' + esc(v.key) + '"><span><b>' + (v.home ? "🏠 " : "🏟️ ") + esc(VSP.pretty(v.name)) + "</b>" +
          (v.address ? '<span class="meta">' + esc(VSP.pretty(v.address)) + "</span>" : "") + '</span><span aria-hidden="true">›</span></a>';
      }).join("") : '<div class="empty">Encara no hi ha pavellons a l\'agenda.</div>') + "</section>";
  } };
  VSP.pages.pavello = { tab: "club", render: function (key, el, title) {
    var v = venues().filter(function (x) { return x.key === key; })[0] || { key: key, name: key.replace(/-/g, " "), address: "" };
    title(VSP.pretty(v.name));
    var maps = VSP.directionsUrl(v.lat != null ? v.lat + "," + v.lon : (v.address || v.name));
    var tipsOn = VSP.featureOn("consells");
    el.innerHTML = '<section>' + (v.address ? "<p>📍 " + esc(VSP.pretty(v.address)) + "</p>" : "") +
      '<a class="btn ghost small" href="' + esc(maps) + '" target="_blank" rel="noopener">🧭 Com arribar</a></section>' +
      (tipsOn ? '<section><h2>💡 Consells de les famílies</h2><div id="tips"><div class="empty">Carregant…</div></div>' +
        '<form class="form" id="tip-f"><h3 class="sub">Afegir un consell</h3><div class="chips" role="radiogroup" aria-label="Tipus">' +
        KIND_ORDER.map(function (k, i) { return '<button type="button" role="radio" class="chip' + (i === 0 ? " on" : "") + '" aria-checked="' + (i === 0) + '" data-kind="' + k + '">' + KINDS[k][0] + " " + KINDS[k][1] + "</button>"; }).join("") +
        '</div><label>Consell<textarea id="tip-text" maxlength="300" rows="3" placeholder="P. ex.: Hi ha aparcament gratuït darrere el pavelló." required></textarea></label>' +
        '<label>El teu nom (opcional)<input id="tip-name" maxlength="40" value="' + esc(VSP.store("tip_name") || "") + '"></label>' +
        '<div class="meta">Ho podrà veure tothom amb l\'app.</div><button class="btn primary small" type="submit">Afegeix</button><div class="err" id="tip-err" role="alert"></div></form></section>' : "");
    if (!tipsOn) return;
    var kind = "parking", busy = false;
    VSP.each("[data-kind]", function (b) {
      b.onclick = function () {
        kind = b.getAttribute("data-kind");
        VSP.each("[data-kind]", function (x) { var on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-checked", on); }, el);
      };
    }, el);
    function load() {
      VSP.fs.list("pavellons/" + key + "/notes").then(function (l) {
        var me = VSP.uid();
        l.sort(function (a, b) { return (KIND_ORDER.indexOf(a.tipus) - KIND_ORDER.indexOf(b.tipus)) || String(b.created || "").localeCompare(String(a.created || "")); });
        $("tips").innerHTML = l.length ? l.map(function (t) {
          var k = KINDS[t.tipus] || KINDS.altres;
          return '<div class="item"><p>' + k[0] + " <b>" + esc(k[1]) + ":</b> " + esc(t.text) + "</p>" +
            '<div class="meta">' + (t.nom ? esc(t.nom) + " · " : "") + esc(VSP.fmtDate(String(t.created || "").slice(0, 10))) +
            (t.owner && t.owner === me ? ' · <button class="linkbtn" data-deltip="' + esc(t.id) + '">Esborra</button>' : "") + "</div></div>";
        }).join("") : '<div class="empty">Encara no hi ha consells d\'aquest pavelló. Sigues el primer!</div>';
        VSP.each("[data-deltip]", function (b) {
          b.onclick = function () {
            if (!confirm("Esborrar el consell?")) return;
            VSP.fs.del("pavellons/" + key + "/notes/" + b.getAttribute("data-deltip")).then(load, function (e) { VSP.toast(VSP.errText(e)); });
          };
        }, el);
      }, function (e) { $("tips").innerHTML = '<div class="empty">' + esc(VSP.errText(e)) + "</div>"; });
    }
    $("tip-f").onsubmit = function (ev) {
      ev.preventDefault(); if (busy) return;
      var text = $("tip-text").value.trim().slice(0, 300), nom = $("tip-name").value.trim().slice(0, 40);
      if (!text) { $("tip-err").textContent = "Escriu el consell."; return; }
      VSP.store("tip_name", nom); busy = true;
      VSP.token().then(function () {
        return VSP.fs.add("pavellons/" + key + "/notes", { tipus: kind, text: text, nom: nom, owner: VSP.uid(),
          pavello: String(v.name).trim().slice(0, 120), created: new Date().toISOString() });
      }).then(function () { busy = false; $("tip-text").value = ""; $("tip-err").textContent = ""; VSP.toast("Gràcies pel consell!"); load(); },
        function (e) { busy = false; $("tip-err").textContent = VSP.errText(e); });
    };
    load();
  } };

  // ---------- club values (strings_values.xml)
  var VALUES = [
    ["Els nostres valors", ["🤝 Respecte: als companys, als rivals, als àrbitres i a la pista.", "💪 Esforç: donem el màxim a cada entrenament i a cada punt.",
      "🏐 Equip: guanyem i perdem junts; ningú juga sol.", "😄 Gaudir: el vòlei és per passar-ho bé i fer amics.",
      "🌈 Tothom hi cap: qualsevol persona pot jugar i aprendre.", "🙌 Joc net: celebrem les bones jugades, també les del rival."]],
    ["A la pista (jugadores i jugadors)", ["Arribo puntual i avisa si no puc venir.", "Escolto l'entrenador i els companys.",
      "Saludo el rival i els àrbitres abans i després del partit.", "Accepto les decisions de l'àrbitre sense protestar.",
      "Animo els companys, sobretot quan s'equivoquen.", "Cuido el material i el pavelló."]],
    ["A la grada (famílies)", ["Animem el nostre equip i aplaudim les bones jugades dels dos equips.", "Deixem que l'entrenador entreni: des de la grada no donem instruccions.",
      "Respectem sempre l'àrbitre: també s'està formant.", "Després del partit, preguntem si s'ho han passat bé, no qui ha guanyat.",
      "Fem que el partit sigui una festa per a tothom."]],
    ["Entrenadors i junta", ["Formem persones abans que jugadores.", "Donem minuts i oportunitats a tothom segons l'edat.",
      "Som exemple de calma i respecte.", "Escoltem les famílies i hi parlem amb confiança."]]
  ];
  VSP.pages.valors = { tab: "club", render: function (arg, el, title) {
    title("Els nostres valors");
    el.innerHTML = '<section><p>El Vòlei Santpedor és un club per créixer jugant. Aquests són els valors que compartim jugadores, jugadors, entrenadors, famílies i junta.</p></section>' +
      VALUES.map(function (s) { return "<section><h2>" + esc(s[0]) + "</h2><ul>" + s[1].map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></section>"; }).join("") +
      '<p class="muted">Text proposat per la junta del club. Si hi voleu afegir o canviar res, digueu-ho a la junta.</p>';
  } };

  // ---------- kit orders (comandes + comandes/{id}/peticions/{uid}, editor/Orders.kt)
  function campaigns() {
    var t = VSP.today();
    return (VSP.data.comandes || []).filter(function (c) { return c.oberta === true && /^\d{4}-\d{2}-\d{2}$/.test(String(c.fins || "").trim()) && String(c.fins).trim() >= t; })
      .map(function (c) {
        return { id: c.id, title: c.titol || "", text: c.text || "", until: String(c.fins).trim(),
          products: (c.productes || []).map(function (p) {
            return { name: String(p.nom || ""), sizes: (p.talles || []).map(String).filter(function (s) { return s.trim(); }),
              price: typeof p.preu === "number" && isFinite(p.preu) ? p.preu : null, custom: !!p.personalitzable };
          }).filter(function (p) { return p.name; }) };
      });
  }
  function euro(v) { return v.toFixed(2).replace(".", ",") + " €"; }
  VSP.orderTotal = function (lines, c) {
    var s = 0;
    lines.forEach(function (l) { var p = c.products.filter(function (x) { return x.name === l.producte; })[0]; s += ((p && p.price) || 0) * l.quantitat; });
    return Math.round(s * 100) / 100;
  };
  /** Orders.checkRequest: cleaned lines and the error, or null. */
  VSP.checkOrder = function (name, lines, comment, c) {
    var clean = lines.map(function (l) {
      var p = c.products.filter(function (x) { return x.name === l.producte; })[0];
      return { producte: l.producte, talla: String(l.talla || "").trim(), quantitat: l.quantitat, text: p && p.custom ? String(l.text || "").trim() : "" };
    });
    function prod(l) { return c.products.filter(function (x) { return x.name === l.producte; })[0]; }
    var err = !String(name).trim() ? "Escriu el nom." : String(name).trim().length > 40 ? "El nom és massa llarg (màx. 40)." :
      !clean.length ? "Afegeix almenys un producte." : clean.length > 20 ? "Massa línies (màx. 20)." :
      clean.some(function (l) { return !prod(l); }) ? "Tria el producte de cada línia." :
      clean.some(function (l) { var s = prod(l).sizes; return s.length && s.indexOf(l.talla) < 0; }) ? "Tria la talla de cada línia." :
      clean.some(function (l) { return !(l.quantitat >= 1 && l.quantitat <= 10); }) ? "La quantitat ha de ser d'1 a 10." :
      clean.some(function (l) { return l.text.length > 20; }) ? "La personalització és massa llarga (màx. 20)." :
      String(comment).trim().length > 200 ? "El comentari és massa llarg (màx. 200)." : null;
    return { lines: clean, error: err };
  };
  VSP.renderOrders = function () {
    var list = campaigns();
    $("orders-sec").hidden = !list.length;
    $("orders").innerHTML = list.map(function (c) {
      return '<a class="linkrow" href="#comanda/' + esc(c.id) + '" data-href="#comanda/' + esc(c.id) + '"><span><b>🛍️ ' + esc(c.title) + '</b><span class="meta">Fins al ' + esc(VSP.fmtDate(c.until)) + "</span></span><span aria-hidden=\"true\">›</span></a>";
    }).join("");
  };
  VSP.pages.comanda = { tab: "club", render: function (id, el, title) {
    var c = campaigns().filter(function (x) { return x.id === id; })[0];
    title(c ? c.title : "Comandes d'equipació");
    if (!c) { el.innerHTML = '<div class="empty">Aquesta comanda ja està tancada.</div>'; return; }
    var hasPrices = c.products.some(function (p) { return p.price != null; });
    var lines = [{ producte: c.products[0].name, talla: "", quantitat: 1, text: "" }], name = VSP.store("ord_name") || "", comment = "", existing = null, busy = false, msg = "", err = "";
    var path = function () { return "comandes/" + c.id + "/peticions/" + VSP.uid(); };
    function draw() {
      var total = VSP.orderTotal(lines, c);
      el.innerHTML = '<section>' + (c.text ? '<p style="white-space:pre-line">' + esc(c.text) + "</p>" : "") +
        '<div class="meta">Fins al ' + esc(VSP.fmtDate(c.until, true)) + " · Una petició per mòbil; la pots canviar o retirar fins al dia de tancament.</div>" +
        (existing ? '<p class="ok">Ja tens una comanda enviada: la pots canviar o retirar.</p>' : "") +
        (msg ? '<p class="ok" role="status"><b>' + esc(msg) + "</b></p>" : "") + "</section>" +
        '<section><form class="form" id="ord-f"><label>Nom del jugador/a o persona<input id="ord-name" maxlength="40" value="' + esc(name) + '"></label>' +
        '<h3 class="sub">Què voleu?</h3>' + lines.map(function (l, i) {
          var p = c.products.filter(function (x) { return x.name === l.producte; })[0] || c.products[0];
          return '<div class="card line"><label>Producte<select data-l="' + i + '" data-f="producte">' + c.products.map(function (x) {
            return "<option" + (x.name === l.producte ? " selected" : "") + ' value="' + esc(x.name) + '">' + esc(x.name) + (x.price != null ? " · " + esc(euro(x.price)) : "") + "</option>";
          }).join("") + "</select></label>" +
            (p.sizes.length ? '<label>Talla<select data-l="' + i + '" data-f="talla"><option value="">—</option>' + p.sizes.map(function (s) {
              return "<option" + (s === l.talla ? " selected" : "") + ' value="' + esc(s) + '">' + esc(s) + "</option>";
            }).join("") + "</select></label>" : "") +
            '<label>Quantitat<input type="number" min="1" max="10" data-l="' + i + '" data-f="quantitat" value="' + l.quantitat + '"></label>' +
            (p.custom ? '<label>Personalització (nom, número…)<input maxlength="20" data-l="' + i + '" data-f="text" value="' + esc(l.text) + '"></label>' : "") +
            (lines.length > 1 ? '<button type="button" class="linkbtn" data-rm="' + i + '">Treu la línia</button>' : "") + "</div>";
        }).join("") +
        (lines.length < 20 ? '<button type="button" class="btn ghost small" id="ord-add">＋ Afegeix una línia</button>' : "") +
        '<label>Comentari<textarea id="ord-comment" maxlength="200" rows="2">' + esc(comment) + "</textarea></label>" +
        (hasPrices ? "<p><b>Total: " + esc(euro(total)) + "</b></p>" : "") +
        '<div class="err" role="alert">' + esc(err) + "</div>" +
        '<div class="row"><button class="btn primary" type="submit"' + (busy ? " disabled" : "") + ">" + (existing ? "Actualitza la comanda" : "Envia la comanda") + "</button>" +
        (existing ? '<button class="btn ghost" type="button" id="ord-del">Retira la comanda</button>' : "") + "</div>" +
        '<p class="meta">La junta us dirà com i quan pagar-ho.</p></form></section>';
      $("ord-name").oninput = function () { name = this.value; };
      $("ord-comment").oninput = function () { comment = this.value; };
      VSP.each("[data-l]", function (inp) {
        var ev = inp.tagName === "SELECT" ? "onchange" : "oninput";
        inp[ev] = function () {
          var l = lines[+inp.getAttribute("data-l")], f = inp.getAttribute("data-f");
          l[f] = f === "quantitat" ? parseInt(inp.value, 10) || 0 : inp.value;
          if (f === "producte") { l.talla = ""; l.text = ""; draw(); }
          else if (hasPrices && f === "quantitat") { var tb = el.querySelector("form p b"); if (tb) tb.textContent = "Total: " + euro(VSP.orderTotal(lines, c)); }
        };
      }, el);
      VSP.each("[data-rm]", function (b) { b.onclick = function () { lines.splice(+b.getAttribute("data-rm"), 1); draw(); }; }, el);
      if ($("ord-add")) $("ord-add").onclick = function () { lines.push({ producte: c.products[0].name, talla: "", quantitat: 1, text: "" }); draw(); };
      if ($("ord-del")) $("ord-del").onclick = function () {
        if (!confirm("Segur que vols retirar la comanda?")) return;
        busy = true; VSP.fs.del(path()).then(function () { busy = false; existing = null; msg = "Has retirat la comanda."; draw(); },
          function (e) { busy = false; err = VSP.errText(e); draw(); });
      };
      $("ord-f").onsubmit = function (ev) {
        ev.preventDefault(); if (busy) return;
        var r = VSP.checkOrder(name, lines, comment, c);
        err = r.error || ""; msg = "";
        if (err) { draw(); return; }
        busy = true; VSP.store("ord_name", name.trim()); draw();
        VSP.token().then(function () {
          return VSP.fs.set(path(), { nom: name.trim(), linies: r.lines, comentari: comment.trim(), total: VSP.dbl(VSP.orderTotal(r.lines, c)),
            owner: VSP.uid(), created: new Date().toISOString() });
        }).then(function () {
          busy = false; existing = true;
          msg = "Comanda enviada! " + r.lines.map(function (l) { return l.producte + (l.talla ? " " + l.talla : "") + " ×" + l.quantitat + (l.text ? " «" + l.text + "»" : ""); }).join("; ") +
            (hasPrices ? " · Total: " + euro(VSP.orderTotal(r.lines, c)) : "");
          draw();
        }, function (e) { busy = false; err = VSP.errText(e); draw(); });
      };
    }
    draw();
    VSP.token().then(function () { return VSP.fs.get(path()); }).then(function (r) {
      if (!r) return;
      existing = true; name = r.nom || name; comment = r.comentari || "";
      var ls = (r.linies || []).map(function (l) { return { producte: String(l.producte || ""), talla: String(l.talla || ""), quantitat: Number(l.quantitat) || 1, text: String(l.text || "") }; })
        .filter(function (l) { return c.products.some(function (p) { return p.name === l.producte; }); });
      if (ls.length) lines = ls;
      draw();
    }).catch(function () {});
  } };

  // ---------- propose a photo (fotos_proposades, editor/PhotoData.kt sizes)
  var MAX_SIDE = 1600, THUMB_SIDE = 360, MAX_BYTES = 550000;
  function b64size(s) { return Math.floor(s.length * 3 / 4); }
  /** Decoded with an <img>: browsers apply the photo's EXIF orientation when drawing it to a canvas. */
  function loadImage(file) { return viaImg(file); }
  function viaImg(file) {
    return new Promise(function (ok, ko) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { ok(img); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); };
      img.onerror = function () { URL.revokeObjectURL(url); ko(new Error("img")); };
      img.src = url;
    });
  }
  function draw(img, max) {
    var w = img.width, h = img.height, f = Math.min(1, max / Math.max(w, h));
    var c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w * f)); c.height = Math.max(1, Math.round(h * f));
    var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  /** JPEG ≤ 1600 px and ≤ 550 KB (quality 82 → 42) + 360 px thumbnail, in base64. */
  VSP.photoData = function (file) {
    return loadImage(file).then(function (img) {
      var c = draw(img, MAX_SIDE), q = 0.82, jpeg = c.toDataURL("image/jpeg", q).split(",")[1];
      while (b64size(jpeg) > MAX_BYTES && q > 0.4) { q -= 0.1; jpeg = c.toDataURL("image/jpeg", q).split(",")[1]; }
      if (b64size(jpeg) > MAX_BYTES || jpeg.length >= 900000) return null;
      var thumb = draw(img, THUMB_SIDE).toDataURL("image/jpeg", 0.7).split(",")[1];
      if (thumb.length >= 100000) return null;
      return { jpeg: jpeg, thumb: thumb, w: c.width, h: c.height };
    }).catch(function () { return null; });
  };
  VSP.pages.proposa = { tab: "club", render: function (arg, el, title) {
    title("Proposa fotos");
    if (!VSP.featureOn("fotos")) { el.innerHTML = '<div class="empty">Ara mateix no es poden proposar fotos.</div>'; return; }
    var files = [], busy = false;
    el.innerHTML = '<section><p>Envia fins a 5 fotos perquè surtin a la galeria del club.</p>' +
      '<p class="muted">Un editor (entrenador/a o junta) les revisarà abans que surtin a la galeria.</p>' +
      '<form class="form" id="pp-f"><label class="btn ghost filebtn">📷 Tria fotos<input type="file" id="pp-files" accept="image/*" multiple></label>' +
      '<div id="pp-list" class="grid small"></div>' +
      '<label>Equip (opcional)<select id="pp-team"><option value="0">Tot el club</option>' + VSP.TEAMS.map(function (t) { return '<option value="' + t.id + '">' + esc(t.name) + "</option>"; }).join("") + "</select></label>" +
      '<label>Descripció (opcional)<input id="pp-text" maxlength="140"></label>' +
      '<label>El teu nom (opcional)<input id="pp-name" maxlength="40" value="' + esc(VSP.store("pp_name") || "") + '"></label>' +
      '<label class="check"><input type="checkbox" id="pp-ok"> Tinc permís per compartir aquestes fotos</label>' +
      '<p class="meta">Envia només fotos que siguin teves o que tinguis permís per compartir. Si hi surten menors, cal que les seves famílies hi estiguin d\'acord.</p>' +
      '<button class="btn primary" type="submit">Envia</button><div class="err" id="pp-err" role="alert"></div><div class="ok" id="pp-ok-msg" role="status"></div></form></section>' +
      '<section><h2>Les meves propostes pendents</h2><div id="pp-mine"><div class="empty">Carregant…</div></div></section>';
    function showFiles() {
      if (!$("pp-list")) return;
      $("pp-list").innerHTML = files.map(function (f, i) {
        return '<span class="ph"><img alt="" src="' + URL.createObjectURL(f) + '"><button type="button" class="rm" data-rmf="' + i + '" aria-label="Treu la foto">×</button></span>';
      }).join("");
      VSP.each("[data-rmf]", function (b) { b.onclick = function () { files.splice(+b.getAttribute("data-rmf"), 1); showFiles(); }; }, el);
    }
    $("pp-files").onchange = function () {
      Array.prototype.forEach.call(this.files || [], function (f) { if (files.length < 5 && /^image\//.test(f.type)) files.push(f); });
      this.value = ""; showFiles();
    };
    function mine() {
      VSP.token().then(function () {
        return VSP.fs.query({ from: [{ collectionId: "fotos_proposades" }], select: { fields: ["thumb", "text", "equip", "created", "owner"].map(function (f) { return { fieldPath: f }; }) },
          where: { fieldFilter: { field: { fieldPath: "owner" }, op: "EQUAL", value: { stringValue: VSP.uid() } } }, limit: 50 });
      }).then(function (l) {
        if (!$("pp-mine")) return;
        l.sort(function (a, b) { return String(b.created || "").localeCompare(String(a.created || "")); });
        $("pp-mine").innerHTML = l.length ? '<div class="grid small">' + l.map(function (p) {
          return '<span class="ph"><img alt="' + esc(p.text || "") + '" src="data:image/jpeg;base64,' + esc(p.thumb || "") + '"><button type="button" class="rm" data-wd="' + esc(p.id) + '" aria-label="Retira">×</button></span>';
        }).join("") + "</div>" : '<div class="empty">Cap.</div>';
        VSP.each("[data-wd]", function (b) {
          b.onclick = function () { if (confirm("Vols retirar aquesta proposta?")) VSP.fs.del("fotos_proposades/" + b.getAttribute("data-wd")).then(mine, function (e) { VSP.toast(VSP.errText(e)); }); };
        }, el);
      }, function () { if ($("pp-mine")) $("pp-mine").innerHTML = '<div class="empty">No s\'ha pogut connectar.</div>'; });
    }
    $("pp-f").onsubmit = function (ev) {
      ev.preventDefault(); if (busy) return;
      $("pp-ok-msg").textContent = "";
      if (!files.length) { $("pp-err").textContent = "Tria almenys una foto."; return; }
      if (!$("pp-ok").checked) { $("pp-err").textContent = "Confirma que tens permís per compartir les fotos."; return; }
      $("pp-err").textContent = ""; busy = true;
      var nom = $("pp-name").value.trim().slice(0, 40), text = $("pp-text").value.trim().slice(0, 140), equip = parseInt($("pp-team").value, 10) || 0;
      VSP.store("pp_name", nom);
      var list = files.slice(), skipped = 0, i = 0;
      function next() {
        if (i >= list.length) return Promise.resolve();
        if ($("pp-ok-msg")) $("pp-ok-msg").textContent = "Enviant foto " + (i + 1) + " de " + list.length + "…";
        var f = list[i++];
        return VSP.photoData(f).then(function (p) {
          if (!p) { skipped++; return; }
          return VSP.fs.add("fotos_proposades", { jpeg: p.jpeg, thumb: p.thumb, w: p.w, h: p.h, owner: VSP.uid(), nom: nom, text: text, equip: equip, created: new Date().toISOString() });
        }).then(next);
      }
      VSP.token().then(next).then(function () {
        busy = false; files = []; showFiles();
        if (!$("pp-ok-msg")) return;
        $("pp-ok-msg").textContent = skipped === list.length ? "" : "Gràcies! Un editor la revisarà." + (skipped ? " No s'han pogut llegir " + skipped + " de les fotos." : "");
        if (skipped === list.length) $("pp-err").textContent = "No s'ha pogut llegir cap de les fotos triades.";
        mine();
      }, function (e) { busy = false; if (!$("pp-err")) return; $("pp-ok-msg").textContent = ""; $("pp-err").textContent = VSP.errText(e); });
    };
    mine();
  } };
})();
