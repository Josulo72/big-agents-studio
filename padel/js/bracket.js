// Motor del cuadro de doble eliminacion (ganadores + perdedores + gran final)
// Genera la estructura completa en el navegador del admin y la renderiza en ambas apps.
(function () {
  function nextPow2(n) {
    let p = 1;
    while (p < n) p *= 2;
    return p;
  }

  // Posiciones de siembra clasicas: reparte los byes por todo el cuadro
  function seedSlots(P) {
    let arr = [1];
    while (arr.length < P) {
      const m = arr.length * 2 + 1;
      const next = [];
      for (const s of arr) next.push(s, m - s);
      arr = next;
    }
    return arr; // arr[slot] = seed que ocupa ese hueco
  }

  // pairIds: array de ids YA en el orden del sorteo (seed 1, seed 2, ...)
  // doubleFinal: si true, se crea GF2 (desempate si gana el de perdedores)
  function generate(pairIds, doubleFinal) {
    const N = pairIds.length;
    if (N < 2) throw new Error("Hacen falta al menos 2 parejas");
    if (N > 200) throw new Error("Maximo 200 parejas");
    const P = nextPow2(N);
    const R = Math.log2(P);
    const matches = {}; // code -> match

    function add(m) {
      matches[m.code] = Object.assign(
        {
          pair1_id: null, pair2_id: null, slot1_void: false, slot2_void: false,
          winner_id: null, score: "", status: "pending", stage: 1,
          win_next_code: null, win_next_slot: null, lose_next_code: null, lose_next_slot: null
        },
        m
      );
    }

    // ----- Cuadro de ganadores (W) -----
    for (let r = 1; r <= R; r++) {
      const count = P / Math.pow(2, r);
      for (let i = 0; i < count; i++) {
        const m = { code: `W${r}-${i + 1}`, bracket: "W", round: r, position: i + 1 };
        if (r < R) {
          m.win_next_code = `W${r + 1}-${Math.floor(i / 2) + 1}`;
          m.win_next_slot = (i % 2) + 1;
        } else {
          m.win_next_code = "GF1";
          m.win_next_slot = 1;
        }
        if (P === 2) {
          // caso especial: solo 2 parejas, el perdedor va directo a la final
          m.lose_next_code = "GF1";
          m.lose_next_slot = 2;
        } else if (r === 1) {
          m.lose_next_code = `L1-${Math.floor(i / 2) + 1}`;
          m.lose_next_slot = (i % 2) + 1;
        } else {
          // perdedores de W ronda r caen en L ronda 2(r-1), hueco 1
          const target = 2 * (r - 1);
          const tCount = P / Math.pow(2, r);
          const pos = r % 2 === 0 ? tCount - 1 - i : i; // alterna para evitar revanchas inmediatas
          m.lose_next_code = `L${target}-${pos + 1}`;
          m.lose_next_slot = 1;
        }
        add(m);
      }
    }

    // ----- Cuadro de perdedores (L) -----
    if (P >= 4) {
      for (let j = 1; j <= R - 1; j++) {
        const count = P / Math.pow(2, j + 1);
        const odd = 2 * j - 1;
        const even = 2 * j;
        for (let i = 0; i < count; i++) {
          add({
            code: `L${odd}-${i + 1}`, bracket: "L", round: odd, position: i + 1,
            win_next_code: `L${even}-${i + 1}`, win_next_slot: 2
          });
        }
        for (let i = 0; i < count; i++) {
          const m = { code: `L${even}-${i + 1}`, bracket: "L", round: even, position: i + 1 };
          if (j < R - 1) {
            m.win_next_code = `L${2 * j + 1}-${Math.floor(i / 2) + 1}`;
            m.win_next_slot = (i % 2) + 1;
          } else {
            m.win_next_code = "GF1";
            m.win_next_slot = 2;
          }
          add(m);
        }
      }
    }

    // ----- Gran final -----
    add({ code: "GF1", bracket: "GF", round: 1, position: 1 });
    if (doubleFinal) add({ code: "GF2", bracket: "GF", round: 2, position: 1 });

    // ----- Colocar parejas en W1 segun siembra -----
    const slots = seedSlots(P);
    for (let i = 0; i < P / 2; i++) {
      const m = matches[`W1-${i + 1}`];
      const s1 = slots[2 * i], s2 = slots[2 * i + 1];
      if (s1 <= N) m.pair1_id = pairIds[s1 - 1]; else m.slot1_void = true;
      if (s2 <= N) m.pair2_id = pairIds[s2 - 1]; else m.slot2_void = true;
      if (m.pair1_id && m.pair2_id) m.status = "ready";
    }

    // ----- Resolver byes y huecos muertos en cascada -----
    function place(code, slot, pairId) {
      const m = matches[code];
      if (!m) return;
      if (slot === 1) m.pair1_id = pairId; else m.pair2_id = pairId;
      if (m.pair1_id && m.pair2_id) {
        if (m.status === "pending") m.status = "ready";
      } else if ((slot === 1 && m.slot2_void) || (slot === 2 && m.slot1_void)) {
        win(m, pairId, true);
      }
    }
    function markVoid(code, slot) {
      const m = matches[code];
      if (!m) return;
      if (slot === 1) m.slot1_void = true; else m.slot2_void = true;
      if (["played", "bye", "void"].includes(m.status)) return;
      if (m.slot1_void && m.slot2_void) {
        m.status = "void";
        if (m.win_next_code) markVoid(m.win_next_code, m.win_next_slot);
        if (m.lose_next_code) markVoid(m.lose_next_code, m.lose_next_slot);
      } else if (m.slot1_void && m.pair2_id) {
        win(m, m.pair2_id, true);
      } else if (m.slot2_void && m.pair1_id) {
        win(m, m.pair1_id, true);
      }
    }
    function win(m, winnerId, isBye) {
      m.winner_id = winnerId;
      m.status = isBye ? "bye" : "played";
      if (m.bracket === "GF") return;
      if (m.win_next_code) place(m.win_next_code, m.win_next_slot, winnerId);
      const loser = m.pair1_id === winnerId ? m.pair2_id : m.pair1_id;
      if (m.lose_next_code) {
        if (loser) place(m.lose_next_code, m.lose_next_slot, loser);
        else markVoid(m.lose_next_code, m.lose_next_slot);
      }
    }
    for (let i = 0; i < P / 2; i++) {
      const m = matches[`W1-${i + 1}`];
      if (m.status === "pending") {
        if (m.pair1_id && m.slot2_void) win(m, m.pair1_id, true);
        else if (m.pair2_id && m.slot1_void) win(m, m.pair2_id, true);
      }
    }

    // ----- Calcular etapa (orden logico de juego) -----
    const list = Object.values(matches);
    const byCode = matches;
    const stageOf = {};
    function stage(code) {
      if (stageOf[code] !== undefined) return stageOf[code];
      stageOf[code] = 0; // evita ciclos (no los hay)
      let s = 0;
      for (const m of list) {
        if (m.win_next_code === code || m.lose_next_code === code) {
          s = Math.max(s, stage(m.code));
        }
      }
      stageOf[code] = s + 1;
      return stageOf[code];
    }
    for (const m of list) m.stage = stage(m.code);

    return list.sort((a, b) => a.stage - b.stage || a.round - b.round || a.position - b.position);
  }

  // ---------- RENDERIZADO (arbol clasico con lineas conectoras) ----------

  const CARD_W = 224, CARD_H = 104, GAP_X = 52, GAP_Y = 22;
  const COL_W = CARD_W + GAP_X, U = CARD_H + GAP_Y, TOP_PAD = 46;

  function pairName(pairsById, id, short) {
    const p = pairsById[id];
    if (!p) return "—";
    return short ? `${p.player1} / ${p.player2}` : `${p.player1} y ${p.player2}`;
  }

  function fmtWhen(m) {
    if (!m.scheduled_at) return "";
    const d = new Date(m.scheduled_at);
    const day = d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
    const time = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    return `${day} · ${time}${m.court ? " · " + m.court : ""}`;
  }

  function slotHtml(pairsById, m, slot, highlightId) {
    const id = slot === 1 ? m.pair1_id : m.pair2_id;
    const isVoid = slot === 1 ? m.slot1_void : m.slot2_void;
    const won = m.winner_id && id === m.winner_id;
    const lost = m.winner_id && id && id !== m.winner_id;
    const mine = highlightId && id === highlightId;
    let label;
    if (id) label = escapeHtml(pairName(pairsById, id, true));
    else if (isVoid) label = '<span class="bye">BYE</span>';
    else label = '<span class="tbd">Por decidir</span>';
    return `<div class="slot ${won ? "won" : ""} ${lost ? "lost" : ""} ${mine ? "mine" : ""}">${label}</div>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function matchCard(pairsById, m, x, y, highlightId, clickable) {
    if (m.status === "void") return ""; // hueco estructural: se deja el espacio vacio
    const when = fmtWhen(m);
    const isGF = m.bracket === "GF";
    return `
      <div class="match-card status-${m.status} ${isGF ? "gf-card" : ""}"
           style="left:${x}px;top:${y}px" data-match="${m.id || m.code}" ${clickable ? 'data-clickable="1"' : ""}>
        <div class="match-head"><span class="match-code">${isGF ? (m.round === 1 ? "🏆 GRAN FINAL" : "🔥 DESEMPATE") : m.code}</span>${
          m.score ? `<span class="match-score">${escapeHtml(m.score)}</span>` : ""
        }${m.status === "bye" ? '<span class="match-score">pasa directo</span>' : ""}</div>
        ${slotHtml(pairsById, m, 1, highlightId)}
        ${slotHtml(pairsById, m, 2, highlightId)}
        ${when ? `<div class="match-when">${when}</div>` : ""}
      </div>`;
  }

  // Nombre de ronda segun cuantos partidos quedan en ella
  function roundName(count, isLast) {
    if (count === 1) return isLast ? "Final" : "Ronda final";
    if (count === 2) return "Semifinales";
    if (count === 4) return "Cuartos";
    if (count === 8) return "Octavos";
    if (count === 16) return "Dieciseisavos";
    return null;
  }

  // Dibuja un arbol: cols = [{title, matches:[{m,y}]}] ya posicionados
  function treeHtml(title, subtitle, cols, links, pairsById, opts, extraClass) {
    if (!cols.length) return "";
    const width = cols.length * COL_W - GAP_X + 8;
    let height = 0;
    for (const c of cols) for (const it of c.items) height = Math.max(height, it.y + CARD_H);
    height += 10;

    let cards = "", labels = "";
    cols.forEach((c, i) => {
      labels += `<div class="round-label" style="left:${i * COL_W}px;width:${CARD_W}px">${c.title}</div>`;
      for (const it of c.items) {
        cards += matchCard(pairsById, it.m, i * COL_W, it.y + TOP_PAD, opts.highlightId, opts.clickable);
      }
    });

    let paths = "";
    for (const l of links) {
      const x1 = l.fromCol * COL_W + CARD_W, y1 = l.fromY + TOP_PAD + CARD_H / 2;
      const x2 = l.toCol * COL_W, y2 = l.toY + TOP_PAD + CARD_H / 2;
      const midX = x1 + GAP_X / 2;
      const color = l.done ? "rgba(212,255,63,0.55)" : "rgba(147,160,189,0.22)";
      paths += `<path d="M ${x1} ${y1} H ${midX} V ${y2} H ${x2}" fill="none" stroke="${color}" stroke-width="2"/>`;
    }

    return `<section class="bracket-section ${extraClass || ""}">
        <h3 class="bracket-title">${title} ${subtitle ? `<span class="hint">${subtitle}</span>` : ""}</h3>
        <div class="bracket-scroll"><div class="bracket-canvas" style="width:${width}px;height:${height + TOP_PAD}px">
          <svg class="connectors" width="${width}" height="${height + TOP_PAD}">${paths}</svg>
          ${labels}${cards}
        </div></div>
      </section>`;
  }

  // Renderiza los cuadros (ganadores+final y perdedores) como arboles conectados
  function render(container, matches, pairs, opts) {
    opts = opts || {};
    const pairsById = {};
    for (const p of pairs) pairsById[p.id] = p;

    const byBracket = { W: {}, L: {}, GF: {} };
    for (const m of matches) {
      (byBracket[m.bracket][m.round] = byBracket[m.bracket][m.round] || []).push(m);
    }
    for (const b of Object.keys(byBracket))
      for (const r of Object.keys(byBracket[b]))
        byBracket[b][r].sort((a, b2) => a.position - b2.position);

    // ---- Cuadro principal: rondas W + Gran Final ----
    const wRounds = Object.keys(byBracket.W).map(Number).sort((a, b) => a - b);
    const R = wRounds.length ? Math.max(...wRounds) : 0;
    const cols = [], links = [], pos = {}; // code -> {col, y}

    const yW = (r, p) => p * U * Math.pow(2, r - 1) + ((Math.pow(2, r - 1) - 1) * U) / 2;

    for (const r of wRounds) {
      const ms = byBracket.W[r];
      const total = Math.pow(2, R - r); // partidos estructurales de la ronda
      const items = ms.map(m => {
        const y = yW(r, m.position - 1);
        pos[m.code] = { col: r - 1, y };
        return { m, y };
      });
      cols.push({ title: r === R ? "Final de ganadores" : roundName(total, false) || `Ronda ${r}`, items });
    }
    const gf1 = (byBracket.GF[1] || [])[0];
    const gf2 = (byBracket.GF[2] || [])[0];
    if (gf1) {
      const y = R ? yW(R, 0) : 0;
      pos[gf1.code] = { col: cols.length, y };
      cols.push({ title: "Gran Final", items: [{ m: gf1, y }] });
      if (gf2 && gf2.status !== "void") {
        pos[gf2.code] = { col: cols.length, y };
        cols.push({ title: "Desempate", items: [{ m: gf2, y }] });
        links.push({ fromCol: pos[gf1.code].col, fromY: y, toCol: pos[gf2.code].col, toY: y,
                     done: gf2.status === "ready" || !!gf2.winner_id });
      }
    }
    for (const m of matches) {
      if (m.status === "void") continue;
      if (m.bracket === "L") continue;
      const from = pos[m.code], to = m.win_next_code && pos[m.win_next_code];
      if (from && to)
        links.push({ fromCol: from.col, fromY: from.y, toCol: to.col, toY: to.y, done: !!m.winner_id });
    }

    // ---- Cuadro de perdedores ----
    const lRounds = Object.keys(byBracket.L).map(Number).sort((a, b) => a - b);
    const lCols = [], lLinks = [], lPos = {};
    for (const o of lRounds) {
      const j = Math.ceil(o / 2); // bloque: rondas 2j-1 y 2j comparten altura
      const ms = byBracket.L[o];
      const items = ms.map(m => {
        const y = (m.position - 1) * U * Math.pow(2, j - 1) + ((Math.pow(2, j - 1) - 1) * U) / 2;
        lPos[m.code] = { col: lCols.length, y };
        return { m, y };
      });
      const isLast = o === Math.max(...lRounds);
      lCols.push({ title: isLast ? "Final de repesca" : `Repesca ${o}`, items });
    }
    for (const m of matches) {
      if (m.bracket !== "L" || m.status === "void") continue;
      const from = lPos[m.code], to = m.win_next_code && lPos[m.win_next_code];
      if (from && to)
        lLinks.push({ fromCol: from.col, fromY: from.y, toCol: to.col, toY: to.y, done: !!m.winner_id });
    }

    container.innerHTML =
      treeHtml("🏆 Cuadro principal", "quien pierde baja a la repesca", cols, links, pairsById, opts, "bracket-w") +
      treeHtml("🔁 Cuadro de perdedores", "segunda vida: el ganador de la repesca juega la Gran Final", lCols, lLinks, pairsById, opts, "bracket-l");
  }

  window.PadelBracket = { generate, render, pairName, fmtWhen, escapeHtml };
})();
