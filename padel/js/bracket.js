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


  // ---------- RENDERIZADO: estilo poster, final en el centro con trofeo ----------

  const CARD_W = 232, CARD_H = 98, GAP_X = 64, GAP_Y = 24;
  const COL_W = CARD_W + GAP_X, U = CARD_H + GAP_Y, TOP_PAD = 52;

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

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function displayCode(code) {
    return String(code).split("·").pop();
  }

  function slotHtml(pairsById, m, slot, highlightId) {
    const id = slot === 1 ? m.pair1_id : m.pair2_id;
    const isVoid = slot === 1 ? m.slot1_void : m.slot2_void;
    const won = m.winner_id && id === m.winner_id;
    const lost = m.winner_id && id && id !== m.winner_id;
    const mine = highlightId && id === highlightId;
    const p = pairsById[id];
    let label;
    if (p) {
      const seed = p.seed ? `<span class="seed">${p.seed}</span>` : "";
      label = `${seed}<span class="names">${escapeHtml(p.player1)} / ${escapeHtml(p.player2)}</span>`;
    } else if (isVoid) label = '<span class="bye">— bye —</span>';
    else label = '<span class="tbd">Por decidir</span>';
    return `<div class="slot ${won ? "won" : ""} ${lost ? "lost" : ""} ${mine ? "mine" : ""}">${label}${
      won ? '<span class="tick">✓</span>' : ""
    }</div>`;
  }

  function matchCard(pairsById, m, x, y, highlightId, clickable, extraClass) {
    if (m.status === "void") return "";
    const when = fmtWhen(m);
    return `
      <div class="match-card status-${m.status} ${extraClass || ""}"
           style="left:${x}px;top:${y}px" data-match="${m.id || m.code}" ${clickable ? 'data-clickable="1"' : ""}>
        <div class="match-head"><span class="match-code">${displayCode(m.code)}</span>${
          m.score ? `<span class="match-score">${escapeHtml(m.score)}</span>` : ""
        }${m.status === "bye" ? '<span class="match-score">pasa directo</span>' : ""}${
          when ? `<span class="match-when">${when}</span>` : ""
        }</div>
        ${slotHtml(pairsById, m, 1, highlightId)}
        <div class="vs-line"></div>
        ${slotHtml(pairsById, m, 2, highlightId)}
      </div>`;
  }

  function roundName(count) {
    if (count === 1) return "Semifinal"; // ultima columna lateral antes de la final central
    if (count === 2) return "Semifinales";
    if (count === 4) return "Cuartos";
    if (count === 8) return "Octavos";
    if (count === 16) return "Dieciseisavos";
    return null;
  }

  function curve(x1, y1, x2, y2, done) {
    const dx = (x2 - x1) / 2;
    const color = done ? "url(#gradLime)" : "rgba(147,160,189,0.25)";
    const glow = done ? 'filter="url(#glow)"' : "";
    return `<path d="M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}"
      fill="none" stroke="${color}" stroke-width="${done ? 3 : 2}" ${glow}/>`;
  }

  const SVG_DEFS = `<defs>
    <linearGradient id="gradLime" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#d5582e"/><stop offset="100%" stop-color="#ffb03a"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>`;

  // ---- CUADRO PRINCIPAL: dos mitades enfrentadas y la final en el centro ----
  function renderMain(matches, pairsById, opts) {
    const w = {};
    let gf1 = null, gf2 = null;
    for (const m of matches) {
      if (m.bracket === "W") (w[m.round] = w[m.round] || []).push(m);
      if (m.bracket === "GF" && m.round === 1) gf1 = m;
      if (m.bracket === "GF" && m.round === 2 && m.status !== "void") gf2 = m;
    }
    const rounds = Object.keys(w).map(Number).sort((a, b) => a - b);
    if (!rounds.length) return "";
    const R = Math.max(...rounds);
    for (const r of rounds) w[r].sort((a, b) => a.position - b.position);

    const totalCols = R === 1 ? 1 : 2 * R - 1;
    const centerCol = R === 1 ? 0 : R - 1;
    const width = totalCols * COL_W - GAP_X + 16;
    const sideH = R === 1 ? U : Math.pow(2, R - 2) * U; // altura de cada mitad
    const yOf = (r, p) => p * U * Math.pow(2, r - 1) + ((Math.pow(2, r - 1) - 1) * U) / 2;

    const pos = {}; // code -> {x, y, side}  (side: -1 izq, 1 dcha, 0 centro)
    let labels = "", cards = "";

    for (const r of rounds) {
      if (r === R) continue; // la final va al centro
      const half = Math.pow(2, R - r - 1);
      const leftCol = r - 1, rightCol = totalCols - r;
      const count = Math.pow(2, R - r);
      const title = roundName(count) || `Ronda ${r}`;
      labels += `<div class="round-label" style="left:${leftCol * COL_W}px;width:${CARD_W}px">${title}</div>`;
      labels += `<div class="round-label" style="left:${rightCol * COL_W}px;width:${CARD_W}px">${title}</div>`;
      for (const m of w[r]) {
        const p0 = m.position - 1;
        const left = p0 < half;
        const idx = left ? p0 : p0 - half;
        const x = (left ? leftCol : rightCol) * COL_W;
        const y = yOf(r, idx) + TOP_PAD;
        pos[m.code] = { x, y, side: left ? -1 : 1 };
        cards += matchCard(pairsById, m, x, y, opts.highlightId, opts.clickable);
      }
    }

    // columna central: final W + trofeo + gran final (+ desempate)
    const wFinal = w[R][0];
    const stackParts = 2 + (gf2 ? 1 : 0); // final W + GF1 (+GF2)
    const TROPHY_H = 150;
    const stackH = stackParts * CARD_H + TROPHY_H + (stackParts - 1) * 26;
    const yStart = Math.max(8, (sideH - stackH) / 2) + TOP_PAD;
    const cx = centerCol * COL_W;

    labels += `<div class="round-label label-final" style="left:${cx}px;width:${CARD_W}px">Final de ganadores</div>`;
    pos[wFinal.code] = { x: cx, y: yStart, side: 0 };
    cards += matchCard(pairsById, wFinal, cx, yStart, opts.highlightId, opts.clickable, "final-card");

    const trophyY = yStart + CARD_H + 10;
    cards += `<div class="trophy-block" style="left:${cx}px;top:${trophyY}px;width:${CARD_W}px">
        <div class="trophy-rays"></div><div class="trophy">🏆</div>
        <div class="trophy-caption">GRAN FINAL</div>
      </div>`;

    let gfY = trophyY + TROPHY_H + 4;
    if (gf1) {
      pos[gf1.code] = { x: cx, y: gfY, side: 0 };
      cards += matchCard(pairsById, gf1, cx, gfY, opts.highlightId, opts.clickable, "gf-card");
      gfY += CARD_H + 26;
    }
    if (gf2) {
      pos[gf2.code] = { x: cx, y: gfY, side: 0 };
      labels += "";
      cards += matchCard(pairsById, gf2, cx, gfY, opts.highlightId, opts.clickable, "gf-card gf2-card");
      gfY += CARD_H + 26;
    }

    const height = Math.max(sideH + TOP_PAD, gfY) + 14;

    // conectores curvos
    let paths = "";
    for (const m of matches) {
      if (m.bracket !== "W" || m.status === "void") continue;
      const from = pos[m.code], to = m.win_next_code && pos[m.win_next_code];
      if (!from || !to) continue;
      const done = !!m.winner_id;
      const fy = from.y + CARD_H / 2, ty = to.y + CARD_H / 2;
      if (from.side <= 0 && to.x > from.x) {
        paths += curve(from.x + CARD_W, fy, to.x, ty, done);
      } else if (from.side === 1 || to.x < from.x) {
        paths += curve(from.x, fy, to.x + CARD_W, ty, done);
      }
    }
    // final W -> GF1 (linea vertical a traves del trofeo)
    if (gf1 && pos[wFinal.code] && pos[gf1.code]) {
      const x = cx + CARD_W / 2;
      const done = !!wFinal.winner_id;
      paths += `<path d="M ${x} ${pos[wFinal.code].y + CARD_H} V ${pos[gf1.code].y}" fill="none"
        stroke="${done ? "url(#gradLime)" : "rgba(147,160,189,0.25)"}" stroke-width="${done ? 3 : 2}" stroke-dasharray="5 5"/>`;
    }

    return `<section class="bracket-section">
        <h3 class="bracket-title">🏆 Cuadro principal <span class="hint">quien pierde baja a la repesca y sigue vivo</span></h3>
        <div class="bracket-scroll"><div class="bracket-canvas" style="width:${width}px;height:${height}px">
          <svg class="connectors" width="${width}" height="${height}">${SVG_DEFS}${paths}</svg>
          ${labels}${cards}
        </div></div>
      </section>`;
  }

  // ---- CUADRO DE PERDEDORES: arbol de izquierda a derecha ----
  function renderLosers(matches, pairsById, opts) {
    const l = {};
    for (const m of matches) if (m.bracket === "L") (l[m.round] = l[m.round] || []).push(m);
    const rounds = Object.keys(l).map(Number).sort((a, b) => a - b);
    if (!rounds.length) return "";
    for (const r of rounds) l[r].sort((a, b) => a.position - b.position);
    const last = Math.max(...rounds);

    const pos = {};
    let labels = "", cards = "";
    rounds.forEach((o, ci) => {
      const j = Math.ceil(o / 2);
      labels += `<div class="round-label label-l" style="left:${ci * COL_W}px;width:${CARD_W}px">${
        o === last ? "Final de repesca" : `Repesca ${o}`
      }</div>`;
      for (const m of l[o]) {
        const y = (m.position - 1) * U * Math.pow(2, j - 1) + ((Math.pow(2, j - 1) - 1) * U) / 2 + TOP_PAD;
        pos[m.code] = { x: ci * COL_W, y };
        cards += matchCard(pairsById, m, ci * COL_W, y, opts.highlightId, opts.clickable);
      }
    });

    const width = rounds.length * COL_W - GAP_X + 16;
    let height = 0;
    for (const c in pos) height = Math.max(height, pos[c].y + CARD_H);
    height += 14;

    let paths = "";
    for (const m of matches) {
      if (m.bracket !== "L" || m.status === "void") continue;
      const from = pos[m.code], to = m.win_next_code && pos[m.win_next_code];
      if (from && to) paths += curve(from.x + CARD_W, from.y + CARD_H / 2, to.x, to.y + CARD_H / 2, !!m.winner_id);
    }

    return `<section class="bracket-section">
        <h3 class="bracket-title">🔥 Cuadro de perdedores <span class="hint">el ganador de la repesca se gana el puesto en la Gran Final</span></h3>
        <div class="bracket-scroll"><div class="bracket-canvas" style="width:${width}px;height:${height}px">
          <svg class="connectors" width="${width}" height="${height}">${SVG_DEFS}${paths}</svg>
          ${labels}${cards}
        </div></div>
      </section>`;
  }

  // ---- Podio (campeon, finalista, 3er puesto) ----
  function renderPodium(matches, pairsById) {
    let gf = null, lastGF = null, lFinal = null, lastL = 0;
    for (const m of matches) {
      if (m.bracket === "GF" && m.winner_id && (!lastGF || m.round > lastGF.round)) lastGF = m;
      if (m.bracket === "GF" && m.round === 1) gf = m;
      if (m.bracket === "L" && m.round > lastL) { lastL = m.round; lFinal = m; }
    }
    if (!lastGF) return "";
    const champ = lastGF.winner_id;
    const second = lastGF.pair1_id === champ ? lastGF.pair2_id : lastGF.pair1_id;
    const third = lFinal && lFinal.winner_id
      ? (lFinal.pair1_id === lFinal.winner_id ? lFinal.pair2_id : lFinal.pair1_id)
      : null;
    const item = (medal, cls, id, label) => id ? `
      <div class="podium-item ${cls}"><div class="medal">${medal}</div>
        <div class="podium-names">${escapeHtml(pairName(pairsById, id, true))}</div>
        <div class="podium-label">${label}</div></div>` : "";
    return `<div class="podium">
        ${item("🥈", "silver", second, "Finalistas")}
        ${item("🏆", "gold", champ, "CAMPEONES")}
        ${item("🥉", "bronze", third, "3er puesto")}
      </div>`;
  }

  // Renderiza el cuadro completo de UNA categoria
  function render(container, matches, pairs, opts) {
    opts = opts || {};
    const pairsById = {};
    for (const p of pairs) pairsById[p.id] = p;
    container.innerHTML =
      renderPodium(matches, pairsById) +
      renderMain(matches, pairsById, opts) +
      renderLosers(matches, pairsById, opts);
    centerScroll(container);
  }

  // Centra el scroll del cuadro principal en la Gran Final
  function centerScroll(container) {
    const scroll = container.querySelector(".bracket-section .bracket-scroll");
    if (!scroll || !scroll.clientWidth) return;
    const canvas = scroll.querySelector(".bracket-canvas");
    if (canvas) scroll.scrollLeft = Math.max(0, (canvas.offsetWidth - scroll.clientWidth) / 2 + 8);
  }

  window.PadelBracket = { generate, render, centerScroll, pairName, fmtWhen, escapeHtml, displayCode };
})();
