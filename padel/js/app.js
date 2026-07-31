// App de participantes
(function () {
  const $ = id => document.getElementById(id);
  const esc = PadelBracket.escapeHtml;
  let state = null;
  let myData = null;

  // ---------- pestañas ----------
  document.querySelectorAll(".tab").forEach(t =>
    t.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
      t.classList.add("active");
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.add("hidden"));
      $("tab-" + t.dataset.tab).classList.remove("hidden");
    })
  );

  function showMsg(id, text, ok) {
    const el = $(id);
    el.textContent = text;
    el.className = "msg " + (ok ? "ok" : "error");
  }

  // ---------- carga de estado ----------
  async function load() {
    try {
      state = await PadelAPI.getState();
    } catch (e) {
      $("home-text").textContent = "No se puede conectar con el torneo: " + e.message;
      return;
    }
    $("t-name").textContent = state.name;
    $("t-club").textContent = state.club || "";
    document.title = state.name;

    const badges = {
      registration: '<span class="badge lime">Inscripción abierta</span>',
      in_progress: '<span class="badge green">Torneo en juego</span>',
      finished: '<span class="badge">Torneo finalizado</span>'
    };
    $("t-status-badge").innerHTML =
      state.status === "registration" && !state.registration_open
        ? '<span class="badge red">Inscripción cerrada</span>'
        : badges[state.status] || "";

    $("s-pairs").textContent = state.pairs_count;
    $("s-target").textContent = state.target_pairs;
    const days = (state.days || []).slice();
    $("s-days").textContent = days.length || "–";
    if (days.length) {
      $("home-days").innerHTML =
        "<b>📅 Días de juego:</b> " +
        days
          .map(d =>
            new Date(d + "T00:00:00").toLocaleDateString("es-ES", {
              weekday: "long", day: "numeric", month: "long"
            })
          )
          .map(esc)
          .join(" · ");
    }

    let txt;
    if (state.status === "registration" && state.registration_open) {
      const left = state.target_pairs - state.pairs_count;
      txt = left > 0
        ? `La inscripción está abierta. Quedan ${left} plazas de ${state.target_pairs}. ¡Apuntaos en la pestaña "Inscribirse"!`
        : "El torneo está completo. El organizador sorteará el cuadro en breve.";
    } else if (state.status === "registration") {
      txt = "La inscripción está cerrada. El organizador está preparando el sorteo del cuadro.";
    } else if (state.status === "in_progress") {
      txt = state.bracket_visible
        ? "¡El torneo está en marcha! Consultad el cuadro para ver los cruces y vuestros horarios."
        : "El torneo está en marcha. El cuadro se publicará en breve.";
    } else {
      txt = "El torneo ha terminado. ¡Gracias a todos por participar!";
    }
    $("home-text").textContent = txt;

    // campeones
    $("champion-area").innerHTML = state.champion
      ? `<div class="champion-banner"><div class="trophy">🏆</div>
           <div class="names">${esc(state.champion.player1)} y ${esc(state.champion.player2)}</div>
           <div class="hint">¡Campeones del torneo!</div></div>`
      : "";

    // inscripcion
    const open = state.status === "registration" && state.registration_open &&
                 state.pairs_count < state.target_pairs;
    $("insc-hint").textContent = open
      ? `(${state.pairs_count}/${state.target_pairs} parejas)`
      : "— cerrada";
    $("btn-signup").disabled = !open;

    // cuadro
    if (state.bracket_visible && state.matches && state.matches.length) {
      $("bracket-locked").classList.add("hidden");
      PadelBracket.render($("bracket-area"), state.matches, state.pairs || [], {});
    } else {
      $("bracket-locked").classList.remove("hidden");
      $("bracket-area").innerHTML = "";
    }
  }

  // ---------- inscripcion ----------
  $("btn-signup").addEventListener("click", async () => {
    const p1 = $("f-p1").value.trim(), p2 = $("f-p2").value.trim(), ph = $("f-phone").value.trim();
    if (!p1 || !p2) return showMsg("insc-msg", "Escribid el nombre de los dos jugadores", false);
    $("btn-signup").disabled = true;
    try {
      const r = await PadelAPI.signup(p1, p2, ph);
      $("insc-form").classList.add("hidden");
      $("insc-done").classList.remove("hidden");
      $("insc-code").textContent = r.code;
      load();
    } catch (e) {
      showMsg("insc-msg", e.message, false);
      $("btn-signup").disabled = false;
    }
  });

  // ---------- mi pareja ----------
  $("btn-mypair").addEventListener("click", loadMyPair);
  $("mp-code").addEventListener("keydown", e => { if (e.key === "Enter") loadMyPair(); });

  async function loadMyPair() {
    const code = $("mp-code").value.trim().toUpperCase();
    if (code.length < 6) return showMsg("mp-msg", "El código tiene 6 caracteres", false);
    $("mp-msg").className = "msg";
    try {
      myData = await PadelAPI.myPair(code);
      myData.code = code;
      localStorage.setItem("padel_code", code);
      renderMyPair();
    } catch (e) {
      showMsg("mp-msg", e.message, false);
    }
  }

  function renderMyPair() {
    const d = myData;
    const p = d.pair;
    let html = `<div class="card"><h2>🎾 ${esc(p.player1)} y ${esc(p.player2)}</h2>`;
    if (!d.bracket_visible) {
      html += `<p class="hint">Estáis inscritos. El cuadro aún no está publicado: cuando el organizador lo publique veréis aquí vuestro rival, día y hora.</p></div>`;
      $("mp-area").innerHTML = html;
      return;
    }
    const ms = d.matches || [];
    const next = ms.find(m => m.status === "ready");
    if (next) {
      const rival = next.pair1 && next.pair1.id === p.id ? next.pair2 : next.pair1;
      html += `<div class="card" style="background:rgba(46,107,255,0.1);border-color:rgba(46,107,255,0.45)">
        <h2>⏭️ Próximo partido <span class="hint">(${next.code})</span></h2>
        <p><b>Rival:</b> ${rival ? esc(rival.player1) + " y " + esc(rival.player2) : "por decidir"}</p>
        <p><b>Cuándo:</b> ${PadelBracket.fmtWhen(next) || "pendiente de horario"}</p>
        <button class="btn small" data-report="${next.id}">📝 Enviar resultado</button>
      </div>`;
    } else if (ms.length && ms.every(m => m.status !== "ready" && m.status !== "pending")) {
      html += `<p class="hint">No tenéis partidos pendientes ahora mismo.</p>`;
    } else {
      html += `<p class="hint">Vuestro próximo partido aún no está decidido: depende de otros resultados.</p>`;
    }
    html += `<h2 style="margin-top:1rem">📜 Vuestros partidos</h2><div class="table-scroll"><table>
      <tr><th>Partido</th><th>Rival</th><th>Cuándo</th><th>Resultado</th></tr>`;
    for (const m of ms) {
      const rival = m.pair1 && m.pair1.id === p.id ? m.pair2 : m.pair1;
      let res = "—";
      if (m.status === "played" || m.status === "bye") {
        const won = m.winner_id === p.id;
        res = (won ? "✅ Ganado" : "❌ Perdido") + (m.score ? " · " + esc(m.score) : m.status === "bye" ? " (bye)" : "");
      }
      html += `<tr><td>${m.code}</td>
        <td>${rival ? esc(rival.player1) + " / " + esc(rival.player2) : "<i>por decidir</i>"}</td>
        <td>${PadelBracket.fmtWhen(m) || "—"}</td><td>${res}</td></tr>`;
    }
    html += `</table></div></div>`;
    $("mp-area").innerHTML = html;

    document.querySelectorAll("[data-report]").forEach(b =>
      b.addEventListener("click", () => openResultModal(parseInt(b.dataset.report, 10)))
    );
  }

  // ---------- modal de resultado ----------
  let modalMatch = null;
  function openResultModal(matchId) {
    const m = (myData.matches || []).find(x => x.id === matchId);
    if (!m) return;
    modalMatch = m;
    $("rm-title").textContent = `Partido ${m.code}`;
    const opts = [m.pair1, m.pair2].filter(Boolean).map(
      p => `<option value="${p.id}">${esc(p.player1)} y ${esc(p.player2)}</option>`
    );
    $("rm-winner").innerHTML = opts.join("");
    $("rm-score").value = "";
    $("rm-msg").className = "msg";
    $("result-modal").classList.remove("hidden");
  }
  $("rm-cancel").addEventListener("click", () => $("result-modal").classList.add("hidden"));
  $("rm-send").addEventListener("click", async () => {
    if (!modalMatch) return;
    $("rm-send").disabled = true;
    try {
      await PadelAPI.reportResult(
        myData.code, modalMatch.id, parseInt($("rm-winner").value, 10), $("rm-score").value.trim()
      );
      $("result-modal").classList.add("hidden");
      myData = await PadelAPI.myPair(myData.code);
      myData.code = $("mp-code").value.trim().toUpperCase();
      renderMyPair();
      load();
    } catch (e) {
      showMsg("rm-msg", e.message, false);
    } finally {
      $("rm-send").disabled = false;
    }
  });

  // codigo recordado
  const saved = localStorage.getItem("padel_code");
  if (saved) $("mp-code").value = saved;

  load();
  setInterval(load, 60000); // refresco automatico cada minuto
})();
