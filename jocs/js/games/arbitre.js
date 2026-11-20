/* Club Vòlei Santpedor · Jocs · "Carnet d'àrbitre" (port of Referee.kt / RefereeLogic.kt).
   Four exam levels opened in order; 10 random questions, passed with 8; score = 25 × highest level
   passed, 110 for a 10/10 in Internacional, never below the stored best. One exam = one run. */
(function () {
  "use strict";
  var VSPG = window.VSPG = window.VSPG || {};

  // ------------------------------------------------------------------ logic (RefereeLogic)
  var LEVELS = 4;
  var QUESTIONS = 10;
  var PASS = 8;
  var POINTS_PER_LEVEL = 25;
  var PERFECT = 110;
  var MIN_BANK = 15;
  var STORE = "jocs_referee";

  /* strings_referee.xml (values = català): ref_q_0 … ref_q_3 */
  var BANKS = [
  [
    "Quines mides té el camp de joc?|18 × 9 m|20 × 10 m|16 × 8 m|18 × 12 m|0|El camp és un rectangle de 18 × 9 m (regla 1.1).",
    "A quina altura és la xarxa en categoria sènior masculina?|2,43 m|2,24 m|2,35 m|2,50 m|0|Sènior masculí 2,43 m i sènior femení 2,24 m (regla 2.1).",
    "A quina altura és la xarxa en categoria sènior femenina?|2,24 m|2,15 m|2,30 m|2,43 m|0|Sènior femení 2,24 m i sènior masculí 2,43 m (regla 2.1).",
    "A quina distància de la línia central hi ha la línia d'atac?|3 m|2 m|4 m|4,5 m|0|La línia d'atac és a 3 m de la línia central i limita la zona d'atac (regla 1.3.4).",
    "Com es guanya un set (excepte el cinquè)?|Arribant a 25 punts amb 2 de diferència|Arribant a 25 punts, encara que sigui 25-24|Arribant a 21 punts amb 2 de diferència|Sent el primer a fer 30 punts|0|25 punts amb almenys 2 de diferència: amb 24-24 es continua fins a 26-24, 27-25… (regla 6.2).",
    "A quants punts es juga el cinquè set?|A 15, amb 2 de diferència|A 25, amb 2 de diferència|A 15, sense diferència mínima|A 21, amb 2 de diferència|0|El set decisiu es juga a 15 punts amb un mínim de 2 de diferència (regla 6.3.2).",
    "Quants tocs pot fer com a màxim un equip per tornar la pilota?|Tres, sense comptar el bloqueig|Dos|Quatre|Tants com vulgui|0|Tres tocs; el toc del bloqueig no compta com a toc de l'equip (regles 9.1 i 14.4.1).",
    "La pilota bota tocant just la línia de fons. Com és?|Dins|Fora|Es repeteix el punt|Depèn de la força de la pilota|0|Les línies formen part del camp: si la pilota toca la línia és dins (regla 8.3).",
    "L'equip que rep guanya el punt. Qui servirà?|El jugador que passa de la zona 2 a la zona 1|El mateix que ha servit abans en aquest equip|El capità|El jugador de la zona 6|0|L'equip rota en sentit horari i serveix qui passa de la zona 2 a la zona 1 (regles 7.6.2 i 12.2.2.2).",
    "Quants temps morts pot demanar cada equip en un set?|Dos, de 30 segons|Un, de 60 segons|Tres, de 30 segons|Dos, de 60 segons|0|Cada equip té dos temps morts per set i cadascun dura 30 segons (regles 15.1 i 15.4.1).",
    "Quantes substitucions pot fer cada equip en un set?|Sis|Tres|Dotze|Il·limitades|0|Sis substitucions per set (regla 15.1); els canvis del líbero no compten.",
    "Quant de temps té el servidor per servir després del xiulet?|8 segons|5 segons|10 segons|15 segons|0|Ha de colpejar la pilota dins dels 8 segons posteriors al xiulet del primer àrbitre (regla 12.4.4).",
    "Un servei toca la xarxa i passa al camp contrari. Què passa?|El joc continua|Falta del servidor|Es repeteix el servei|Punt per a l'equip que serveix|0|La pilota pot tocar la xarxa mentre la creua, també al servei (regles 10.2 i 12.6.2.1).",
    "Després d'un toc de bloqueig, quants tocs té l'equip?|Encara en té tres|Només en té dos|Només en té un|Cap: ha de passar la pilota|0|El bloqueig no compta com a toc de l'equip (regla 14.4.1).",
    "Quina és la zona 1 del camp?|Darrere a la dreta|Davant a la dreta|Darrere al mig|Davant a l'esquerra|0|Zones 4-3-2 a la xarxa i 5-6-1 al fons; la zona 1 és la del servidor (regla 7.4.1).",
    "Quants sets cal guanyar per guanyar el partit?|Tres|Dos|Quatre|Cinc|0|Guanya el partit l'equip que guanya tres sets (regla 6.3.1)."
  ],
  [
    "Què indica l'àrbitre aixecant quatre dits separats?|Quatre tocs|Retard en el servei|Falta de posició|Temps mort|0|És el senyal oficial de quatre tocs (regla 9.3.1).",
    "Què indica l'àrbitre aixecant dos dits separats?|Doble contacte|Segon temps mort|Doble falta|Dos tocs|0|És el senyal de doble contacte (regla 9.3.4).",
    "Què indica un moviment circular amb el dit índex?|Falta de posició o de rotació|Substitució|Canvi de camp|Pilota tocada|0|És el senyal de falta de posició o de rotació (regles 7.5 i 7.7).",
    "Avantbraços aixecats verticalment, mans obertes i palmells cap al cos: què indica?|Pilota fora|Pilota dins|Final de set|Falta de bloqueig|0|És el senyal de pilota fora (regla 8.4).",
    "Què indica l'àrbitre assenyalant el terra amb el braç i els dits?|Pilota dins|Pilota fora|Invasió|Pilota tocada|0|És el senyal de pilota dins (regla 8.3).",
    "Palmell d'una mà sobre els dits de l'altra, formant una T: què indica?|Temps mort|Substitució|Falta a la xarxa|Final del partit|0|És el senyal de temps mort, i després s'assenyala l'equip que el demana (regla 15.4.1).",
    "Què indica fer girar els avantbraços l'un al voltant de l'altre?|Substitució|Canvi de camp|Falta de rotació|Doble falta|0|És el senyal de substitució (regla 15.5).",
    "Què indica l'àrbitre aixecant els dos polzes?|Doble falta i repetició|Punt vàlid|Pilota dins|Joc net|0|Doble falta: es repeteix la jugada (regla 6.1.2.2).",
    "Què indica creuar els avantbraços davant del pit amb les mans obertes?|Final del set o del partit|Doble falta|Retard|Pilota tocada|0|És el senyal de final de set o de partit (regles 6.2 i 6.3).",
    "Quina conseqüència té una falta de posició?|Punt i servei per al rival, i es corregeixen les posicions|Només una advertència|Es repeteix el servei|Targeta groga al capità|0|Regla 7.5.4.",
    "Segons el reglament 2025-2028, quin equip ha d'estar en ordre de rotació en el moment del servei?|Només l'equip que rep|Només l'equip que serveix|Tots dos equips|Cap dels dos|0|Des del 2025, els jugadors de l'equip que serveix (excepte el servidor) es poden col·locar on vulguin dins el seu camp; l'equip que rep ha de respectar l'ordre de rotació (regla 7.4).",
    "En colpejar la pilota (o en saltar per servir), el servidor trepitja la línia de fons. Què és?|Falta del servidor|Correcte: la línia forma part de la zona de servei|Es repeteix el servei|Només és falta si la pilota cau dins|0|En el moment del colp o de l'impuls no pot tocar el camp, línia de fons inclosa (regla 12.4.3).",
    "Un jugador del fons salta des de la zona d'atac i envia al camp contrari una pilota que era completament per sobre de la xarxa. Què és?|Falta d'atac|Acció correcta|Correcte si no trepitja la línia en caure|Només és falta si la pilota va fora|0|Un jugador del fons només pot atacar des de la zona d'atac si la pilota és, en part, per sota del límit superior de la xarxa (regles 13.2.3 i 13.3.3).",
    "Un jugador toca la xarxa entre les antenes durant l'acció de jugar la pilota. Què és?|Falta|Correcte si no toca la banda superior|Correcte si la pilota ja és al camp contrari|Només és falta si ho veu el segon àrbitre|0|Tocar la xarxa entre les antenes durant l'acció de jugar la pilota és falta (regles 11.3.1 i 11.4.4).",
    "El peu d'un jugador passa al camp contrari, però una part continua tocant la línia central (o just a sobre) i no molesta ningú. Què és?|Correcte|Falta d'invasió|Falta només si toca el rival|Es repeteix el punt|0|Es permet sempre que una part del peu toqui la línia central o hi sigui just a sobre, i no interfereixi (regla 11.2.2.1).",
    "En el cinquè set, quan es canvia de camp?|Quan un equip arriba a 8 punts|Quan un equip arriba a 10 punts|No es canvia|Quan es fa el primer temps mort|0|Al set decisiu, quan l'equip que guanya arriba a 8 punts, els equips canvien de camp sense retard (regla 18.2.2).",
    "Quant duren les pauses entre sets?|3 minuts|1 minut|5 minuts|10 minuts|0|Totes les pauses duren 3 minuts; la del 2n al 3r set es pot allargar fins a 10 minuts si ho autoritza l'organisme competent (regla 18.1)."
  ],
  [
    "Un jugador titular que ha estat substituït pot tornar al camp en el mateix set?|Sí, un sol cop i només a la seva posició de la formació|No, fins al set següent|Sí, tantes vegades com vulgui|Sí, a qualsevol posició|0|Un titular pot sortir i tornar a entrar un cop per set, i només a la seva posició anterior (regla 15.6.1).",
    "Un reserva ha entrat per un titular. Qui el pot substituir després?|Només el mateix titular|Qualsevol reserva|El líbero|Qualsevol jugador del banc|0|El reserva entra un sol cop per set i només el pot substituir el titular per qui ha entrat (regla 15.6.2).",
    "Els canvis del líbero compten com a substitucions?|No: són il·limitats, però cal un punt complet entre dos canvis de líbero|Sí, compten dins les sis|Només els del segon líbero|No, i es poden fer en qualsevol moment, fins i tot amb la pilota en joc|0|Regla 19.3.2.1.",
    "El líbero fa una passada de dits des de la seva zona d'atac i un company remata la pilota completament per sobre de la xarxa. Què és?|Falta d'atac|Acció correcta|Correcte si el líbero no ha saltat|Doble contacte del líbero|0|Regles 13.3.6 i 19.3.1.4. Si la passada de dits del líbero es fa des de fora de la zona d'atac, la pilota es pot atacar lliurement.",
    "El líbero pot ser capità?|Sí, capità de l'equip o capità en joc|No, mai|Només si l'equip té dos líberos|Només capità en joc, mai de l'equip|0|El reglament diu que els líberos poden ser capità de l'equip o capità en joc (regla 5).",
    "Quants líberos pot designar un equip i quants poden ser al camp alhora?|Fins a dos, i només un al camp|Un, i al camp|Fins a tres, i dos al camp|Dos, i tots dos al camp|0|Regles 19.1.1 i 19.1.3.",
    "Quina sanció té el primer retard d'un equip en el partit?|Advertència per retard, sense punt|Penalització per retard: punt i servei per al rival|Expulsió de l'entrenador|Cap ni s'anota a l'acta|0|El primer retard és advertència; el segon i els següents són penalització per retard: punt i servei per al rival (regles 16.2.2 i 16.2.3).",
    "Com indica l'àrbitre una penalització per retard?|Tapant-se el canell amb la targeta vermella|Mostrant la targeta vermella al jugador|Mostrant juntes la groga i la vermella|Aixecant vuit dits|0|Targeta groga sobre el canell: advertència per retard; vermella sobre el canell: penalització per retard.",
    "Primera conducta grollera d'un membre de l'equip en el partit: quina sanció?|Penalització (targeta vermella): punt i servei per al rival|Expulsió|Desqualificació|Només un avís verbal|0|Regla 21.3.1.",
    "L'àrbitre mostra juntes la targeta vermella i la groga. Què vol dir?|Expulsió|Desqualificació|Penalització|Advertència|0|Juntes: expulsió. Separades: desqualificació (regla 21.6).",
    "Primera conducta ofensiva (insults o gestos ofensius) d'un jugador: quina sanció?|Expulsió|Penalització|Targeta groga|Advertència verbal|0|La primera conducta ofensiva és expulsió (regla 21.3.2.2); una agressió física és desqualificació.",
    "Fins quan no pot jugar un jugador expulsat?|Fins al final del set en curs|Fins al final del partit|Durant tres punts|Fins al proper temps mort|0|L'expulsat va al vestidor fins que s'acaba el set (regla 21.3.2.1); el desqualificat, fins que s'acaba el partit (21.3.3.1).",
    "Primera petició improcedent d'un equip en el partit que no retarda el joc: què passa?|Es rebutja i s'anota a l'acta, sense cap altra conseqüència|Advertència per retard|Penalització per retard|S'accepta igualment|0|Regla 15.11.2; les següents peticions improcedents ja són retard.",
    "Un equip vol fer dues peticions de substitució separades. Què hi ha d'haver entre elles?|Un punt complet, excepte en cas de lesió, expulsió o desqualificació|Un temps mort|Res: es poden fer seguides|Un canvi de servei|0|Regla 15.2.3.",
    "Qui xiula les faltes de posició de l'equip que rep?|El segon àrbitre|El primer àrbitre|L'anotador|Els jutges de línia|0|Regla 24.3.2.2. Les faltes del servidor i la pantalla de l'equip que serveix són del primer àrbitre (regla 23.3.2.3).",
    "Un jugador de davant bloqueja el servei del rival per sobre de la xarxa. Què és?|Falta|Correcte|Correcte si toca la pilota en el seu espai|Es repeteix el servei|0|Bloquejar el servei del rival està prohibit (regles 14.5 i 14.6.3)."
  ],
  [
    "Un jugador lesionat no es pot substituir de manera legal. Què permet el reglament?|Una substitució excepcional amb qualsevol jugador que no sigui al camp, excepte els líberos i el seu jugador de reemplaçament|Continuar jugant amb cinc jugadors|Que el líbero hi entri com a jugador normal|Que torni a entrar un jugador ja expulsat|0|Regla 15.7. El jugador substituït excepcionalment ja no pot tornar al partit.",
    "Un jugador lesionat no es pot substituir ni legalment ni excepcionalment. Què passa?|Té 3 minuts per recuperar-se, un sol cop per jugador i partit|L'equip perd el set de seguida|Es juga amb cinc jugadors|Se suspèn el partit|0|Regla 17.1.2. Si no es recupera, l'equip és declarat incomplet.",
    "Es descobreix una falta de rotació després d'uns quants punts. Què es fa?|Punt i servei per al rival, es corregeix l'ordre i s'anul·len els punts de l'equip infractor des de la falta|Només es corregeix l'ordre|Es repeteix el set|S'anul·len els punts dels dos equips des de la falta|0|Regla 7.7. Els punts del rival es mantenen; si no se sap el moment exacte, només hi ha punt i servei per al rival.",
    "El servidor trepitja la línia de fons en servir i, alhora, l'equip que rep està mal col·locat. Què se sanciona?|La falta del servidor|La falta de posició de l'equip que rep|Doble falta: es repeteix|Totes dues|0|La falta del servidor en el moment del colp compta abans que la falta de posició (regles 7.5.2 i 12.7.1).",
    "El servei és correcte però surt fora, i l'equip que rep estava mal col·locat. Què se sanciona?|La falta de posició de l'equip que rep|El servei fora|Doble falta: es repeteix|Res|0|La falta de posició s'ha produït abans (regles 7.5.3 i 12.7.2).",
    "Què ha de comunicar el segon àrbitre al primer àrbitre i a l'entrenador?|El segon temps mort i la cinquena i la sisena substitucions|Cada punt|El primer temps mort|Cada canvi del líbero|0|Regla 24.2.7.",
    "En acabar el partit, en quin ordre se signa l'acta?|Anotador, capitans i àrbitres|Àrbitres, capitans i anotador|Capitans, anotador i àrbitres|Primer àrbitre, segon àrbitre i anotador|0|L'anotador signa i després obté la signatura dels capitans i, finalment, dels àrbitres (regla 27.2.3.3).",
    "El capità en joc no està d'acord amb l'explicació del primer àrbitre. Què pot fer?|Reservar-se immediatament el dret de protestar i registrar-ho a l'acta en acabar el partit|Escriure la protesta a l'acta durant el set|Aturar el partit fins que arribi un delegat|Res: no es pot protestar mai|0|Regles 5.1.2.1, 5.1.3.2 i 23.2.4.",
    "Un equip és declarat incomplet per a un set. Què passa?|Perd el set: el rival rep els punts que li calen i l'equip incomplet conserva els seus|Perd el partit 0-3|Es repeteix el set|El set s'acaba amb el resultat del moment|0|Regla 6.4.3.",
    "Un equip es nega a jugar després de ser-ne requerit. Quin resultat s'anota?|0-3 en el partit i 0-25 a cada set|0-3 en el partit i 0-15 a cada set|Es juga un altre dia|Només perd el set en curs|0|L'equip és declarat en incompareixença (regla 6.4.1).",
    "L'únic líbero d'un equip es lesiona i no pot continuar. Què pot fer l'entrenador?|Redesignar com a líbero, per a la resta del partit, un jugador que no sigui al camp (excepte el jugador de reemplaçament)|Res fins al set següent|Redesignar qualsevol jugador que sigui al camp|Fer jugar el líbero lesionat al servei|0|Regla 19.4.2.1.",
    "Al cinquè set no s'ha canviat de camp quan un equip ha arribat a 8 punts. Què es fa?|Es canvia tan bon punt es detecta i es manté el marcador|Es repeteix el set|Es torna al marcador de 8 punts|Ja no es canvia|0|Regla 18.2.2.",
    "S'ha posat una advertència per retard en una pausa entre sets. Quan s'aplica?|Al set següent, i val per a tot el partit|Només durant aquella pausa|S'anul·la en començar el set|Al set següent, i després s'esborra|0|Les sancions per retard són vigents tot el partit i les d'abans o entre sets s'apliquen al set següent (regles 16.2.1.1 i 16.2.4).",
    "Quines són les mides oficials de la pilota?|Circumferència de 65-67 cm i pes de 260-280 g|Circumferència de 60-62 cm i pes de 230-250 g|Circumferència de 68-70 cm i pes de 290-310 g|Circumferència de 65-67 cm i pes de 300-320 g|0|Regla 3.1.",
    "Dos rivals toquen la pilota alhora per sobre de la xarxa i la pilota queda en joc al camp de l'equip A. Quants tocs té l'equip A?|Tres|Dos|Un|Cap: es repeteix|0|L'equip que rep la pilota té tres tocs nous; si la pilota va fora, és falta de l'equip del camp contrari (regla 9.1.2.2).",
    "El primer toc d'un equip envia la pilota cap a la zona lliure del rival per fora de l'espai de pas. Es pot recuperar?|Sí, dins dels tocs de l'equip, i tornant-la per fora de l'espai de pas pel mateix costat|No: és pilota fora|Sí, però amb un sol toc|Sí, i es pot tornar per dins de les antenes|0|Regla 10.1.2. Si la pilota ve del segon o del tercer toc, és pilota fora quan creua el pla de la xarxa (10.1.2.3).",
    "Un canvi de líbero es fa després del xiulet de servei però abans del colp, per primer cop en el partit. Què fa l'àrbitre?|No el rebutja; acabada la jugada, avisa el capità que si es repeteix es sancionarà amb retard|Sanció per retard immediata|Punt per al rival|L'anul·la i torna a xiular|0|Regles 19.3.2.5 i 19.3.2.6."
  ]
  ];
  var LEVEL_NAMES = ["Aspirant", "Regional", "Nacional", "Internacional"];
  var LEVEL_DESCS = ["Camp, punts i normes bàsiques", "Faltes i senyals de l'àrbitre",
    "Substitucions, líbero i sancions", "Casos difícils, acta i procediments"];
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
    cardText(ctx, "CARNET D'ÀRBITRE", w * 0.05, h * 0.04, h * 0.09, "#fff", true, w * 0.75);
    cardText(ctx, "Club Vòlei Santpedor", w * 0.05, h * 0.155, h * 0.05, "#B9F6C0", true, w * 0.75);
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
    var rows = [["NOM", nickname()], ["NIVELL", LEVEL_NAMES[level] + "  " + stars], ["DATA", shown]];
    rows.forEach(function (r, i) {
      var y = h * (0.32 + i * 0.18);
      cardText(ctx, r[0], x, y, h * 0.04, "#B9F6C0", true, maxW);
      cardText(ctx, r[1], x, y + h * 0.05, h * 0.075, "#fff", true, maxW);
    });
    cardText(ctx, "Reglament FIVB 2025-2028", x, h * 0.88, h * 0.036, "rgba(255,255,255,0.7)", false, maxW);
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
          navigator.share({ files: [file], title: "Carnet d'àrbitre" })["catch"](function () {});
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
      cv.setAttribute("aria-label", "Carnet d'àrbitre · " + LEVEL_NAMES[l]);
      parent.appendChild(cv);
      var err = el("div", "vg-small");
      parent.appendChild(button("vg-btn white", "📤 Comparteix el carnet", function () {
        err.textContent = "";
        shareCard(cv, function () { err.textContent = "No s'ha pogut crear la imatge"; });
      }, "share"));
      parent.appendChild(err);
    }

    function levelsPage() {
      clear();
      var done = levelsPassed(best);
      var head = el("div", "vg-col vg-center");
      head.appendChild(pili(110, "happy", "green", "glasses"));
      head.appendChild(el("div", null, "Treu-te el carnet d'àrbitre! Cada examen té 10 preguntes del reglament FIVB i s'aprova amb 8 encerts. Els nivells s'obren un darrere l'altre."));
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
        if (isDone) row.appendChild(el("span", "vg-ref-ok", "✅ Aprovat"));
        box.appendChild(row);
        if (isOpen) {
          var b = button("vg-btn wide" + (isDone ? " white" : ""), isDone ? "Repeteix l'examen" : "Fes l'examen", function () { startExam(l); }, "level-" + l);
          box.appendChild(b);
        } else box.appendChild(el("div", "vg-ref-lock", "🔒 Aprova abans el nivell " + LEVEL_NAMES[l - 1]));
        col.appendChild(box);
      })(l);
      col.appendChild(el("div", "vg-ref-hint", best >= PERFECT ? "⭐⭐⭐⭐⭐ Examen Internacional perfecte!"
        : "⭐ La 5a estrella: treu un 10/10 a l'examen Internacional."));
      if (done > 0) col.appendChild(button("vg-btn", "🪪 El meu carnet", function () { showCard(done - 1); }, "mycard"));
    }

    function showCard(l) {
      closeCard();
      dialog = el("div", "vg-ref-dlg");
      var box = el("div");
      carnet(box, l);
      box.appendChild(button("vg-btn ghost", "Tanca", closeCard, "close"));
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
      col.appendChild(el("div", "vg-label", LEVEL_NAMES[level] + " · Pregunta " + (index + 1) + " de " + questions.length));
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
      t.appendChild(el("b", null, ok ? "Correcte! 🎉" : "Ui! No és aquesta 😅"));
      t.appendChild(el("div", "vg-small", q.explanation));
      fb.appendChild(t);
      col.appendChild(fb);
      var lastQ = index + 1 >= questions.length;
      var b = button("vg-btn", lastQ ? "Veure el resultat" : "Següent", function () {
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
      col.appendChild(el("div", "vg-big", hits + " de " + questions.length + " encerts"));
      var msg = el("div", null, ok ? "Aprovat! Ja tens el carnet de nivell " + LEVEL_NAMES[level] + " 🎉"
        : "Calen " + PASS + " encerts per aprovar. Torna-ho a provar!");
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
    title: "Carnet d'àrbitre",
    emoji: "🟨",
    help: "Treu-te el carnet d'àrbitre! Cada examen té 10 preguntes del reglament FIVB i s'aprova amb 8 encerts. Els nivells s'obren un darrere l'altre.",
    lives: 0,
    action: false,
    start: start,
    logic: { LEVELS: LEVELS, QUESTIONS: QUESTIONS, PASS: PASS, POINTS_PER_LEVEL: POINTS_PER_LEVEL, PERFECT: PERFECT,
      MIN_BANK: MIN_BANK, passed: passed, levelsPassed: levelsPassed, open: open, score: score, exam: exam,
      parse: parse, bank: bank, markPassed: markPassed, date: date, drawCard: drawCard, STORE: STORE }
  };
  if (VSPG.games && typeof VSPG.games.register === "function") VSPG.games.register(def);
})();
