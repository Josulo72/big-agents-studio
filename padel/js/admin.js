// Panel del organizador
(function () {
  const $ = id => document.getElementById(id);
  const esc = PadelBracket.escapeHtml;
  let pass = sessionStorage.getItem("padel_admin_pass") || "";
  let state = null; // {tournament, pairs, matches}
  let currentCat = null;

  function cats() { return (state && state.tournament.categories) || ["General"]; }

  function showMsg(id, text, ok) {
    const el = $(id);
    el.textContent = text;
    el.className = "msg " + (ok ? "ok" : "error");
    if (ok) setTimeout(() => (el.className = "msg"), 3500);
  }

  // ---------- pestañas ----------
  document.querySelectorAll(".tab").forEach(t =>
    t.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
      t.classList.add("active");
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.add("hidden"));
      $("tab-" + t.dataset.tab).classList.remove("hidden");
      if (t.dataset.tab === "cuadro") PadelBracket.centerScroll($("a-bracket-area"));
    })
  );

  // ---------- login ----------
  $("btn-login").addEventListener("click", login);
  $("login-pass").addEventListener("keydown", e => { if (e.key === "Enter") login(); });
  $("btn-logout").addEventListener("click", () => {
    sessionStorage.removeItem("padel_admin_pass");
    location.reload();
  });

  async function login() {
    const p = $("login-pass").value;
    try {
      await PadelAPI.adminLogin(p);
      pass = p;
      sessionStorage.setItem("padel_admin_pass", p);
      $("login-view").classList.add("hidden");
      $("panel-view").classList.remove("hidden");
      await refresh();
    } catch (e) {
      showMsg("login-msg", e.message, false);
    }
  }

  // ---------- refresco ----------
  async function refresh() {
    state = await PadelAPI.adminState(pass);
    const t = state.tournament;
    $("a-name").textContent = t.name;

    const played = state.matches.filter(m => m.status === "played").length;
    const pending = state.matches.filter(m => ["ready", "pending"].includes(m.status)).length;
    $("st-pairs").textContent = `${state.pairs.length}/${t.target_pairs}`;
    $("st-played").textContent = played;
    $("st-pending").textContent = state.matches.length ? pending : "–";
    $("st-visible").textContent = t.bracket_visible ? "Sí" : "No";

    const badges = {
      registration: '<span class="badge lime">Inscripción</span>',
      in_progress: '<span class="badge green">En juego</span>',
      finished: '<span class="badge">Finalizado</span>'
    };
    $("a-status-badge").innerHTML = badges[t.status] || "";

    $("ctl-reg-open").checked = t.registration_open;
    $("ctl-visible").checked = t.bracket_visible;
    $("ctl-text").textContent =
      t.status === "registration"
        ? `Fase de inscripción: ${state.pairs.length} de ${t.target_pairs} parejas apuntadas.`
        : t.status === "in_progress"
        ? `Torneo en juego: ${played} partidos jugados, ${pending} pendientes.`
        : "Torneo finalizado.";

    // config
    $("cfg-name").value = t.name;
    $("cfg-club").value = t.club;
    $("cfg-target").value = t.target_pairs;
    $("cfg-doublefinal").checked = t.double_final;
    $("cfg-cats").value = cats().join(", ");

    // sorteo: selector de categoria con su estado
    const prevDraw = $("draw-cat").value;
    $("draw-cat").innerHTML = cats().map(c => {
      const n = state.pairs.filter(p => p.category === c).length;
      const drawn = state.matches.some(m => m.category === c);
      return `<option value="${esc(c)}" ${c === prevDraw ? "selected" : ""}>${esc(c)} — ${n} parejas${drawn ? " · cuadro creado" : ""}</option>`;
    }).join("");

    // calendario
    const sc = t.schedule_config || {};
    renderDays(sc.days || []);
    $("cfg-start").value = sc.start || "09:00";
    $("cfg-end").value = sc.end || "21:00";
    $("cfg-minutes").value = sc.match_minutes || 60;
    $("cfg-courts").value = (sc.courts || ["Pista 1"]).join(", ");

    renderPairs();
    renderMatches();
    renderBracket();
    $("btn-draw").disabled = state.matches.length > 0;
  }

  // ---------- control ----------
  $("ctl-reg-open").addEventListener("change", async e => {
    try {
      await PadelAPI.adminUpdateSettings(pass, { registration_open: e.target.checked });
      showMsg("ctl-msg", "Guardado", true);
      refresh();
    } catch (err) { showMsg("ctl-msg", err.message, false); refresh(); }
  });
  $("ctl-visible").addEventListener("change", async e => {
    try {
      await PadelAPI.adminUpdateSettings(pass, { bracket_visible: e.target.checked });
      showMsg("ctl-msg", e.target.checked ? "Cuadro publicado: ya lo ven los participantes" : "Cuadro oculto", true);
      refresh();
    } catch (err) { showMsg("ctl-msg", err.message, false); refresh(); }
  });

  // ---------- sorteo (por categoria) ----------
  $("btn-draw").addEventListener("click", async () => {
    const cat = $("draw-cat").value;
    const catPairs = state.pairs.filter(p => p.category === cat);
    const n = catPairs.length;
    if (n < 2) return showMsg("draw-msg", `Hacen falta al menos 2 parejas en ${cat}`, false);
    if (!confirm(`Se sorteará el cuadro de "${cat}" con ${n} parejas. ¿Continuar?`)) return;
    try {
      // barajar (sorteo)
      const ids = catPairs.map(p => p.id);
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      const matches = PadelBracket.generate(ids, state.tournament.double_final);
      // prefijo por categoria para que los codigos sean unicos entre cuadros
      const ci = cats().indexOf(cat) + 1;
      const pref = c => (c ? `${ci}·${c}` : c);
      for (const m of matches) {
        m.code = pref(m.code);
        m.win_next_code = pref(m.win_next_code);
        m.lose_next_code = pref(m.lose_next_code);
      }
      const seeds = {};
      ids.forEach((id, i) => (seeds[id] = i + 1));
      const r = await PadelAPI.adminCreateBracket(pass, seeds, matches, cat);
      showMsg("draw-msg", `Cuadro de ${cat} creado: ${r.matches} partidos. Programa el calendario y publica el cuadro cuando quieras.`, true);
      refresh();
    } catch (e) {
      showMsg("draw-msg", e.message, false);
    }
  });

  $("btn-reset").addEventListener("click", async () => {
    const cat = $("draw-cat").value;
    if (!confirm(`Esto BORRA el cuadro y los resultados de "${cat}" (las parejas se conservan). ¿Seguro?`)) return;
    if (!confirm("Última confirmación: ¿reiniciar este cuadro?")) return;
    try {
      await PadelAPI.adminResetBracket(pass, cat);
      showMsg("draw-msg", `Cuadro de ${cat} reiniciado`, true);
      refresh();
    } catch (e) { showMsg("draw-msg", e.message, false); }
  });

  // ---------- parejas ----------
  function renderPairs() {
    $("pairs-hint").textContent = `${state.pairs.length} de ${state.tournament.target_pairs} (máx. 200)`;
    let html = `<tr><th>#</th><th>Jugadores</th><th>Categoría</th><th>Teléfono</th><th>Código</th><th></th></tr>`;
    state.pairs.forEach((p, i) => {
      html += `<tr>
        <td>${p.seed || i + 1}</td>
        <td>${esc(p.player1)} y ${esc(p.player2)}</td>
        <td>${esc(p.category || "—")}</td>
        <td>${esc(p.phone || "—")}</td>
        <td><code>${p.secret_code}</code></td>
        <td class="row-actions">
          <button class="btn small secondary" data-edit-pair="${p.id}">✏️</button>
          <button class="btn small danger" data-del-pair="${p.id}">🗑️</button>
        </td></tr>`;
    });
    $("pairs-table").innerHTML = html;
    document.querySelectorAll("[data-edit-pair]").forEach(b =>
      b.addEventListener("click", () => openPairModal(parseInt(b.dataset.editPair, 10))));
    document.querySelectorAll("[data-del-pair]").forEach(b =>
      b.addEventListener("click", async () => {
        const p = state.pairs.find(x => x.id === parseInt(b.dataset.delPair, 10));
        if (!confirm(`¿Borrar a ${p.player1} y ${p.player2}?`)) return;
        try { await PadelAPI.adminDeletePair(pass, p.id); refresh(); }
        catch (e) { alert(e.message); }
      }));
  }

  let editingPair = null;
  function openPairModal(id) {
    editingPair = id ? state.pairs.find(p => p.id === id) : null;
    $("pm-title").textContent = editingPair ? "Editar pareja" : "Nueva pareja";
    $("pm-p1").value = editingPair ? editingPair.player1 : "";
    $("pm-p2").value = editingPair ? editingPair.player2 : "";
    $("pm-phone").value = editingPair ? editingPair.phone : "";
    const cur = editingPair ? editingPair.category : cats()[0];
    $("pm-cat").innerHTML = cats().map(c => `<option ${c === cur ? "selected" : ""}>${esc(c)}</option>`).join("");
    $("pm-msg").className = "msg";
    $("pair-modal").classList.remove("hidden");
  }
  $("btn-add-pair").addEventListener("click", () => openPairModal(null));
  $("pm-close").addEventListener("click", () => $("pair-modal").classList.add("hidden"));
  $("pm-save").addEventListener("click", async () => {
    try {
      if (editingPair) {
        await PadelAPI.adminUpdatePair(pass, editingPair.id, $("pm-p1").value, $("pm-p2").value, $("pm-phone").value, $("pm-cat").value);
      } else {
        await PadelAPI.adminAddPair(pass, $("pm-p1").value, $("pm-p2").value, $("pm-phone").value, $("pm-cat").value);
      }
      $("pair-modal").classList.add("hidden");
      refresh();
    } catch (e) { showMsg("pm-msg", e.message, false); }
  });

  // ---------- calendario ----------
  let days = [];
  function renderDays(list) {
    days = list.slice().sort();
    $("days-list").innerHTML = days.length
      ? days.map(d => `<span class="badge lime" style="margin:0 0.3rem 0.3rem 0">${d}
          <a href="#" data-del-day="${d}" style="color:inherit;text-decoration:none"> ✕</a></span>`).join("")
      : '<span class="hint">Sin días todavía</span>';
    document.querySelectorAll("[data-del-day]").forEach(a =>
      a.addEventListener("click", e => {
        e.preventDefault();
        days = days.filter(d => d !== a.dataset.delDay);
        renderDays(days);
      }));
  }
  $("btn-add-day").addEventListener("click", () => {
    const d = $("new-day").value;
    if (d && !days.includes(d)) { days.push(d); renderDays(days); }
  });
  $("btn-save-schedule").addEventListener("click", async () => {
    const cfg = {
      days,
      start: $("cfg-start").value || "09:00",
      end: $("cfg-end").value || "21:00",
      match_minutes: parseInt($("cfg-minutes").value, 10) || 60,
      courts: $("cfg-courts").value.split(",").map(s => s.trim()).filter(Boolean)
    };
    if (!cfg.courts.length) cfg.courts = ["Pista 1"];
    try {
      await PadelAPI.adminUpdateSettings(pass, { schedule_config: cfg });
      showMsg("cal-msg", "Calendario guardado", true);
      refresh();
    } catch (e) { showMsg("cal-msg", e.message, false); }
  });

  // programacion automatica
  $("btn-autoschedule").addEventListener("click", async () => {
    const t = state.tournament, sc = t.schedule_config || {};
    if (!state.matches.length) return showMsg("auto-msg", "Primero sortea el cuadro", false);
    if (!(sc.days || []).length) return showMsg("auto-msg", "Añade al menos un día de juego y guarda el calendario", false);

    // generar huecos: dia x hora x pista, en orden
    const slots = [];
    const minutes = sc.match_minutes || 60;
    for (const day of sc.days.slice().sort()) {
      let cur = new Date(`${day}T${sc.start || "09:00"}:00`);
      const end = new Date(`${day}T${sc.end || "21:00"}:00`);
      while (cur.getTime() + minutes * 60000 <= end.getTime() + 1) {
        for (const court of sc.courts || ["Pista 1"]) {
          slots.push({ time: new Date(cur), court, used: false });
        }
        cur = new Date(cur.getTime() + minutes * 60000);
      }
    }

    // partidos a programar, en orden de etapa
    const toSchedule = state.matches
      .filter(m => !["void", "bye", "played"].includes(m.status) && !m.slot1_void && !m.slot2_void)
      .sort((a, b) => a.stage - b.stage || (a.bracket > b.bracket ? 1 : -1) || a.position - b.position);

    const byCode = {};
    for (const m of state.matches) byCode[m.code] = m;
    const assigned = {}; // code -> time
    const items = [];
    let failed = 0;
    for (const m of toSchedule) {
      // hora minima: despues de los partidos que lo alimentan
      let minTime = 0;
      for (const f of state.matches) {
        if ((f.win_next_code === m.code || f.lose_next_code === m.code) && assigned[f.code]) {
          minTime = Math.max(minTime, assigned[f.code].getTime());
        }
      }
      const slot = slots.find(s => !s.used && s.time.getTime() > minTime);
      if (!slot) { failed++; continue; }
      slot.used = true;
      assigned[m.code] = slot.time;
      items.push({ id: m.id, scheduled_at: slot.time.toISOString(), court: slot.court });
    }
    if (!items.length) return showMsg("auto-msg", "No hay huecos suficientes: añade más días, horas o pistas", false);
    try {
      await PadelAPI.adminSchedule(pass, items);
      showMsg("auto-msg",
        failed
          ? `Programados ${items.length} partidos. ⚠️ Faltan huecos para ${failed}: añade más días/horas/pistas y repite.`
          : `Programados ${items.length} partidos ✔`, !failed);
      refresh();
    } catch (e) { showMsg("auto-msg", e.message, false); }
  });

  // ---------- partidos ----------
  const STATUS_LABEL = {
    pending: "Esperando cruces", ready: "Listo para jugar", played: "Jugado",
    bye: "Bye (pasa)", void: "—"
  };
  function pairLabel(id) {
    const p = state.pairs.find(x => x.id === id);
    return p ? `${p.player1} / ${p.player2}` : "—";
  }
  function renderMatches() {
    if (!state.matches.length) {
      $("matches-table").innerHTML = `<tr><td class="hint">Aún no hay cuadro. Sortéalo en la pestaña Control.</td></tr>`;
      return;
    }
    const multiCat = cats().length > 1;
    let html = `<tr><th>Partido</th>${multiCat ? "<th>Categoría</th>" : ""}<th>Pareja 1</th><th>Pareja 2</th><th>Estado</th><th>Resultado</th><th>Horario</th></tr>`;
    const ms = state.matches.filter(m => m.status !== "void")
      .sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : 0) ||
        a.stage - b.stage || (a.bracket > b.bracket ? 1 : -1) || a.position - b.position);
    for (const m of ms) {
      const winName = m.winner_id ? pairLabel(m.winner_id) : "";
      html += `<tr data-open-match="${m.id}" style="cursor:pointer">
        <td><b>${PadelBracket.displayCode(m.code)}</b>${m.bracket === "L" ? ' <span class="hint">repesca</span>' : ""}</td>
        ${multiCat ? `<td>${esc(m.category)}</td>` : ""}
        <td>${m.pair1_id ? esc(pairLabel(m.pair1_id)) : m.slot1_void ? "<i>bye</i>" : "<i>por decidir</i>"}</td>
        <td>${m.pair2_id ? esc(pairLabel(m.pair2_id)) : m.slot2_void ? "<i>bye</i>" : "<i>por decidir</i>"}</td>
        <td>${STATUS_LABEL[m.status] || m.status}</td>
        <td>${m.winner_id ? "🏆 " + esc(winName) + (m.score ? " · " + esc(m.score) : "") : "—"}</td>
        <td>${PadelBracket.fmtWhen(m) || "—"}</td></tr>`;
    }
    $("matches-table").innerHTML = html;
    document.querySelectorAll("[data-open-match]").forEach(r =>
      r.addEventListener("click", () => openMatchModal(parseInt(r.dataset.openMatch, 10))));
  }

  // ---------- modal partido ----------
  let modalMatch = null;
  function openMatchModal(id) {
    const m = state.matches.find(x => x.id === id);
    if (!m) return;
    modalMatch = m;
    $("mm-title").textContent = `Partido ${PadelBracket.displayCode(m.code)} (${m.category})`;
    $("mm-players").textContent =
      `${m.pair1_id ? pairLabel(m.pair1_id) : "por decidir"}  vs  ${m.pair2_id ? pairLabel(m.pair2_id) : "por decidir"}`;
    const opts = [m.pair1_id, m.pair2_id].filter(Boolean)
      .map(pid => `<option value="${pid}">${esc(pairLabel(pid))}</option>`);
    $("mm-winner").innerHTML = opts.join("") || "<option value=''>—</option>";
    if (m.winner_id) $("mm-winner").value = m.winner_id;
    $("mm-score").value = m.score || "";
    $("mm-save-result").disabled = !(m.pair1_id && m.pair2_id);
    if (m.scheduled_at) {
      const d = new Date(m.scheduled_at);
      const pad = n => String(n).padStart(2, "0");
      $("mm-when").value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } else $("mm-when").value = "";
    const courts = (state.tournament.schedule_config || {}).courts || ["Pista 1"];
    $("mm-court").innerHTML = courts.map(c => `<option ${c === m.court ? "selected" : ""}>${esc(c)}</option>`).join("");
    $("mm-msg").className = "msg";
    $("match-modal").classList.remove("hidden");
  }
  $("mm-close").addEventListener("click", () => $("match-modal").classList.add("hidden"));
  $("mm-save-result").addEventListener("click", async () => {
    if (!modalMatch) return;
    const w = parseInt($("mm-winner").value, 10);
    if (!w) return showMsg("mm-msg", "Elige ganador", false);
    try {
      await PadelAPI.adminSetResult(pass, modalMatch.id, w, $("mm-score").value.trim());
      $("match-modal").classList.add("hidden");
      refresh();
    } catch (e) { showMsg("mm-msg", e.message, false); }
  });
  $("mm-save-schedule").addEventListener("click", async () => {
    if (!modalMatch) return;
    const v = $("mm-when").value;
    try {
      await PadelAPI.adminSchedule(pass, [{
        id: modalMatch.id,
        scheduled_at: v ? new Date(v).toISOString() : "",
        court: $("mm-court").value
      }]);
      $("match-modal").classList.add("hidden");
      refresh();
    } catch (e) { showMsg("mm-msg", e.message, false); }
  });

  // ---------- cuadro ----------
  function renderBracket() {
    if (!state.matches.length) {
      $("a-cat-chips").innerHTML = "";
      $("a-bracket-area").innerHTML = '<p class="hint">Aún no hay cuadro. Genera el sorteo desde la pestaña Control.</p>';
      return;
    }
    const withMatches = cats().filter(c => state.matches.some(m => m.category === c));
    if (!currentCat || !withMatches.includes(currentCat)) currentCat = withMatches[0];
    $("a-cat-chips").innerHTML = withMatches.length > 1
      ? withMatches.map(c =>
          `<button class="cat-chip ${c === currentCat ? "active" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("")
      : "";
    document.querySelectorAll("#a-cat-chips [data-cat]").forEach(b =>
      b.addEventListener("click", () => { currentCat = b.dataset.cat; renderBracket(); }));
    PadelBracket.render(
      $("a-bracket-area"),
      state.matches.filter(m => m.category === currentCat),
      state.pairs, { clickable: true }
    );
    document.querySelectorAll("#a-bracket-area .match-card[data-clickable]").forEach(c =>
      c.addEventListener("click", () => openMatchModal(parseInt(c.dataset.match, 10))));
  }

  // ---------- config ----------
  $("btn-save-config").addEventListener("click", async () => {
    try {
      const catList = $("cfg-cats").value.split(",").map(s => s.trim()).filter(Boolean);
      await PadelAPI.adminUpdateSettings(pass, {
        name: $("cfg-name").value.trim(),
        club: $("cfg-club").value.trim(),
        target_pairs: parseInt($("cfg-target").value, 10) || 16,
        double_final: $("cfg-doublefinal").checked,
        categories: catList.length ? catList : ["General"]
      });
      showMsg("cfg-msg", "Guardado", true);
      refresh();
    } catch (e) { showMsg("cfg-msg", e.message, false); }
  });
  $("btn-change-pass").addEventListener("click", async () => {
    const np = $("cfg-newpass").value;
    try {
      await PadelAPI.adminChangePassword(pass, np);
      pass = np;
      sessionStorage.setItem("padel_admin_pass", np);
      $("cfg-newpass").value = "";
      showMsg("pass-msg", "Contraseña cambiada", true);
    } catch (e) { showMsg("pass-msg", e.message, false); }
  });

  // ---------- auto-login si hay sesion ----------
  if (pass) {
    PadelAPI.adminLogin(pass)
      .then(() => {
        $("login-view").classList.add("hidden");
        $("panel-view").classList.remove("hidden");
        refresh();
      })
      .catch(() => sessionStorage.removeItem("padel_admin_pass"));
  }
  setInterval(() => {
    if (!$("panel-view").classList.contains("hidden") &&
        $("match-modal").classList.contains("hidden") &&
        $("pair-modal").classList.contains("hidden")) {
      refresh().catch(() => {});
    }
  }, 45000);
})();
