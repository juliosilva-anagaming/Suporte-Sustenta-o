function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = value;
}

/* ---------- Render da tabela do Painel Geral ---------- */
function renderTabela(linhas) {
  const tb = document.getElementById("corpo-tabela");
  if (!tb) return;

  if (!linhas || linhas.length === 0) {
    tb.innerHTML = `<tr><td colspan="7" class="loading">Nenhum chamado aberto hoje.</td></tr>`;
    return;
  }

  tb.innerHTML = linhas.map((l) => {
    const cdtHtml = l.cdt?.url
      ? `<a href="${l.cdt.url}" target="_blank" rel="noopener" class="link-cdt">${l.cdt.texto}</a>`
      : (l.cdt?.texto || "");

    const statusClass = (l.status || "").includes("FRAUDADOR") ? "txt-critico" : "";
    const verifHtml = l.verificacao ? `<span class="txt-verif">${l.verificacao}</span>` : "";

    return `
      <tr>
        <td style="font-weight:900;">${l.casa_2 || ""}</td>
        <td style="font-weight:900;">${l.id || ""}</td>
        <td>${cdtHtml}</td>
        <td style="font-weight:800;">${l.jogo || ""}</td>
        <td class="resumo-cell">${l.resumo || ""}</td>
        <td class="${statusClass}" style="font-weight:900;">${l.status || ""}</td>
        <td style="font-weight:900;">${verifHtml}</td>
      </tr>
    `;
  }).join("");
}

/* ---------- Atualização do Painel Geral via Apps Script ---------- */
async function atualizarPainel() {
  try {
    const url = window.APP_CONFIG?.SLA_ENDPOINT;

    if (!url) {
      console.warn("Defina APP_CONFIG.SLA_ENDPOINT em assests/js/config.js");
      return;
    }

    const d = await fetchPainelDadosJsonp(url);

    if (d?.erro) {
      console.error(d.erro);
      renderTabela([]);
      return;
    }

    setText("m-aguard", d.contadores?.aguardando ?? 0);
    setText("m-atend",  d.contadores?.atendimento ?? 0);
    setText("m-fraud",  d.contadores?.fraudadores ?? 0);
    setText("m-poss",   d.contadores?.possiveis ?? 0);
    setText("m-verif",  d.contadores?.verificacao ?? 0);

    renderTabela(d.linhas);
  } catch (err) {
    console.error(err);
  }
}

/* ---------- Tabs: Painel Geral / Looker ---------- */
function initTabs() {
  const tabPainel = document.getElementById("tab-painel");
  const tabLooker = document.getElementById("tab-looker");

  const viewPainel = document.getElementById("view-painel");
  const viewLooker = document.getElementById("view-looker");

  function showPainel() {
    tabPainel?.classList.add("is-active");
    tabLooker?.classList.remove("is-active");
    viewPainel?.classList.add("is-visible");
    viewLooker?.classList.remove("is-visible");
  }

  function showLooker() {
    tabLooker?.classList.add("is-active");
    tabPainel?.classList.remove("is-active");
    viewLooker?.classList.add("is-visible");
    viewPainel?.classList.remove("is-visible");
  }

  tabPainel?.addEventListener("click", showPainel);
  tabLooker?.addEventListener("click", showLooker);
}

