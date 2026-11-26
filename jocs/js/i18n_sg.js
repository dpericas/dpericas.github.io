/* El camí de la Pili (web) — texts of the secret path games (sg_*.js) in Catalan (source), Spanish
 * and English. Copied from the app’s string resources (values{,-es,-en}/strings_secretpath.xml,
 * strings_sg_games_c.xml, strings_sg_games_d.xml): when a text changes in the app, change it here too.
 * Loaded after i18n.js: the rows are merged into VSPG.I18N (key: [ca, es, en]), so VSPG.t() finds them.
 * Every key starts with "sg." ({0}, {1}… = arguments of VSPG.t). */
(function () {
  "use strict";
  var VSPG = window.VSPG = window.VSPG || {};
  var S = {
    // ---- titles, help (start panel) and gesture (first-play tutorial) of the games
    "sg.runner.title": ["Cursa de la Pili", "Carrera de la Pili", "Pili’s run"],
    "sg.runner.help": ["La Pili corre i salta xarxes i bloquejos. Mantén premut per saltar més alt. Cada cop va més de pressa, amb més bloquejos i dobles xarxes. Cada obstacle superat, un punt.",
      "La Pili corre y salta redes y bloqueos. Mantén pulsado para saltar más alto. Cada vez va más rápido, con más bloqueos y redes dobles. Cada obstáculo superado, un punto.",
      "The Pili runs and jumps over nets and blocks. Hold to jump higher. It gets faster, with more blocks and double nets. One point per obstacle cleared."],
    "sg.runner.g": ["Toca per saltar (mantén per anar més amunt)", "Toca para saltar (mantén para subir más)", "Tap to jump (hold to go higher)"],
    "sg.ritme.title": ["Ritme de l’afició", "Ritmo de la afición", "Fans' rhythm"],
    "sg.ritme.help": ["Toca el tambor quan cada cop arribi a la línia, al ritme de l’afició. Perfecte = +2, bé = +1. Comença tranquil i cada cop va més de pressa i amb més cops. Deixar passar un cop o tocar-lo a destemps resta una vida (tres i s’acaba); tocar sense cap cop a prop resta un punt.",
      "Toca el tambor cuando cada golpe llegue a la línea, al ritmo de la afición. Perfecto = +2, bien = +1. Empieza tranquilo y cada vez va más rápido y con más golpes. Dejar pasar un golpe o tocarlo a destiempo resta una vida (tres y se acaba); tocar sin ningún golpe cerca resta un punto.",
      "Hit the drum when each beat reaches the line, to the fans' rhythm. Perfect = +2, good = +1. It starts calm and gets faster with more beats. Letting a beat pass or hitting it off time costs a life (three and it’s over); tapping with no beat near costs a point."],
    "sg.ritme.g": ["Toca al ritme", "Toca al ritmo", "Tap to the beat"],
    "sg.senyals.title": ["Senyals de l’àrbitre", "Señales del árbitro", "Referee signals"],
    "sg.senyals.help": ["Surt un gest de l’àrbitre: tria què vol dir abans que s’acabi el temps. Cada encert, un punt; cada cop va més de pressa. Tres errors i s’acaba.",
      "Sale un gesto del árbitro: elige qué significa antes de que se acabe el tiempo. Cada acierto, un punto; cada vez va más rápido. Tres errores y se acaba.",
      "A referee signal appears: pick what it means before time runs out. One point each; it gets faster. Three mistakes and it’s over."],
    "sg.senyals.g": ["Tria el significat del gest", "Elige el significado del gesto", "Pick the meaning of the signal"],
    "sg.trenca.title": ["Trenca-blocs", "Rompebloques", "Brick breaker"],
    "sg.trenca.help": ["Mou la Pili a sota i fes rebotar la pilota per trencar tots els blocs (la pilota surt sola). Si cau, perds una vida. Cada mur buidat, nivell nou i punts extra.",
      "Mueve a la Pili abajo y haz rebotar la pelota para romper todos los bloques (la pelota sale sola). Si cae, pierdes una vida. Cada muro vaciado, nivel nuevo y puntos extra.",
      "Move the Pili at the bottom and bounce the ball to break all the bricks (the ball serves itself). If it drops, you lose a life. Every cleared wall: new level and bonus points."],
    "sg.trenca.g": ["Arrossega la Pili", "Arrastra a la Pili", "Drag the Pili"],
    "sg.libero.title": ["Líbero", "Líbero", "Libero"],
    "sg.libero.help": ["Les rematades arriben des de tot arreu: llisca cap on aniran per capbussar-te i defensar-les. Cada defensa, un punt. Tres pilotes a terra i s’acaba.",
      "Los remates llegan desde todas partes: desliza hacia donde irán para lanzarte y defenderlos. Cada defensa, un punto. Tres pelotas al suelo y se acaba.",
      "Spikes come from everywhere: swipe where they will go to dive and dig them. One point per dig. Three balls on the floor and it’s over."],
    "sg.libero.g": ["Llisca cap a la pilota", "Desliza hacia la pelota", "Swipe towards the ball"],
    "sg.forat.title": ["On és el forat?", "¿Dónde está el hueco?", "Where is the gap?"],
    "sg.forat.help": ["Mira la defensa rival: quan s’amagui, toca la zona del camp que ha quedat buida abans que s’acabi el temps. Cada cop la veus menys estona.",
      "Mira la defensa rival: cuando se esconda, toca la zona del campo que ha quedado vacía antes de que se acabe el tiempo. Cada vez la ves menos rato.",
      "Watch the opponents' defence: when it hides, tap the area of the court left empty before time runs out. You see it for less time every round."],
    "sg.forat.g": ["Toca la zona buida", "Toca la zona vacía", "Tap the empty area"],

    // ---- shared texts of the secret path
    "sg.team_tag": ["Camí secret · {0}", "Camino secreto · {0}", "Secret path · {0}"],
    "sg.share_text": ["🏐 He fet {0} punts al joc secret «{1}» de l’app del Vòlei Santpedor. Trobaràs on és? {2}",
      "🏐 He hecho {0} puntos en el juego secreto «{1}» de la app del Vòlei Santpedor. ¿Encontrarás dónde está? {2}",
      "🏐 I scored {0} points in the secret game “{1}” of the Vòlei Santpedor app. Will you find it? {2}"],

    // ---- Ritme and Senyals (strings_sg_games_c.xml)
    "sg.perfect": ["Perfecte! +2", "¡Perfecto! +2", "Perfect! +2"],
    "sg.good": ["Bé! +1", "¡Bien! +1", "Good! +1"],
    "sg.miss": ["T’has deixat el cop!", "¡Se te ha escapado el golpe!", "Missed the beat!"],
    "sg.wrong": ["A destemps!", "¡A destiempo!", "Off the beat!"],
    "sg.combo": ["Ratxa ×{0}", "Racha ×{0}", "Streak ×{0}"],
    "sg.ok": ["Correcte! +1", "¡Correcto! +1", "Correct! +1"],
    "sg.ko": ["No!", "¡No!", "No!"],
    "sg.time": ["Temps!", "¡Tiempo!", "Time!"],
    "sg.sig.BALL_IN": ["Pilota a dins", "Balón dentro", "Ball in"],
    "sg.sig.BALL_OUT": ["Pilota a fora", "Balón fuera", "Ball out"],
    "sg.sig.BALL_TOUCHED": ["Pilota tocada", "Balón tocado", "Ball touched"],
    "sg.sig.NET_TOUCH": ["Toc a la xarxa", "Toque de red", "Net touch"],
    "sg.sig.FOUR_HITS": ["Quatre tocs", "Cuatro toques", "Four hits"],
    "sg.sig.DOUBLE_CONTACT": ["Doble toc", "Doble toque", "Double contact"],
    "sg.sig.TIME_OUT": ["Temps mort", "Tiempo muerto", "Time-out"],
    "sg.sig.SUBSTITUTION": ["Canvi de jugador", "Cambio de jugador", "Substitution"],
    "sg.sig.POSITIONAL_FAULT": ["Falta de posició o rotació", "Falta de posición o rotación", "Positional or rotation fault"],
    "sg.sig.END_OF_SET": ["Final de set", "Final de set", "End of set"],
    "sg.sig.DOUBLE_FAULT": ["Doble falta: es repeteix", "Doble falta: se repite", "Double fault: replay"],
    "sg.sig.YELLOW_CARD": ["Amonestació (targeta groga)", "Amonestación (tarjeta amarilla)", "Warning (yellow card)"],

    // ---- Trenca-blocs, Líbero, On és el forat? (strings_sg_games_d.xml)
    "sg.level": ["Nivell {0}", "Nivel {0}", "Level {0}"],
    "sg.dig": ["Defensa!", "¡Defensa!", "Dig!"],
    "sg.floor": ["A terra!", "¡Al suelo!", "On the floor!"],
    "sg.look": ["Mira la defensa…", "Mira la defensa…", "Watch the defence…"],
    "sg.where": ["On és el forat?", "¿Dónde está el hueco?", "Where is the gap?"],
    "sg.gap_ok": ["Forat! 🎯", "¡Hueco! 🎯", "Gap! 🎯"],
    "sg.gap_wrong": ["Hi havia algú!", "¡Había alguien!", "Someone was there!"],
    "sg.gap_late": ["Massa tard!", "¡Demasiado tarde!", "Too late!"],

    // ---- Cursa de la Pili (strings_eggs1.xml)
    "sg.runner.score": ["Xarxes: {0}", "Redes: {0}", "Nets: {0}"],
    "sg.runner.area": ["Zona de joc: toca per saltar", "Zona de juego: toca para saltar", "Game area: tap to jump"],
    "sg.ritme.area": ["Tambor: toca quan el cop arribi a la línia", "Tambor: toca cuando el golpe llegue a la línea", "Drum: tap when the beat reaches the line"]
  };
  var D = VSPG.I18N = VSPG.I18N || {};
  Object.keys(S).forEach(function (k) { D[k] = S[k]; });
})();
