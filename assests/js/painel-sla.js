/* =========================================================
   painel-sla.js (COMPLETO - com fallback)
   Caminho:
   SustentaHub Ana Gaming/assests/js/painel-sla.js
   ========================================================= */

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = value;
}

function getBrandClass(brandRaw) {
  const b = (brandRaw || "").toString().trim().toLowerCase();
  if (!b) return "";
  if (b.includes("incidente")) return "brand-incidente";
  if (b.includes("a7kbetbr")) return "brand-a7k";
  if (b.includes("cassinobetbr")) return "brand-cassino";
  if (b.includes("verabetbr")) return "brand-vera";
  return "";
}

/**
 * Recebe minutos (number) e formata:
 *  - 5m
 *  - 2h 05m
 *  - 1d 2h 05m
 */
function formatAvgTime(value) {
  if (value === null || value === undefined || value === "") return "--";
  if (typeof value !== "number" || !isFinite(value)) return String(value);

  const totalMin = Math.max(0, Math.round(value));
  const days = Math.floor(totalMin / (24 * 60));
  const remAfterDays = totalMin % (24 * 60);
  const hours = Math.floor(remAfterDays / 60);
  const mins = remAfterDays % 60;

  if (days > 0) return `${days}d ${hours}h ${String(mins).padStart(2, "0")}m`;
  if (hours > 0) return `${hours}h ${String(mins).padStart(2, "0")}m`;
  return `${mins}m`;
}

/* ---------- parse Tempo de Entrega ("0 dias 15 horas 50 min") ---------- */
function parseTempoEntregaToMinutes(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && isFinite(v)) return v;

  const s = String(v).trim().toLowerCase();
  if (!s) return null;

  const mDias = s.match(/(\d+)\s*dia[s]?/);
  const mHoras = s.match(/(\d+)\s*hora[s]?/);
  const mMin = s.match(/(\d+)\s*min/);

  if (mDias || mHoras || mMin) {
    const dias = mDias ? parseInt(mDias[1], 10) : 0;
    const horas = mHoras ? parseInt(mHoras[1], 10) : 0;
    const mins = mMin ? parseInt(mMin[1], 10) : 0;
    return (dias * 24 * 60) + (horas * 60) + mins;
  }
  return null;
}

function getTempoEntregaFromLinha(l) {
  // Cabeçalho exato: "Tempo de Entrega"
  return (
    l?.["Tempo de Entrega"] ??
    l?.["Tempo de entrega"] ??
    l?.tempo_entrega ??
    l?.tempo_de_entrega ??
    l?.tempoEntrega ??
    null
  );
}

function calcAvgEntregaMinutes(linhas) {
  if (!Array.isArray(linhas) || linhas.length === 0) return null;
  const mins = linhas
    .map(l => parseTempoEntregaToMinutes(getTempoEntregaFromLinha(l)))
    .filter(x => typeof x === "number" && isFinite(x) && x >= 0);

  if (mins.length === 0) return null;
  const sum = mins.reduce((a, b) => a + b, 0);
  return sum / mins.length;
}

/* ---------- “Atualizado há...” ---------- */
let lastSuccessfulUpdateAt = null;
let updatedTickerStarted = false;

function humanizeElapsed(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function startUpdatedTicker() {
  if (updatedTickerStarted) return;
  updatedTickerStarted = true;

  setInterval(() => {
    const el = document.getElementById("m-updated-bottom");
    if (!el) return;

    if (!lastSuccessfulUpdateAt) {
      setText("m-updated-bottom", "Atualizado há --");
      return;
    }
    setText("m-updated-bottom", `Atualizado há ${humanizeElapsed(Date.now() - lastSuccessfulUpdateAt)}`);
  }, 1000);
}

/* ---------- Render da tabela ---------- */
function renderTabela(linhas) {
  const tb = document.getElementById("corpo-tabela");
  if (!tb) return;

  if (!Array.isArray(linhas) || linhas.length === 0) {
    tb.innerHTML = `<tr><td colspan="8" class="loading">Nenhum chamado aberto hoje.</td></tr>`;
    return;
  }

  tb.innerHTML = linhas.map((l) => {
    const cdtHtml = l?.cdt?.url
      ? `<a href="${l.cdt.url}" target="_blank" rel="noopener" class="link-cdt">${l.cdt.texto}</a>`
      : (l?.cdt?.texto || "");

    const statusStr = l?.status || "";
    const statusClass = statusStr.includes("FRAUDADOR") ? "txt-critico" : "";

    const verifStr = l?.verificacao || "";
    const verifHtml = verifStr ? `<span class="txt-verif">${verifStr}</span>` : "";

    const brand = l?.casa_2 || "";
    const brandClass = getBrandClass(brand);

    const responsavel = l?.responsavel || "";

    return `
      <tr>
        <td class="${brandClass}" style="font-weight:900;">${brand}</td>
        <td style="font-weight:900;">${l?.id || ""}</td>
        <td>${cdtHtml}</td>
        <td style="font-weight:800;">${l?.jogo || ""}</td>
        <td class="resumo-cell">${l?.resumo || ""}</td>
        <td class="${statusClass}" style="font-weight:900;">${statusStr}</td>
        <td style="font-weight:900;">${responsavel}</td>
        <td style="font-weight:900;">${verifHtml}</td>
      </tr>
    `;
  }).join("");
}

/* ---------- Atualização do Painel (Apps Script JSONP) ---------- */
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

    // Cards (mantém seu padrão atual)
    setText("m-aguard", d?.contadores?.aguardando ?? 0);
    setText("m-atend",  d?.contadores?.atendimento ?? 0);
    setText("m-fraud",  d?.contadores?.fraudadores ?? 0);
    setText("m-poss",   d?.contadores?.possiveis ?? 0);
    setText("m-verif",  d?.contadores?.verificacao ?? 0);

    // ===== TOTAL CDT =====
    const totalGeral = d?.metricas?.total_cdt_geral;
    const totalFallback = Array.isArray(d?.linhas) ? d.linhas.length : (d?.contadores?.atendimento ?? 0);
    const totalFinal = (typeof totalGeral === "number" && isFinite(totalGeral) && totalGeral > 0)
      ? totalGeral
      : totalFallback;

    setText("m-total-cdt", totalFinal);

    // ===== TEMPO MÉDIO =====
    const avgBackendMin = d?.metricas?.tempo_medio_cdt_min;
    const avgCalcMin = calcAvgEntregaMinutes(d?.linhas);

    const avgFinal = (typeof avgBackendMin === "number" && isFinite(avgBackendMin) && avgBackendMin > 0)
      ? avgBackendMin
      : avgCalcMin;

    setText("m-avg-cdt", formatAvgTime(avgFinal));

    // ===== Atualizado há... =====
    const iso = d?.metricas?.atualizadoEm;
    if (iso) {
      const t = new Date(iso).getTime();
      lastSuccessfulUpdateAt = !isNaN(t) ? t : Date.now();
    } else {
      lastSuccessfulUpdateAt = Date.now();
    }
    startUpdatedTicker();

    // Tabela (linhas abertas)
    renderTabela(d?.linhas);

  } catch (err) {
    console.error(err);
  }
}

/* ---------- Tabs ---------- */
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

/* ---------- Boot ---------- */
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  atualizarPainel();

  const refresh = window.APP_CONFIG?.REFRESH_MS ?? 600000;
  setInterval(atualizarPainel, refresh);
});