/* ---------- Sync: chama FastAPI Mongo->Sheets e recarrega Looker ---------- */
// Normaliza várias entradas de data (aceita 'YYYY-MM-DD', 'D/M/YYYY', 'DD/MM/YYYY' e 'DD-MM-YYYY') e retorna ISO 'YYYY-MM-DD' ou null
function normalizeDateString(s) {
  if (!s) return null;
  s = s.trim();

  // YYYY-MM-DD
  const r1 = /^\d{4}-\d{2}-\d{2}$/;
  if (r1.test(s)) return s;

  // D/M/YYYY ou DD/MM/YYYY ou com '-'
  const r2 = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
  const m = s.match(r2);
  if (m) {
    const d = String(m[1]).padStart(2, "0");
    const mo = String(m[2]).padStart(2, "0");
    const y = m[3];
    // valida simples de data
    const date = new Date(`${y}-${mo}-${d}`);
    if (!isNaN(date.getTime())) return `${y}-${mo}-${d}`;
  }

  // fallback: tente Date parsing
  const tryDate = new Date(s);
  if (!isNaN(tryDate.getTime())) {
    const yyyy = tryDate.getFullYear();
    const mm = String(tryDate.getMonth() + 1).padStart(2, "0");
    const dd = String(tryDate.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}

// Formata ISO 'YYYY-MM-DD' para exibição 'DD/MM/YYYY'
function formatIsoToDisplayDMY(iso) {
  if (!iso) return "";
  const p = iso.split("-");
  if (p.length !== 3) return iso;
  return `${p[2]}/${p[1]}/${p[0]}`;
}

function initSyncBarDefaultDates() {
  const dtIni = document.getElementById("dt-inicio");
  const dtFim = document.getElementById("dt-fim");
  if (!dtIni || !dtFim) return;

  const hoje = new Date();
  const yyyy = hoje.getFullYear();
  const mm = String(hoje.getMonth() + 1).padStart(2, "0");
  const dd = String(hoje.getDate()).padStart(2, "0");
  const iso = `${yyyy}-${mm}-${dd}`;

  // Mostrar data como DD/MM/YYYY no campo para melhor UX (mas sempre normalizamos ao enviar)
  const display = `${dd}/${mm}/${yyyy}`;
  if (!dtIni.value) dtIni.value = display;
  if (!dtFim.value) dtFim.value = display;

  // permite digitar manualmente e normaliza na saída do campo
  [dtIni, dtFim].forEach((el) => {
    el.addEventListener('blur', () => {
      const norm = normalizeDateString(el.value);
      if (norm) {
        // exibimos no formato DD/MM/YYYY
        el.value = formatIsoToDisplayDMY(norm);
        document.getElementById('sync-status').innerText = '';
      } else {
        // avisa sem bloquear o usuário
        document.getElementById('sync-status').innerText = 'Formato de data inválido. Use DD/MM/YYYY ou YYYY-MM-DD.';
      }
    });

    // permite apenas números, '/', '-' (melhora UX)
    el.addEventListener('input', () => {
      el.value = el.value.replace(/[^0-9\-\/]*/g, '');
    });

    // se o campo for preenchido por um datepicker que fornece YYYY-MM-DD, normalizamos na blur
  });
}

async function sincronizarMongoParaSheets() {
  const baseRaw = window.APP_CONFIG?.SYNC_API_BASE ?? "";
  let base = baseRaw.replace(/\/$/, "");
  const statusEl = document.getElementById("sync-status");
  const btn = document.getElementById("btn-sync");

  // Se o APP_CONFIG.SYNC_API_BASE estiver vazio e a página foi aberta como file://,
  // mostrar instrução clara (evita "Failed to fetch" quando a pessoa abriu o HTML localmente)
  if (!baseRaw && window.location && window.location.protocol === 'file:') {
    if (statusEl) statusEl.innerText = "Abra esta página via http://localhost:8000/ (inicie o servidor FastAPI). Não abra o arquivo HTML diretamente.";
    if (btn) btn.disabled = false;
    return;
  }

  // Se base não foi configurada, tente usar origin (caso a página esteja servida por HTTP(S))
  if (!baseRaw) {
    try {
      const origin = window.location.origin;
      if (origin && origin !== 'null') base = origin;
    } catch (e) {
      // ignore
    }
  }

  let inicio = document.getElementById("dt-inicio")?.value;
  let fim = document.getElementById("dt-fim")?.value;

  inicio = normalizeDateString(inicio);
  fim = normalizeDateString(fim);

  if (!inicio || !fim) {
    if (statusEl) statusEl.innerText = "Formato inválido. Use YYYY-MM-DD ou DD/MM/YYYY.";
    return;
  }

  // Payload para agendar em background (POST /sync)
  const payload = {
    inicio,
    fim,
    hora_inicio: "00:00",
    hora_fim: "23:59",
    debug: false,
  };

  const url = `${base.replace(/\/$/, "")}/sync`;

  try {
    if (btn) btn.disabled = true;
    if (statusEl) statusEl.innerText = "Agendando sincronização em background…";

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      const msg = data?.detail || data?.message || `HTTP ${resp.status}`;
      throw new Error(msg);
    }

    // Sucesso: operação agendada
    if (statusEl) statusEl.innerText = data?.message || "Sincronização agendada. Verifique logs para status.";

    // inicia polling para checar /last-sync e atualizar a UI quando terminar
    (function startLastSyncPolling(){
      const pollInterval = 3000;
      let attempts = 0;
      const maxAttempts = 120; // 6 minutos max

      async function poll() {
        attempts += 1;
        try {
          const resp = await fetch(`${base}/last-sync`);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const s = await resp.json();
          if (s.status === 'running' || s.status === 'queued') {
            if (statusEl) statusEl.innerText = `Sincronização: ${s.status} - ${s.message}`;
            if (attempts < maxAttempts) setTimeout(poll, pollInterval);
            else if (statusEl) statusEl.innerText = `Sincronização em andamento há muito tempo... verifique logs.`;
            return;
          }

          // finalizado ou falhou
          if (s.status === 'done') {
            if (statusEl) statusEl.innerText = `Concluído: ${s.linhas} linhas. ${s.message}`;
            // Recarrega Looker e Painel
            const iframe = document.getElementById("looker-iframe");
            if (iframe) iframe.src = iframe.src;
            await atualizarPainel();
            return;
          }

          if (s.status === 'failed') {
            if (statusEl) statusEl.innerText = `Falha: ${s.error || s.message}`;
          }
        } catch (err) {
          console.error('Erro no polling /last-sync', err);
          if (statusEl) statusEl.innerText = `Erro ao checar status: ${err.message}`;
        }
      }

      // start
      setTimeout(poll, 2000);
    })();

  } catch (err) {
    console.error(err);
    if (statusEl) statusEl.innerText = `Falha: ${err.message}`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

function initSyncButton() {
  const btn = document.getElementById("btn-sync");
  if (!btn) return;
  btn.addEventListener("click", sincronizarMongoParaSheets);
}

/* ---------- Boot ---------- */
initTabs();
initSyncBarDefaultDates();
initSyncButton();

atualizarPainel();
setInterval(atualizarPainel, window.APP_CONFIG?.REFRESH_MS ?? 600000);
