// Cliente minimo para llamar a las funciones RPC de Supabase
(function () {
  const cfg = window.PADEL_CONFIG;

  async function rpc(fn, args = {}) {
    const res = await fetch(`${cfg.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: cfg.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify(args)
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (data && (data.message || data.hint || data.error)) || `Error ${res.status}`;
      throw new Error(msg.replace(/^.*?:\s*/, m => m));
    }
    return data;
  }

  // Confirmacion y aviso propios (los dialogos nativos de Chrome se pueden
  // bloquear con "impedir mas cuadros de dialogo" y los botones mueren en silencio)
  window.padelConfirm = text =>
    new Promise(resolve => {
      const back = document.createElement("div");
      back.className = "modal-back";
      const modal = document.createElement("div");
      modal.className = "modal";
      const h = document.createElement("h3");
      h.textContent = "🤔 ¿Confirmas?";
      const p = document.createElement("p");
      p.textContent = text;
      p.style.whiteSpace = "pre-line";
      p.style.margin = "0.6rem 0";
      const yes = document.createElement("button");
      yes.className = "btn";
      yes.textContent = "Sí, adelante";
      const no = document.createElement("button");
      no.className = "btn secondary";
      no.textContent = "Cancelar";
      no.style.marginLeft = "0.5rem";
      modal.append(h, p, yes, no);
      back.appendChild(modal);
      document.body.appendChild(back);
      yes.onclick = () => { back.remove(); resolve(true); };
      no.onclick = () => { back.remove(); resolve(false); };
    });

  window.padelAlert = text =>
    new Promise(resolve => {
      const back = document.createElement("div");
      back.className = "modal-back";
      const modal = document.createElement("div");
      modal.className = "modal";
      const p = document.createElement("p");
      p.textContent = text;
      p.style.whiteSpace = "pre-line";
      const ok = document.createElement("button");
      ok.className = "btn";
      ok.textContent = "Entendido";
      modal.append(p, ok);
      back.appendChild(modal);
      document.body.appendChild(back);
      ok.onclick = () => { back.remove(); resolve(); };
    });

  window.PadelAPI = {
    rpc,
    getState: () => rpc("padel_get_state"),
    signup: (p1, p2, phone, category) =>
      rpc("padel_signup", { p_player1: p1, p_player2: p2, p_phone: phone, p_category: category || null }),
    myPair: code => rpc("padel_my_pair", { p_code: code }),
    reportResult: (code, matchId, winnerId, score) =>
      rpc("padel_report_result", { p_code: code, p_match: matchId, p_winner: winnerId, p_score: score }),
    withdraw: (code, matchId) => rpc("padel_withdraw", { p_code: code, p_match: matchId }),

    adminLogin: pass => rpc("padel_admin_login", { p_pass: pass }),
    adminState: pass => rpc("padel_admin_state", { p_pass: pass }),
    adminUpdateSettings: (pass, patch) => rpc("padel_admin_update_settings", { p_pass: pass, p: patch }),
    adminChangePassword: (pass, newPass) => rpc("padel_admin_change_password", { p_pass: pass, p_new: newPass }),
    adminAddPair: (pass, p1, p2, phone, category) =>
      rpc("padel_admin_add_pair", { p_pass: pass, p_player1: p1, p_player2: p2, p_phone: phone, p_category: category || null }),
    adminUpdatePair: (pass, id, p1, p2, phone, category) =>
      rpc("padel_admin_update_pair", { p_pass: pass, p_id: id, p_player1: p1, p_player2: p2, p_phone: phone, p_category: category || null }),
    adminDeletePair: (pass, id) => rpc("padel_admin_delete_pair", { p_pass: pass, p_id: id }),
    adminCreateBracket: (pass, seeds, matches, category) =>
      rpc("padel_admin_create_bracket", { p_pass: pass, p_seeds: seeds, p_matches: matches, p_category: category }),
    adminResetBracket: (pass, category) =>
      rpc("padel_admin_reset_bracket", { p_pass: pass, p_category: category || null }),
    adminFullReset: pass => rpc("padel_admin_full_reset", { p_pass: pass }),
    adminSetResult: (pass, matchId, winnerId, score) =>
      rpc("padel_admin_set_result", { p_pass: pass, p_match: matchId, p_winner: winnerId, p_score: score }),
    adminSchedule: (pass, items) => rpc("padel_admin_schedule", { p_pass: pass, p_items: items })
  };
})();
