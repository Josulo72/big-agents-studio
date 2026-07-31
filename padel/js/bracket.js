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

  // ---------- RENDERIZADO ----------

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

  function matchCard(pairsById, m, highlightId, onClickAttr) {
    const when = fmtWhen(m);
    return `
      <div class="match-card status-${m.status}" data-match="${m.id || m.code}" ${onClickAttr || ""}>
        <div class="match-head"><span class="match-code">${m.code}</span>${
          m.score ? `<span class="match-score">${escapeHtml(m.score)}</span>` : ""
        }${m.status === "bye" ? '<span class="match-score">bye</span>' : ""}</div>
        ${slotHtml(pairsById, m, 1, highlightId)}
        ${slotHtml(pairsById, m, 2, highlightId)}
        ${when ? `<div class="match-when">${when}</div>` : ""}
      </div>`;
  }

  // Renderiza los tres cuadros en el contenedor dado
  function render(container, matches, pairs, opts) {
    opts = opts || {};
    const pairsById = {};
    for (const p of pairs) pairsById[p.id] = p;

    const groups = { W: {}, L: {}, GF: {} };
    for (const m of matches) {
      if (m.status === "void") continue;
      (groups[m.bracket][m.round] = groups[m.bracket][m.round] || []).push(m);
    }

    function roundTitle(bracket, r, totalRounds) {
      if (bracket === "GF") return r === 1 ? "Gran Final" : "Desempate";
      if (bracket === "W") {
        if (r === totalRounds) return "Final de ganadores";
        if (r === totalRounds - 1) return "Semifinales";
        return `Ronda ${r}`;
      }
      return `Perdedores R${r}`;
    }

    function bracketHtml(key, title, cssClass) {
      const rounds = Object.keys(groups[key]).map(Number).sort((a, b) => a - b);
      if (!rounds.length) return "";
      const total = Math.max(...rounds);
      const cols = rounds
        .map(r => {
          const ms = groups[key][r].sort((a, b) => a.position - b.position);
          return `<div class="bracket-round">
              <div class="round-title">${roundTitle(key, r, total)}</div>
              <div class="round-matches">${ms
                .map(m => matchCard(pairsById, m, opts.highlightId, opts.clickable ? 'data-clickable="1"' : ""))
                .join("")}</div>
            </div>`;
        })
        .join("");
      return `<section class="bracket-section ${cssClass}">
          <h3 class="bracket-title">${title}</h3>
          <div class="bracket-scroll"><div class="bracket-grid">${cols}</div></div>
        </section>`;
    }

    container.innerHTML =
      bracketHtml("W", "🏆 Cuadro principal", "bracket-w") +
      bracketHtml("L", "🔁 Cuadro de perdedores (repesca)", "bracket-l") +
      bracketHtml("GF", "🌟 Gran final", "bracket-gf");
  }

  window.PadelBracket = { generate, render, pairName, fmtWhen, escapeHtml };
})();
